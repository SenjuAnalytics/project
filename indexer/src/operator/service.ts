/**
 * operator/service.ts
 * -----------------------------------------------------------------------------
 * One pass of the operator service. Three duties, split by wallet:
 *
 *   keeper   (KEEPER_PRIVATE_KEY, no role on any contract)
 *            finalize battles and league weeks once their challenge window is
 *            over, run due buyback tranches, and once a day sweep the fees the
 *            pool hook holds and release pending pots past their expiry. All of
 *            these are permissionless; the keeper only pays the gas.
 *   operator (OPERATOR_PRIVATE_KEY, the vault's operator role)
 *            post each battle's result and each week's winners from the
 *            deterministic indexer, and book ready tokens for the coming
 *            00:00 UTC, paired by market cap.
 *   watch    (no key) recompute every result still inside its challenge window
 *            and alert when the posted commitment doesn't match, so the guardian
 *            can veto in time. Also alerts when a duty runs late.
 *
 * Every rule runs on chain time. Transactions are simulated first and sent one
 * at a time; a failure is logged, alerted and retried on the next pass.
 */
import type { Address, PublicClient } from "viem";

import type { ResolvedAddresses } from "../config.ts";
import { OUTCOME } from "../config.ts";
import { QualyraBuybackBurnerAbi, QualyraCompetitionVaultAbi, QualyraHookAbi } from "../abi/index.ts";
import { computeBattle, computeWeek } from "../jobs.ts";
import { writeOutputs } from "../outputs.ts";
import { weekEnd } from "../leaderboard.ts";
import { alert } from "./alert.ts";
import { marketCapInAsset, readSnapshot, readTokens, type Snapshot, type Wallet } from "./chain.ts";
import type { ServiceEnv } from "./env.ts";
import {
  BATTLE_CHALLENGE_PERIOD,
  BATTLE_DURATION,
  DAY,
  LEAGUE_CHALLENGE_PERIOD,
  battlesAwaitingResult,
  battlesInChallenge,
  battlesToFinalize,
  bookableTokens,
  bookingOpen,
  expiredPendingToRelease,
  nextBattleStart,
  pairByMarketCap,
  sweepDue,
  tokensToSweep,
  tranchesDue,
  weeksAwaitingWinners,
  weeksInChallenge,
  weeksToFinalize,
  type TokenState,
} from "./plan.ts";
import type { ServiceState } from "./state.ts";

export type Duty = "operator" | "keeper" | "watch";

export interface ServiceContext {
  env: ServiceEnv;
  client: PublicClient;
  resolved: ResolvedAddresses;
  operator?: Wallet;
  keeper?: Wallet;
  state: ServiceState;
  denylist: Set<string>;
}

/** How late a duty may run before the watcher raises it. */
const RESULT_GRACE = 6 * 60 * 60;
const SETTLE_GRACE = 2 * 60 * 60;
const WINNERS_GRACE = 12 * 60 * 60;

const OUTCOME_NAMES = Object.fromEntries(Object.entries(OUTCOME).map(([name, value]) => [value, name]));

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
const utc = (ts: number) => new Date(ts * 1000).toISOString().replace(".000Z", "Z");
const sameHash = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

interface Call {
  address: string;
  abi: unknown;
  functionName: string;
  args: unknown[];
}

function errorText(error: unknown): string {
  const e = error as { shortMessage?: string; message?: string };
  return (e.shortMessage ?? e.message ?? String(error)).split("\n")[0];
}

/** Simulates, then sends and waits for the receipt. Dry runs stop after the simulation. */
async function send(ctx: ServiceContext, role: Wallet["role"], label: string, call: Call): Promise<boolean> {
  const wallet = role === "operator" ? ctx.operator : ctx.keeper;
  if (!wallet) {
    const hint = role === "operator" ? "OPERATOR_PRIVATE_KEY" : "KEEPER_PRIVATE_KEY";
    console.log(`[${ctx.env.dryRun ? "dry-run" : "skip"}] ${role}: ${label} (not simulated: ${hint} is not set)`);
    return false;
  }
  try {
    const { request } = await ctx.client.simulateContract({
      address: call.address as Address,
      abi: call.abi as any,
      functionName: call.functionName,
      args: call.args,
      account: wallet.account,
    } as any);
    if (ctx.env.dryRun) {
      console.log(`[dry-run] ${role}: ${label}`);
      return false;
    }
    const hash = await wallet.client.writeContract(request as any);
    const receipt = await ctx.client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    if (receipt.status !== "success") throw new Error(`reverted in ${hash}`);
    console.log(`[${role}] ${label}: ${hash}`);
    return true;
  } catch (error) {
    await alert(ctx.state, ctx.env.alertWebhookUrl, `tx:${label}`, `${role} could not ${label}: ${errorText(error)}`);
    return false;
  }
}

/** Runs one item of a duty. A failure is alerted and the rest of the pass goes on. */
async function attempt(ctx: ServiceContext, what: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    await alert(ctx.state, ctx.env.alertWebhookUrl, `error:${what}`, `${what} failed: ${errorText(error)}`);
  }
}

/** Results this service posted that are back to empty were vetoed. Stop posting those and ask for a person. */
async function noteVetoes(ctx: ServiceContext, snap: Snapshot): Promise<void> {
  for (const b of snap.battles) {
    const key = `battle:${b.id}`;
    if (!ctx.state.proposed[key] || b.outcome !== OUTCOME.None || b.finalized) continue;
    delete ctx.state.proposed[key];
    if (!ctx.state.vetoedBattles.includes(b.id)) ctx.state.vetoedBattles.push(b.id);
    await alert(ctx.state, ctx.env.alertWebhookUrl, `veto:${key}`,
      `The result posted for battle #${b.id} was vetoed. The service won't post it again; check the dataset, then post by hand.`);
  }
  for (const w of snap.weeks) {
    const key = `week:${w.week}`;
    if (!ctx.state.proposed[key] || w.proposedAt !== 0 || w.finalizedAt !== 0) continue;
    delete ctx.state.proposed[key];
    if (!ctx.state.vetoedWeeks.includes(w.week)) ctx.state.vetoedWeeks.push(w.week);
    await alert(ctx.state, ctx.env.alertWebhookUrl, `veto:${key}`,
      `The winners posted for league week ${w.week} were vetoed. The service won't post them again; check the dataset, then post by hand.`);
  }
}

async function keeperPass(ctx: ServiceContext, snap: Snapshot, tokens: () => Promise<TokenState[]>): Promise<void> {
  const vault = ctx.resolved.competitionVault;
  if (snap.paused) {
    console.log("[keeper] the vault is paused: finalizing, buybacks and week settlement wait.");
  } else {
    for (const b of battlesToFinalize(snap.battles, snap.now)) {
      await send(ctx, "keeper", `finalize battle #${b.id}`, {
        address: vault, abi: QualyraCompetitionVaultAbi, functionName: "finalizeBattle", args: [BigInt(b.id)],
      });
    }
    for (const t of tranchesDue(snap.buybacks, snap.now)) {
      await send(ctx, "keeper", `run a buyback tranche of ${short(t.token)} for battle #${t.battleId}`, {
        address: ctx.resolved.buybackBurner, abi: QualyraBuybackBurnerAbi, functionName: "executeBuyback",
        args: [BigInt(t.battleId), t.token],
      });
    }
    for (const w of weeksToFinalize(snap.weeks, snap.now)) {
      await send(ctx, "keeper", `finalize league week ${w.week}`, {
        address: vault, abi: QualyraCompetitionVaultAbi, functionName: "finalizeWeek", args: [BigInt(w.week)],
      });
    }
  }

  // Sweeps only move fees the hook already holds into the vaults; they keep working while the vault is paused.
  if (sweepDue(snap.now, ctx.state.lastSweepDay, ctx.env.sweepMinuteUtc)) {
    await attempt(ctx, "daily sweep", () => dailySweep(ctx, snap, tokens));
  }
}

/** Moves every token's parked fees into the vaults and hands expired pending pots to the treasury. */
async function dailySweep(ctx: ServiceContext, snap: Snapshot, tokens: () => Promise<TokenState[]>): Promise<void> {
  const vault = ctx.resolved.competitionVault;
  const list = await tokens();
  for (const t of tokensToSweep(list)) {
    await send(ctx, "keeper", `sweep the parked fees of ${short(t.token)}`, {
      address: ctx.resolved.hook, abi: QualyraHookAbi, functionName: "sweepFees", args: [t.token, 0n],
    });
  }
  for (const t of expiredPendingToRelease(list)) {
    await send(ctx, "keeper", `release the expired pending pot of ${short(t.token)}`, {
      address: vault, abi: QualyraCompetitionVaultAbi, functionName: "releaseExpiredPending", args: [t.token, t.asset],
    });
  }
  ctx.state.lastSweepDay = Math.floor(snap.now / DAY);
}

async function operatorPass(ctx: ServiceContext, snap: Snapshot, tokens: () => Promise<TokenState[]>): Promise<void> {
  if (snap.paused) {
    console.log("[operator] the vault is paused: results and bookings wait.");
    return;
  }
  const vault = ctx.resolved.competitionVault;

  for (const b of battlesAwaitingResult(snap.battles, snap.now, new Set(ctx.state.vetoedBattles))) {
    await attempt(ctx, `result of battle #${b.id}`, async () => {
      const job = await computeBattle(ctx.client, ctx.resolved, b.id, ctx.denylist);
      if (!job.window.closed || !job.build) {
        console.log(`[operator] battle #${b.id}: its last blocks are not deep enough yet.`);
        return;
      }
      const { result, dataset, datasetHash, resultHash } = job.build;
      writeOutputs(`battle-${b.id}`, dataset, result, datasetHash, resultHash);
      const posted = await send(ctx, "operator", `post the result of battle #${b.id} (${OUTCOME_NAMES[result.outcome]})`, {
        address: vault, abi: QualyraCompetitionVaultAbi, functionName: "proposeBattleResult",
        args: [BigInt(b.id), result.outcome, result.scoreA, result.scoreB, datasetHash, resultHash],
      });
      if (posted) ctx.state.proposed[`battle:${b.id}`] = resultHash;
    });
  }

  for (const w of weeksAwaitingWinners(snap.firstLeagueWeek, snap.weeks, snap.now, new Set(ctx.state.vetoedWeeks))) {
    await attempt(ctx, `winners of league week ${w.week}`, async () => {
      const job = await computeWeek(ctx.client, ctx.resolved, BigInt(w.week), ctx.denylist);
      if (job.predatesDeploy || !job.window.closed || !job.build) {
        console.log(`[operator] league week ${w.week}: its last blocks are not deep enough yet.`);
        return;
      }
      const { result, dataset, datasetHash, resultHash } = job.build;
      writeOutputs(`week-${w.week}`, dataset, result, datasetHash, resultHash);
      const posted = await send(ctx, "operator", `post the winners of league week ${w.week}`, {
        address: vault, abi: QualyraCompetitionVaultAbi, functionName: "proposeWeeklyWinners",
        args: [BigInt(w.week), result.winners, datasetHash, resultHash],
      });
      if (posted) ctx.state.proposed[`week:${w.week}`] = resultHash;
    });
  }

  if (bookingOpen(snap.now, ctx.env.bookingHourUtc)) {
    await attempt(ctx, "booking", () => book(ctx, snap, tokens));
  }
}

/** Books every pair of ready tokens on the same pair asset for the coming 00:00 UTC, in one transaction. */
async function book(ctx: ServiceContext, snap: Snapshot, tokens: () => Promise<TokenState[]>): Promise<void> {
  const ready = bookableTokens(await tokens());
  const perAsset = new Map<string, number>();
  for (const t of ready) perAsset.set(t.asset.toLowerCase(), (perAsset.get(t.asset.toLowerCase()) ?? 0) + 1);
  const matchable = ready.filter(t => (perAsset.get(t.asset.toLowerCase()) ?? 0) >= 2);
  if (matchable.length === 0) return;

  const candidates = await Promise.all(
    matchable.map(async t => ({
      token: t.token,
      asset: t.asset,
      marketCap: await marketCapInAsset(ctx.client, ctx.resolved, t.token),
    })),
  );
  const pairs = pairByMarketCap(candidates);
  if (pairs.length === 0) return;

  const start = nextBattleStart(snap.now, ctx.env.minBookingLeadSeconds);
  await send(ctx, "operator", `book ${pairs.length} battle(s) starting ${utc(start)}`, {
    address: ctx.resolved.competitionVault, abi: QualyraCompetitionVaultAbi, functionName: "scheduleBattles",
    args: [pairs.map(p => p[0]), pairs.map(p => p[1]), BigInt(start)],
  });
}

async function watchPass(ctx: ServiceContext, snap: Snapshot): Promise<void> {
  const say = (key: string, message: string) => alert(ctx.state, ctx.env.alertWebhookUrl, key, message);

  for (const b of battlesInChallenge(snap.battles, snap.now)) {
    const key = `battle:${b.id}:${b.resultHash}`;
    if (key in ctx.state.verified) continue;
    await attempt(ctx, `check of battle #${b.id}`, async () => {
      const job = await computeBattle(ctx.client, ctx.resolved, b.id, ctx.denylist);
      if (!job.build || !job.window.closed) return;
      const match = sameHash(job.build.datasetHash, b.datasetHash) && sameHash(job.build.resultHash, b.resultHash);
      ctx.state.verified[key] = match;
      if (match) {
        console.log(`[watch] battle #${b.id}: the posted result matches the recompute.`);
        return;
      }
      await say(`mismatch:${key}`,
        `Battle #${b.id}: the posted result (${OUTCOME_NAMES[b.outcome]}) doesn't match the recompute ` +
        `(${OUTCOME_NAMES[job.build.result.outcome]}). The guardian can veto until ${utc(b.proposedAt + BATTLE_CHALLENGE_PERIOD)}.`);
    });
  }

  for (const w of weeksInChallenge(snap.weeks, snap.now)) {
    const key = `week:${w.week}:${w.resultHash}`;
    if (key in ctx.state.verified) continue;
    await attempt(ctx, `check of league week ${w.week}`, async () => {
      const job = await computeWeek(ctx.client, ctx.resolved, BigInt(w.week), ctx.denylist);
      if (!job.build || !job.window.closed) return;
      const match = sameHash(job.build.datasetHash, w.datasetHash) && sameHash(job.build.resultHash, w.resultHash);
      ctx.state.verified[key] = match;
      if (match) {
        console.log(`[watch] league week ${w.week}: the posted winners match the recompute.`);
        return;
      }
      await say(`mismatch:${key}`,
        `League week ${w.week}: the posted winners don't match the recompute. ` +
        `The guardian can veto until ${utc(w.proposedAt + LEAGUE_CHALLENGE_PERIOD)}.`);
    });
  }

  // Duties running late usually mean the operator service is down or its wallets are out of gas.
  for (const b of battlesAwaitingResult(snap.battles, snap.now, new Set(ctx.state.vetoedBattles))) {
    if (snap.now > b.startTime + BATTLE_DURATION + RESULT_GRACE) {
      await say(`late:result:${b.id}`, `Battle #${b.id} ended at ${utc(b.startTime + BATTLE_DURATION)} and has no result yet.`);
    }
  }
  for (const b of battlesToFinalize(snap.battles, snap.now)) {
    if (snap.now > b.proposedAt + BATTLE_CHALLENGE_PERIOD + SETTLE_GRACE) {
      await say(`late:finalize:${b.id}`,
        `Battle #${b.id} could be finalized since ${utc(b.proposedAt + BATTLE_CHALLENGE_PERIOD)} and still isn't.`);
    }
  }
  for (const w of weeksAwaitingWinners(snap.firstLeagueWeek, snap.weeks, snap.now, new Set(ctx.state.vetoedWeeks))) {
    const ended = Number(weekEnd(BigInt(w.week)));
    if (snap.now > ended + WINNERS_GRACE) {
      await say(`late:winners:${w.week}`, `League week ${w.week} ended at ${utc(ended)} and has no winners posted yet.`);
    }
  }
  for (const w of weeksToFinalize(snap.weeks, snap.now)) {
    if (snap.now > w.proposedAt + LEAGUE_CHALLENGE_PERIOD + SETTLE_GRACE) {
      await say(`late:week:${w.week}`,
        `League week ${w.week} could be finalized since ${utc(w.proposedAt + LEAGUE_CHALLENGE_PERIOD)} and still isn't.`);
    }
  }
}

export async function runPass(ctx: ServiceContext, duties: ReadonlySet<Duty>): Promise<void> {
  const snap = await readSnapshot(ctx.client, ctx.resolved, ctx.state);
  let cached: Promise<TokenState[]> | undefined;
  const tokens = () => (cached ??= readTokens(ctx.client, ctx.resolved, ctx.state));

  if (duties.has("operator")) await noteVetoes(ctx, snap);
  if (duties.has("keeper")) await keeperPass(ctx, snap, tokens);
  if (duties.has("operator")) await operatorPass(ctx, snap, tokens);
  if (duties.has("watch")) await watchPass(ctx, snap);
}

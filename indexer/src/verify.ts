/**
 * verify.ts
 * -----------------------------------------------------------------------------
 * PUBLIC VERIFICATION TOOL.
 *
 * Anyone (not just the operator) can independently recompute a battle's / a
 * week's `datasetHash` and `resultHash` from public chain data and compare them
 * to what the operator COMMITTED on-chain via:
 *
 *   proposeBattleResult(battleId, outcome, scoreA, scoreB, datasetHash, resultHash)
 *   proposeWeeklyWinners(week, winners, datasetHash, resultHash)
 *
 * A MATCH proves the operator committed to exactly the public dataset + result
 * that this deterministic indexer reproduces — so the result is trust-minimized:
 * you do not have to trust the operator, you can check it. A MISMATCH is a
 * signal for the guardian to VETO during the challenge period
 * (BATTLE_CHALLENGE_PERIOD = 24h, LEAGUE_CHALLENGE_PERIOD = 48h).
 *
 * The pure comparison (`compareCommitment`) is network-free so it can be unit
 * tested offline; the on-chain reads are isolated in their own functions.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PublicClient } from "viem";
import { makeClient } from "./ingest.ts";
import { computeBattle, computeBattleInWindow, computeWeek } from "./jobs.ts";
import { ADDRESSES, DEPLOY_BLOCK, QV_PARAMS } from "./config.ts";
import { resolveAddresses } from "./resolveAddresses.ts";
import { QualyraCompetitionVaultAbi } from "./abi/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface OnchainCommitment {
  datasetHash: string;
  resultHash: string;
}

export interface CommitmentComparison {
  match: boolean;
  datasetMatch: boolean;
  resultMatch: boolean;
  onchain: OnchainCommitment;
  recomputed: OnchainCommitment;
}

/**
 * Pure, network-free comparison of an on-chain commitment vs a locally
 * recomputed one. Hashes are compared case-insensitively. This is the unit the
 * offline test exercises.
 */
export function compareCommitment(
  onchain: OnchainCommitment,
  recomputed: OnchainCommitment,
): CommitmentComparison {
  const norm = (h: string) => String(h ?? "").toLowerCase();
  const oc = {
    datasetHash: norm(onchain.datasetHash),
    resultHash: norm(onchain.resultHash),
  };
  const rc = {
    datasetHash: norm(recomputed.datasetHash),
    resultHash: norm(recomputed.resultHash),
  };
  const datasetMatch = oc.datasetHash === rc.datasetHash;
  const resultMatch = oc.resultHash === rc.resultHash;
  return {
    match: datasetMatch && resultMatch,
    datasetMatch,
    resultMatch,
    onchain: oc,
    recomputed: rc,
  };
}

/** Load the connected-wallets denylist (same logic/path as the CLI). */
export function loadDenylist(): Set<string> {
  const p = resolve(__dirname, "..", QV_PARAMS.denylistPath);
  if (!existsSync(p)) return new Set();
  try {
    const arr = JSON.parse(readFileSync(p, "utf8"));
    if (Array.isArray(arr)) {
      return new Set(arr.map((a: string) => String(a).toLowerCase()));
    }
  } catch {
    /* ignore malformed denylist */
  }
  return new Set();
}

/** Read the on-chain committed hashes for a battle via getBattle(). */
export async function readBattleCommitment(
  client: PublicClient,
  battleId: string | number | bigint,
  /** CompetitionVault address (resolved on-chain). Defaults to config value. */
  competitionVault: string = ADDRESSES.competitionVault,
): Promise<OnchainCommitment> {
  const battle = (await client.readContract({
    address: competitionVault as `0x${string}`,
    abi: QualyraCompetitionVaultAbi as any,
    functionName: "getBattle",
    args: [BigInt(battleId)],
  })) as any;
  return { datasetHash: battle.datasetHash, resultHash: battle.resultHash };
}

/** Read the on-chain committed hashes for a week via getWeekResult(). */
export async function readWeekCommitment(
  client: PublicClient,
  week: bigint,
  /** CompetitionVault address (resolved on-chain). Defaults to config value. */
  competitionVault: string = ADDRESSES.competitionVault,
): Promise<OnchainCommitment> {
  const wr = (await client.readContract({
    address: competitionVault as `0x${string}`,
    abi: QualyraCompetitionVaultAbi as any,
    functionName: "getWeekResult",
    args: [week],
  })) as any;
  return { datasetHash: wr.datasetHash, resultHash: wr.resultHash };
}

/**
 * Verify a battle over a given block range: read the on-chain commitment, recompute locally and compare. The
 * range is taken as given, for replaying an old commitment; `verifyBattleById` reads it from the vault instead.
 * Both go through jobs.ts, the path `index-battle` commits from, so a faithful commitment reproduces exactly.
 */
export async function verifyBattle(
  battleId: string | number,
  tokenA: string,
  tokenB: string,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<CommitmentComparison> {
  const client = makeClient();
  const resolved = await resolveAddresses(client);
  const onchain = await readBattleCommitment(client, battleId, resolved.competitionVault);
  const b = await computeBattleInWindow(
    client,
    resolved,
    { battleId: String(battleId), tokenA, tokenB },
    { fromBlock, toBlock },
    loadDenylist(),
  );
  return compareCommitment(onchain, { datasetHash: b.datasetHash, resultHash: b.resultHash });
}

/** Verify a battle from its id alone: its tokens and its [start, start + 24h) block window come from the vault. */
export async function verifyBattleById(battleId: string | number): Promise<CommitmentComparison> {
  const client = makeClient();
  const resolved = await resolveAddresses(client);
  const onchain = await readBattleCommitment(client, battleId, resolved.competitionVault);
  const job = await computeBattle(client, resolved, battleId, loadDenylist());
  if (!job.build || !job.window.closed) {
    throw new Error(`Battle ${battleId} is not over yet, or its last blocks are not deep enough.`);
  }
  return compareCommitment(onchain, { datasetHash: job.build.datasetHash, resultHash: job.build.resultHash });
}

/**
 * Verify a week: read the on-chain commitment, recompute the global weekly leaderboard from the trades inside
 * [weekStart, weekEnd) and compare. The window and the price block are pinned the way `index-week` pins them,
 * so a faithful commitment reproduces byte-identically once the week is closed; a still-open week is compared
 * against a moving tip and is expected to differ.
 */
export async function verifyWeek(week: bigint): Promise<CommitmentComparison> {
  const client = makeClient();
  const resolved = await resolveAddresses(client);
  const onchain = await readWeekCommitment(client, week, resolved.competitionVault);
  const job = await computeWeek(client, resolved, week, loadDenylist());
  if (job.predatesDeploy || !job.build) {
    // A week ending at/before the deploy has no indexable activity: fail loudly instead of "verifying" nothing.
    throw new Error(
      `Cannot verify week ${week.toString()}: it ends at or before the factory ` +
        `deploy block (${DEPLOY_BLOCK.toString()}) and predates the platform.`,
    );
  }
  return compareCommitment(onchain, { datasetHash: job.build.datasetHash, resultHash: job.build.resultHash });
}

/**
 * Pretty-print a comparison. Returns the process exit code to use
 * (0 = MATCH, 1 = MISMATCH).
 */
export function reportComparison(
  kind: string,
  id: string,
  cmp: CommitmentComparison,
): number {
  console.log(`\nVerification: ${kind} ${id}`);
  console.log(`  dataset  on-chain:   ${cmp.onchain.datasetHash}`);
  console.log(
    `  dataset  recomputed: ${cmp.recomputed.datasetHash}  ${cmp.datasetMatch ? "MATCH" : "MISMATCH"}`,
  );
  console.log(`  result   on-chain:   ${cmp.onchain.resultHash}`);
  console.log(
    `  result   recomputed: ${cmp.recomputed.resultHash}  ${cmp.resultMatch ? "MATCH" : "MISMATCH"}`,
  );
  if (cmp.match) {
    console.log(
      "\nRESULT: MATCH — the operator committed to exactly this public dataset + result.",
    );
  } else {
    console.log(
      "\nRESULT: MISMATCH — committed hashes do NOT match the recomputed values.\n" +
        "The guardian should VETO this result during the challenge period.",
    );
  }
  return cmp.match ? 0 : 1;
}

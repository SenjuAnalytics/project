/**
 * jobs.ts
 * -----------------------------------------------------------------------------
 * One battle or one league week, end to end: find its block window from chain
 * time, scan it, and build the dataset and result. The CLI, the verifier and the
 * operator service all go through here, so a commitment and its verification
 * scan the same blocks with the same inputs.
 */
import type { PublicClient } from "viem";
import {
  fetchCreators,
  fetchCurveMap,
  ingestTrades,
  resolvePriceBlock,
  resolveWeekToBlock,
} from "./ingest.ts";
import { buildBattle, buildWeek, type BattleBuild, type WeekBuild } from "./build.ts";
import { fetchQuoteAssetRegistry } from "./quoteAssetRegistry.ts";
import { DEPLOY_BLOCK, ZERO_ADDRESS, type ResolvedAddresses } from "./config.ts";
import { selectPriceProvider } from "./price/selectPriceProvider.ts";
import { readForcedOutcome } from "./disqualification.ts";
import { resolveBattleWindow, resolveWeekFromBlock, type BlockWindow } from "./window.ts";
import { QualyraCompetitionVaultAbi } from "./abi/index.ts";

export interface BattleRef {
  /** Kept as a string: it is part of the hashed result, and the CLI has always passed it as one. */
  battleId: string;
  tokenA: string;
  tokenB: string;
  startTime: bigint;
}

export async function readBattleRef(
  client: PublicClient,
  competitionVault: string,
  battleId: string | number | bigint,
): Promise<BattleRef> {
  const battle = (await client.readContract({
    address: competitionVault as `0x${string}`,
    abi: QualyraCompetitionVaultAbi as any,
    functionName: "getBattle",
    args: [BigInt(battleId)],
  })) as any;
  if (String(battle.tokenA).toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`Battle ${battleId.toString()} does not exist on this vault.`);
  }
  return {
    battleId: battleId.toString(),
    tokenA: String(battle.tokenA),
    tokenB: String(battle.tokenB),
    startTime: BigInt(battle.startTime),
  };
}

/** Builds a battle from the trades in [fromBlock, toBlock] and the vault's disqualification record. */
export async function computeBattleInWindow(
  client: PublicClient,
  resolved: ResolvedAddresses,
  ref: Omit<BattleRef, "startTime">,
  window: { fromBlock: bigint; toBlock: bigint },
  denylist: Set<string>,
): Promise<BattleBuild> {
  // Discovery always starts at the deploy block so a token launched before the window keeps its curve.
  const curveMap = await fetchCurveMap(client, DEPLOY_BLOCK, window.toBlock);
  const creators = await fetchCreators(client, DEPLOY_BLOCK, window.toBlock);
  // The factory's quote-asset registry as of the SAME pinned block (logs-only
  // replay — quoteAssetRegistry.ts): the source of truth for pair-asset
  // existence + decimals. Fetched BEFORE the scan so this run, the operator
  // and any verifier all use the identical registry.
  const registry = await fetchQuoteAssetRegistry(client, DEPLOY_BLOCK, window.toBlock);
  // Resolve the price basis before the scan so a misconfigured pool fails fast.
  const prices = await selectPriceProvider(client, resolvePriceBlock(window.toBlock), registry);
  const trades = await ingestTrades(client, window.fromBlock, window.toBlock, curveMap, registry);
  const disqualification = await readForcedOutcome(client, resolved.competitionVault, ref.battleId);
  return buildBattle(
    ref.battleId,
    ref.tokenA,
    ref.tokenB,
    trades,
    { creators, denylist },
    resolved.buybackBurner,
    prices,
    disqualification,
  );
}

export interface BattleJob {
  ref: BattleRef;
  window: BlockWindow;
  /** Absent until the battle has started. Only a closed window gives a result to commit. */
  build?: BattleBuild;
}

/** Everything the chain says about a battle's result, straight from its id. */
export async function computeBattle(
  client: PublicClient,
  resolved: ResolvedAddresses,
  battleId: string | number | bigint,
  denylist: Set<string>,
): Promise<BattleJob> {
  const ref = await readBattleRef(client, resolved.competitionVault, battleId);
  const window = await resolveBattleWindow(client, ref.startTime);
  if (window.fromBlock > window.toBlock) return { ref, window };
  return { ref, window, build: await computeBattleInWindow(client, resolved, ref, window, denylist) };
}

export interface WeekJob {
  week: bigint;
  window: BlockWindow;
  /** The week ended before the factory existed, so there is nothing to rank. */
  predatesDeploy: boolean;
  /** Absent for a week that predates the deploy. Only a closed window gives a result to commit. */
  build?: WeekBuild;
}

/** The league ranking of `week`, from the trades inside that week only. */
export async function computeWeek(
  client: PublicClient,
  resolved: ResolvedAddresses,
  week: bigint,
  denylist: Set<string>,
): Promise<WeekJob> {
  const end = await resolveWeekToBlock(client, week);
  if (end.predatesDeploy) {
    return {
      week,
      window: { fromBlock: DEPLOY_BLOCK, toBlock: end.toBlock, closed: false },
      predatesDeploy: true,
    };
  }
  const fromBlock = await resolveWeekFromBlock(client, week, end.toBlock);
  const window = { fromBlock, toBlock: end.toBlock, closed: end.closed };

  const curveMap = await fetchCurveMap(client, DEPLOY_BLOCK, window.toBlock);
  const creators = await fetchCreators(client, DEPLOY_BLOCK, window.toBlock);
  // Registry at the SAME pinned block (logs-only) — see computeBattleInWindow.
  const registry = await fetchQuoteAssetRegistry(client, DEPLOY_BLOCK, window.toBlock);
  const prices = await selectPriceProvider(client, resolvePriceBlock(window.toBlock), registry);
  const trades = await ingestTrades(client, window.fromBlock, window.toBlock, curveMap, registry);
  const build = buildWeek(week, trades, { creators, denylist }, resolved.buybackBurner, prices);
  return { week, window, predatesDeploy: false, build };
}

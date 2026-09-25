/**
 * window.ts
 * -----------------------------------------------------------------------------
 * Block ranges for time windows: the blocks whose timestamps fall in
 * [startTs, endTs). A battle covers [startTime, startTime + 24h) and a league
 * week covers [weekStart, weekEnd), the same windows the competition vault uses.
 *
 * Both bounds come from a binary search over block timestamps (non-decreasing),
 * starting at the factory deploy block. A window only counts as closed once its
 * end is buried under INDEXER_CONFIRMATIONS blocks, so a shallow reorg can't move
 * the range after a result was committed from it.
 */
import type { PublicClient } from "viem";
import { DEPLOY_BLOCK } from "./config.ts";
import { getBlockResilient } from "./rpc.ts";
import { weekStart } from "./leaderboard.ts";

/** QualyraCompetitionVault.BATTLE_DURATION, in seconds. */
export const BATTLE_DURATION = 86_400n;

export interface BlockWindow {
  /** First block with a timestamp at or after the window start (never below DEPLOY_BLOCK). */
  fromBlock: bigint;
  /** Last block with a timestamp before the window end; the safe tip while the window is open. */
  toBlock: bigint;
  /** The window has ended and its end is buried under the confirmation depth. */
  closed: boolean;
}

function confirmations(): bigint {
  const raw = process.env.INDEXER_CONFIRMATIONS;
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : 0n;
}

/**
 * Lowest block in [lo, hi] whose timestamp is at or after `ts`, or `hi + 1n` when
 * none is. Timestamps never decrease with the block number, so this is exact.
 */
export async function firstBlockAtOrAfter(
  client: PublicClient,
  ts: bigint,
  lo: bigint,
  hi: bigint,
): Promise<bigint> {
  let found = hi + 1n;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1n;
    const block = await getBlockResilient(client, mid);
    if (block.timestamp >= ts) {
      found = mid;
      hi = mid - 1n;
    } else {
      lo = mid + 1n;
    }
  }
  return found;
}

/** Blocks of [startTs, endTs). While the window is still open, `toBlock` is the safe tip. */
export async function resolveTimeWindow(
  client: PublicClient,
  startTs: bigint,
  endTs: bigint,
): Promise<BlockWindow> {
  const latest = await client.getBlockNumber();
  const depth = confirmations();
  const safeTip = latest - depth > DEPLOY_BLOCK ? latest - depth : DEPLOY_BLOCK;

  const fromBlock = await firstBlockAtOrAfter(client, startTs, DEPLOY_BLOCK, safeTip);
  const tip = await getBlockResilient(client, safeTip);
  if (tip.timestamp < endTs) return { fromBlock, toBlock: safeTip, closed: false };

  const firstAfterEnd = await firstBlockAtOrAfter(client, endTs, fromBlock, safeTip);
  return { fromBlock, toBlock: firstAfterEnd - 1n, closed: true };
}

/** Blocks of a battle's live window. */
export function resolveBattleWindow(client: PublicClient, startTime: bigint): Promise<BlockWindow> {
  return resolveTimeWindow(client, startTime, startTime + BATTLE_DURATION);
}

/**
 * First block of league week `week`, searched up to `toBlock` (the week's last
 * block, from resolveWeekToBlock). A week that began before the deploy starts at
 * DEPLOY_BLOCK.
 */
export function resolveWeekFromBlock(
  client: PublicClient,
  week: bigint,
  toBlock: bigint,
): Promise<bigint> {
  return firstBlockAtOrAfter(client, weekStart(week), DEPLOY_BLOCK, toBlock);
}

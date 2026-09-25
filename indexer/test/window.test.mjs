/**
 * window.test.mjs — OFFLINE tests for the block windows of battles and weeks
 * (src/window.ts). A fake client serves block -> timestamp; no RPC is used.
 *
 * The fake chain packs four blocks into each second, the way an L2 does, so the
 * searches have to land on the first block of a second, not just any block
 * with the right timestamp.
 */
import "./_fixtureEnv.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  BATTLE_DURATION,
  firstBlockAtOrAfter,
  resolveBattleWindow,
  resolveTimeWindow,
  resolveWeekFromBlock,
} from "../src/window.ts";
import { resolveWeekToBlock } from "../src/ingest.ts";
import { weekEnd, weekStart } from "../src/leaderboard.ts";
import { DEPLOY_BLOCK } from "../src/config.ts";

const PER_SECOND = 4n;

/** Block n has timestamp genesis + (n - DEPLOY_BLOCK) / 4. */
function makeFakeClient({ tip, genesis }) {
  const tsOf = n => genesis + (BigInt(n) - DEPLOY_BLOCK) / PER_SECOND;
  return {
    async getBlockNumber() {
      return tip;
    },
    async getBlock({ blockNumber }) {
      return { number: blockNumber, timestamp: tsOf(blockNumber) };
    },
    tsOf,
    /** First block of second `ts`. */
    blockAt: ts => DEPLOY_BLOCK + (ts - genesis) * PER_SECOND,
  };
}

const GENESIS = 1_800_000_000n;

test("firstBlockAtOrAfter: the first block of the target second", async () => {
  const client = makeFakeClient({ tip: DEPLOY_BLOCK + 10_000n, genesis: GENESIS });
  const block = await firstBlockAtOrAfter(client, GENESIS + 100n, DEPLOY_BLOCK, DEPLOY_BLOCK + 10_000n);
  assert.equal(block, client.blockAt(GENESIS + 100n));
  assert.ok(client.tsOf(block - 1n) < GENESIS + 100n);
});

test("firstBlockAtOrAfter: hi + 1 when no block has reached the timestamp", async () => {
  const hi = DEPLOY_BLOCK + 100n;
  const client = makeFakeClient({ tip: hi, genesis: GENESIS });
  assert.equal(await firstBlockAtOrAfter(client, GENESIS + 1_000n, DEPLOY_BLOCK, hi), hi + 1n);
});

test("resolveBattleWindow: a finished battle covers exactly [start, start + 24h)", async () => {
  const start = GENESIS + 3_600n;
  const probe = makeFakeClient({ tip: 0n, genesis: GENESIS });
  const tip = probe.blockAt(start + BATTLE_DURATION + 600n);
  const client = makeFakeClient({ tip, genesis: GENESIS });

  const w = await resolveBattleWindow(client, start);
  assert.equal(w.closed, true);
  assert.equal(w.fromBlock, client.blockAt(start));
  assert.equal(w.toBlock, client.blockAt(start + BATTLE_DURATION) - 1n);
  assert.equal(client.tsOf(w.toBlock), start + BATTLE_DURATION - 1n);
});

test("resolveBattleWindow: a running battle stays open at the tip", async () => {
  const start = GENESIS + 3_600n;
  const probe = makeFakeClient({ tip: 0n, genesis: GENESIS });
  const tip = probe.blockAt(start + 5_000n);
  const w = await resolveBattleWindow(makeFakeClient({ tip, genesis: GENESIS }), start);
  assert.equal(w.closed, false);
  assert.equal(w.toBlock, tip);
});

test("resolveTimeWindow: INDEXER_CONFIRMATIONS keeps a just-ended window open", async () => {
  const start = GENESIS + 3_600n;
  const end = start + 600n;
  const probe = makeFakeClient({ tip: 0n, genesis: GENESIS });
  const tip = probe.blockAt(end + 10n); // 40 blocks past the end
  const client = makeFakeClient({ tip, genesis: GENESIS });

  process.env.INDEXER_CONFIRMATIONS = "100";
  try {
    assert.equal((await resolveTimeWindow(client, start, end)).closed, false);
  } finally {
    delete process.env.INDEXER_CONFIRMATIONS;
  }
  assert.equal((await resolveTimeWindow(client, start, end)).closed, true);
});

test("week window: a closed week scans its own blocks only, from weekStart to weekEnd", async () => {
  const week = 3000n;
  const genesis = weekStart(week) - 1_000n; // the platform launched 1000s before this week
  const probe = makeFakeClient({ tip: 0n, genesis });
  const tip = probe.blockAt(weekEnd(week) + 100n);
  const client = makeFakeClient({ tip, genesis });

  const end = await resolveWeekToBlock(client, week);
  const from = await resolveWeekFromBlock(client, week, end.toBlock);
  assert.equal(end.closed, true);
  assert.equal(from, client.blockAt(weekStart(week)));
  assert.equal(client.tsOf(from), weekStart(week));
  assert.ok(client.tsOf(from - 1n) < weekStart(week), "the block before belongs to the previous week");
  assert.equal(end.toBlock, client.blockAt(weekEnd(week)) - 1n);
});

test("week window: a week that began before the deploy starts at DEPLOY_BLOCK", async () => {
  const week = 3000n;
  const genesis = weekStart(week) + 500n; // deployed half-way through the week's first hour
  const probe = makeFakeClient({ tip: 0n, genesis });
  const tip = probe.blockAt(weekEnd(week) + 100n);
  const client = makeFakeClient({ tip, genesis });

  const end = await resolveWeekToBlock(client, week);
  assert.equal(await resolveWeekFromBlock(client, week, end.toBlock), DEPLOY_BLOCK);
});

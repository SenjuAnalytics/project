/**
 * weekBlock.test.mjs — OFFLINE (no network) test for resolveWeekToBlock, the
 * function that drives the OPEN→PROVISIONAL vs CLOSED→reproducible flag.
 *
 * `resolveWeekToBlock(client, week)` only calls `client.getBlockNumber()` and
 * `client.getBlock({ blockNumber })`, so we inject a FAKE client backed by an
 * in-memory chain of (blockNumber -> timestamp). No RPC is used.
 *
 * Asserts the three behaviours the commit-safety guarantee depends on:
 *   1. OPEN week (chain tip timestamp < weekEnd) => { closed:false } at the tip
 *      -> `index-week` prints "PROVISIONAL, do not commit yet".
 *   2. CLOSED week (tip timestamp >= weekEnd) => { closed:true } AND toBlock is
 *      the highest block whose timestamp is strictly < weekEnd (deterministic,
 *      fixed historical block) -> reproducible / safe to commit.
 *   3. Two independent resolves of a CLOSED week return the identical toBlock,
 *      regardless of chain tip growth after the week ended (reproducibility).
 *
 * NOTE: imports the .ts sources directly via Node's native TS type-strip.
 */
import "./_fixtureEnv.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { resolveWeekToBlock, resolvePriceBlock, checkScanFloor } from "../src/ingest.ts";
import { weekEnd, weekStart } from "../src/leaderboard.ts";
import { DEPLOY_BLOCK } from "../src/config.ts";

/* ------------------------------------------------------------------ */
/* Fake chain: a monotonic block->timestamp map. Block N has timestamp */
/* genesisTs + N*blockTime, so timestamps increase with block number   */
/* (exactly the invariant resolveWeekToBlock's binary search relies on).*/
/* ------------------------------------------------------------------ */
function makeFakeClient({ tip, genesisTs, blockTime }) {
  const tsOf = (n) => genesisTs + n * blockTime;
  return {
    async getBlockNumber() {
      return tip;
    },
    async getBlock({ blockNumber }) {
      return { number: blockNumber, timestamp: tsOf(BigInt(blockNumber)) };
    },
    _tsOf: tsOf,
  };
}

// Pick a week whose window sits comfortably above DEPLOY_BLOCK on our fake chain.
const WEEK = 3000n;
const END = weekEnd(WEEK); // exclusive upper bound (unix seconds)
const START = weekStart(WEEK);

// 1 block per second starting so that DEPLOY_BLOCK maps well before weekStart.
const BLOCK_TIME = 1n;
const GENESIS_TS = START - DEPLOY_BLOCK - 100_000n; // ensures tsOf(DEPLOY_BLOCK) << END

test("resolveWeekToBlock: OPEN week (tip before weekEnd) => PROVISIONAL at tip", async () => {
  // Tip timestamp is BEFORE the week even ends.
  const tip = DEPLOY_BLOCK + 50_000n;
  const client = makeFakeClient({ tip, genesisTs: GENESIS_TS, blockTime: BLOCK_TIME });
  assert.ok(client._tsOf(tip) < END, "precondition: tip is before weekEnd");

  const r = await resolveWeekToBlock(client, WEEK);
  assert.equal(r.closed, false); // -> "PROVISIONAL, do not commit yet"
  assert.equal(r.toBlock, tip); // provisional bound is the chain tip
});

test("resolveWeekToBlock: CLOSED week => closed=true and the exact last block < weekEnd", async () => {
  // Tip is well past weekEnd, so the week has fully elapsed.
  const tip = DEPLOY_BLOCK + 2_000_000n;
  const client = makeFakeClient({ tip, genesisTs: GENESIS_TS, blockTime: BLOCK_TIME });
  assert.ok(client._tsOf(tip) >= END, "precondition: tip is at/after weekEnd");

  const r = await resolveWeekToBlock(client, WEEK);
  assert.equal(r.closed, true); // -> "reproducible / safe to commit"

  // The resolved block must be the HIGHEST block with timestamp strictly < END,
  // and the next block must be >= END (tight, correct boundary).
  assert.ok(client._tsOf(r.toBlock) < END, "toBlock timestamp is before weekEnd");
  assert.ok(client._tsOf(r.toBlock + 1n) >= END, "toBlock+1 is at/after weekEnd");
});

test("resolveWeekToBlock: CLOSED week toBlock is reproducible as the tip grows", async () => {
  const a = await resolveWeekToBlock(
    makeFakeClient({ tip: DEPLOY_BLOCK + 2_000_000n, genesisTs: GENESIS_TS, blockTime: BLOCK_TIME }),
    WEEK,
  );
  // Same closed week, but the chain has advanced much further since it closed.
  const b = await resolveWeekToBlock(
    makeFakeClient({ tip: DEPLOY_BLOCK + 9_000_000n, genesisTs: GENESIS_TS, blockTime: BLOCK_TIME }),
    WEEK,
  );
  assert.equal(a.closed, true);
  assert.equal(b.closed, true);
  assert.equal(a.toBlock, b.toBlock); // fixed historical block -> reproducible
});

test("resolveWeekToBlock: boundary — a block exactly AT weekEnd is excluded", async () => {
  // Construct a chain where some block lands exactly on END. weekEnd is an
  // EXCLUSIVE bound, so that block must NOT be selected; the block before it is.
  // With blockTime=1 and genesisTs chosen so tsOf(B)=END for an integer B:
  const genesisTs = 1_000_000_000n;
  const blockTime = 1n;
  const atEndBlock = END - genesisTs; // tsOf(atEndBlock) == END exactly
  const tip = atEndBlock + 500n;
  const client = makeFakeClient({ tip, genesisTs, blockTime });

  const r = await resolveWeekToBlock(client, WEEK);
  assert.equal(r.closed, true);
  assert.equal(r.toBlock, atEndBlock - 1n); // the last block strictly before END
  assert.ok(client._tsOf(r.toBlock) < END);
  assert.equal(client._tsOf(atEndBlock), END); // sanity: that block is exactly END
});

test("resolveWeekToBlock: OPEN/CLOSED weeks are NOT flagged predatesDeploy", async () => {
  // Sanity: the normal-in-range cases must report predatesDeploy:false so the
  // guard never fires for a legitimate week.
  const open = await resolveWeekToBlock(
    makeFakeClient({ tip: DEPLOY_BLOCK + 50_000n, genesisTs: GENESIS_TS, blockTime: BLOCK_TIME }),
    WEEK,
  );
  const closed = await resolveWeekToBlock(
    makeFakeClient({ tip: DEPLOY_BLOCK + 2_000_000n, genesisTs: GENESIS_TS, blockTime: BLOCK_TIME }),
    WEEK,
  );
  assert.equal(open.predatesDeploy, false);
  assert.equal(closed.predatesDeploy, false);
});

test("resolveWeekToBlock: week ending at/before DEPLOY_BLOCK => predatesDeploy, NOT a committable closed week", async () => {
  // Regression for the real-chain edge case we hit: the platform was deployed
  // AFTER the week's end, so tsOf(DEPLOY_BLOCK) >= weekEnd(WEEK). No block in
  // [DEPLOY_BLOCK, tip] falls inside the week. The OLD code silently returned
  // { toBlock: DEPLOY_BLOCK, closed: true } — falsely "safe to commit". It must
  // now report predatesDeploy:true and closed:false so callers refuse it.
  const blockTime = 1n;
  // Make DEPLOY_BLOCK's timestamp land exactly AT weekEnd (>= END triggers guard).
  const genesisTs = END - DEPLOY_BLOCK;
  const tip = DEPLOY_BLOCK + 500_000n;
  const client = makeFakeClient({ tip, genesisTs, blockTime });
  assert.ok(client._tsOf(DEPLOY_BLOCK) >= END, "precondition: deploy is at/after weekEnd");

  const r = await resolveWeekToBlock(client, WEEK);
  assert.equal(r.predatesDeploy, true);
  assert.equal(r.closed, false); // MUST NOT masquerade as a committable closed week
  assert.equal(r.toBlock, DEPLOY_BLOCK);
});

test("resolveWeekToBlock: week strictly before DEPLOY_BLOCK => predatesDeploy", async () => {
  // Even more clearly pre-deploy: DEPLOY_BLOCK's timestamp is strictly AFTER END.
  const blockTime = 1n;
  const genesisTs = END - DEPLOY_BLOCK + 10_000n; // tsOf(DEPLOY_BLOCK) = END + 10_000
  const tip = DEPLOY_BLOCK + 500_000n;
  const client = makeFakeClient({ tip, genesisTs, blockTime });
  assert.ok(client._tsOf(DEPLOY_BLOCK) > END, "precondition: deploy strictly after weekEnd");

  const r = await resolveWeekToBlock(client, WEEK);
  assert.equal(r.predatesDeploy, true);
  assert.equal(r.closed, false);
});

test("resolveWeekToBlock: INDEXER_CONFIRMATIONS keeps a just-closed week PROVISIONAL until buried", async () => {
  // Reorg safety (P2): the week has just ended — the block AT weekEnd exists but
  // is only a few blocks below the tip. With a confirmations buffer larger than
  // that depth, the safe tip is still < weekEnd, so the week must be reported
  // PROVISIONAL (closed:false) instead of prematurely committable.
  const blockTime = 1n;
  const genesisTs = GENESIS_TS;
  const atEnd = END - genesisTs;      // tsOf(atEnd) == END
  const tip = atEnd + 5n;             // only 5 blocks past weekEnd
  const prev = process.env.INDEXER_CONFIRMATIONS;
  try {
    process.env.INDEXER_CONFIRMATIONS = "50"; // deeper than the 5-block margin
    const client = makeFakeClient({ tip, genesisTs, blockTime });
    const r = await resolveWeekToBlock(client, WEEK);
    assert.equal(r.closed, false, "shallow-confirmed week must stay PROVISIONAL");
    assert.equal(r.predatesDeploy, false);
    // safe tip = tip - 50, whose timestamp is < END -> provisional bound is that safe tip
    assert.equal(r.toBlock, tip - 50n);
  } finally {
    if (prev === undefined) delete process.env.INDEXER_CONFIRMATIONS;
    else process.env.INDEXER_CONFIRMATIONS = prev;
  }
});

test("resolveWeekToBlock: with confirmations, a well-buried week is CLOSED at the right block", async () => {
  const blockTime = 1n;
  const genesisTs = GENESIS_TS;
  const atEnd = END - genesisTs;
  const tip = atEnd + 10_000n;        // far past weekEnd
  const prev = process.env.INDEXER_CONFIRMATIONS;
  try {
    process.env.INDEXER_CONFIRMATIONS = "50";
    const client = makeFakeClient({ tip, genesisTs, blockTime });
    const r = await resolveWeekToBlock(client, WEEK);
    assert.equal(r.closed, true);
    assert.ok(client._tsOf(r.toBlock) < END);
    assert.ok(client._tsOf(r.toBlock + 1n) >= END); // still the exact boundary
  } finally {
    if (prev === undefined) delete process.env.INDEXER_CONFIRMATIONS;
    else process.env.INDEXER_CONFIRMATIONS = prev;
  }
});

test("resolvePriceBlock: ignores INDEXER_PRICE_BLOCK unless the unsafe flag is set (P1)", async () => {
  const prevBlock = process.env.INDEXER_PRICE_BLOCK;
  const prevAllow = process.env.INDEXER_ALLOW_UNSAFE_PRICE_BLOCK;
  try {
    // Default: override present but flag NOT set -> reproducibility guard wins.
    process.env.INDEXER_PRICE_BLOCK = "123";
    delete process.env.INDEXER_ALLOW_UNSAFE_PRICE_BLOCK;
    assert.equal(resolvePriceBlock(999n), 999n, "must price at toBlock, not the override");

    // No override at all -> toBlock.
    delete process.env.INDEXER_PRICE_BLOCK;
    assert.equal(resolvePriceBlock(999n), 999n);

    // Unsafe flag set -> honor the override (debug only).
    process.env.INDEXER_PRICE_BLOCK = "123";
    process.env.INDEXER_ALLOW_UNSAFE_PRICE_BLOCK = "1";
    assert.equal(resolvePriceBlock(999n), 123n, "unsafe flag forces the override");
  } finally {
    if (prevBlock === undefined) delete process.env.INDEXER_PRICE_BLOCK;
    else process.env.INDEXER_PRICE_BLOCK = prevBlock;
    if (prevAllow === undefined) delete process.env.INDEXER_ALLOW_UNSAFE_PRICE_BLOCK;
    else process.env.INDEXER_ALLOW_UNSAFE_PRICE_BLOCK = prevAllow;
  }
});

/* ------------------------------------------------------------------ */
/* checkScanFloor (P4): validate INDEXER_START_BLOCK vs deploy/toBlock */
/* ------------------------------------------------------------------ */
test("checkScanFloor: START_BLOCK == DEPLOY_BLOCK is clean (no warnings, no fatal)", () => {
  const r = checkScanFloor(DEPLOY_BLOCK, DEPLOY_BLOCK, DEPLOY_BLOCK + 1000n);
  assert.equal(r.fatal, undefined);
  assert.equal(r.warnings.length, 0);
});

test("checkScanFloor: START_BLOCK > toBlock is FATAL (empty scan window)", () => {
  const r = checkScanFloor(DEPLOY_BLOCK + 2000n, DEPLOY_BLOCK, DEPLOY_BLOCK + 1000n);
  assert.ok(r.fatal, "expected a fatal message for an empty window");
  assert.match(r.fatal, /EMPTY/);
});

test("checkScanFloor: START_BLOCK above DEPLOY_BLOCK warns about dropped early trades", () => {
  const r = checkScanFloor(DEPLOY_BLOCK + 10n, DEPLOY_BLOCK, DEPLOY_BLOCK + 1000n);
  assert.equal(r.fatal, undefined);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /DROP/);
});

test("checkScanFloor: START_BLOCK below DEPLOY_BLOCK warns (harmless, slower scan)", () => {
  const r = checkScanFloor(DEPLOY_BLOCK - 10n, DEPLOY_BLOCK, DEPLOY_BLOCK + 1000n);
  assert.equal(r.fatal, undefined);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /before deploy/);
});

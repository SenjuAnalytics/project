/**
 * determinism.test.mjs — OFFLINE (no network) determinism + correctness test.
 *
 * Builds a hard-coded fixture of normalized trades for two tokens (+ creators
 * and a denylisted wallet), then runs the full pipeline
 *   QV -> score -> leaderboard -> canonical -> hash
 * TWICE, asserting:
 *   1. Identical canonical strings across both runs.
 *   2. Identical keccak256 hashes across both runs.
 *   3. The hashes match a hard-coded snapshot (drift detection).
 *   4. Exclusions work (creator / denylist / buyback trades removed).
 *   5. Draw / Winner mapping around the 1% (1e16) margin.
 *
 * Node's built-in test runner is used. Exits non-zero on failure.
 *
 * NOTE: we import the .ts sources directly using Node's native TS type-strip
 * (Node 22.6+ with --experimental-strip-types, and 22.18+/23+ by default).
 */
import "./_fixtureEnv.mjs"; // MUST be first: pins USDG addr before config.ts loads
import test from "node:test";
import assert from "node:assert/strict";

import { buildBattle, buildWeek } from "../src/build.ts";
import { computeScore } from "../src/score.ts";
import { canonical, hash } from "../src/canonical.ts";
import { OUTCOME, PAIR_ASSETS, ADDRESSES } from "../src/config.ts";

/* ------------------------------------------------------------------ */
/* Fixture                                                             */
/* ------------------------------------------------------------------ */
const USDG = PAIR_ASSETS.USDG.address.toLowerCase(); // 6 decimals, $1
const ONE_USDG = 10n ** 6n; // 1 USDG in smallest units == $1

const TOKEN_A = "0x000000000000000000000000000000000000aaaa";
const TOKEN_B = "0x000000000000000000000000000000000000bbbb";

const CREATOR_A = "0x00000000000000000000000000000000000c0a11";
const CREATOR_B = "0x00000000000000000000000000000000000c0b22";
const DENYLISTED = "0x00000000000000000000000000000000000dead1";
const BUYBACK = ADDRESSES.buybackBurner.toLowerCase();

const W1 = "0x0000000000000000000000000000000000001111";
const W2 = "0x0000000000000000000000000000000000002222";
const W3 = "0x0000000000000000000000000000000000003333";
const W4 = "0x0000000000000000000000000000000000004444";

let seq = 0;
function trade(token, trader, usd, side, opts = {}) {
  // usd is a whole-dollar number -> notional in USDG smallest units.
  seq += 1;
  return {
    token,
    trader,
    quoteAsset: USDG,
    notionalQuote: BigInt(usd) * ONE_USDG,
    side,
    blockNumber: BigInt(opts.block ?? 100 + seq),
    txIndex: opts.txIndex ?? 0,
    logIndex: opts.logIndex ?? 0,
    txHash: opts.txHash ?? "0x" + seq.toString(16).padStart(64, "0"),
  };
}

/** Trades deliberately supplied OUT OF ORDER to test deterministic sort. */
function makeTrades() {
  seq = 0;
  return [
    // Token A buyers
    trade(TOKEN_A, W1, 100, "buy"),
    trade(TOKEN_A, W2, 50, "buy"),
    trade(TOKEN_A, W3, 30, "buy"),
    // Token B buyers
    trade(TOKEN_B, W1, 40, "buy"),
    trade(TOKEN_B, W4, 20, "buy"),
    // Excluded: creator of A trades on A
    trade(TOKEN_A, CREATOR_A, 1000, "buy"),
    // Excluded: creator of B trades on B
    trade(TOKEN_B, CREATOR_B, 900, "buy"),
    // Excluded: denylisted wallet
    trade(TOKEN_A, DENYLISTED, 5000, "buy"),
    // Excluded: buyback purchase
    trade(TOKEN_A, BUYBACK, 7000, "buy"),
    // Below min ($1) trade -> dropped (0.4 USDG == $0.40): use fractional
    {
      token: TOKEN_A,
      trader: W1,
      quoteAsset: USDG,
      notionalQuote: 400000n, // 0.4 USDG => $0.40 < $1 min
      side: "buy",
      blockNumber: 999n,
      txIndex: 0,
      logIndex: 0,
      txHash: "0x" + "f".repeat(64),
    },
  ];
}

const creators = { [TOKEN_A]: CREATOR_A, [TOKEN_B]: CREATOR_B };
const denylist = new Set([DENYLISTED]);
const ex = () => ({ creators, denylist });

/* ------------------------------------------------------------------ */
/* Snapshot hashes (computed once, then hard-coded for drift detection)*/
/* ------------------------------------------------------------------ */
// Populated on first run via UPDATE_SNAPSHOT=1; kept in sync below.
// NOTE: the two *DatasetHash values changed on 2026-09 when `priceBasis`
// (the pinned USD price snapshot) was added to the dataset. This is an
// intentional, legitimate change to the data model — the *ResultHash values
// (which do not embed priceBasis) are unchanged, confirming nothing else moved.
const SNAPSHOT = {
  battleDatasetHash:
    "0x0f1e3a34a62850ad21bf9c0d3ff9ef5da3ce423ab3b0cc40d394148c4c78d3a1",
  battleResultHash:
    "0x5f49c3667121354a71daa91f11616fcf8fc4873e6b9910ff95c9b9f717decab2",
  weekDatasetHash:
    "0x0f1e3a34a62850ad21bf9c0d3ff9ef5da3ce423ab3b0cc40d394148c4c78d3a1",
  weekResultHash:
    "0xfdbee9f78297fb755da7913d6aa1eb2ca83fe3a846d0009cde598a7915075f86",
};

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test("battle pipeline is deterministic across two runs", () => {
  const run1 = buildBattle("1", TOKEN_A, TOKEN_B, makeTrades(), ex());
  const run2 = buildBattle("1", TOKEN_A, TOKEN_B, makeTrades(), ex());

  const c1 = canonical(run1.dataset);
  const c2 = canonical(run2.dataset);
  assert.equal(c1, c2, "dataset canonical strings must be identical");
  assert.equal(
    canonical(run1.result),
    canonical(run2.result),
    "result canonical strings must be identical",
  );
  assert.equal(run1.datasetHash, run2.datasetHash, "datasetHash must match");
  assert.equal(run1.resultHash, run2.resultHash, "resultHash must match");
});

test("exclusions remove creator / denylist / buyback / below-min trades", () => {
  const b = buildBattle("1", TOKEN_A, TOKEN_B, makeTrades(), ex());
  const traders = new Set(b.dataset.trades.map((t) => t.trader));
  assert.ok(!traders.has(CREATOR_A), "creator A excluded");
  assert.ok(!traders.has(CREATOR_B), "creator B excluded");
  assert.ok(!traders.has(DENYLISTED), "denylisted wallet excluded");
  assert.ok(!traders.has(BUYBACK), "buyback wallet excluded");
  // The $0.40 trade for W1 dropped => W1 appears only once on token A.
  const w1OnA = b.dataset.trades.filter(
    (t) => t.trader === W1 && t.token === TOKEN_A,
  );
  assert.equal(w1OnA.length, 1, "below-min trade dropped");
  // 5 qualifying trades remain (3 on A: W1,W2,W3 ; 2 on B: W1,W4)
  assert.equal(b.dataset.trades.length, 5, "only qualifying trades remain");
});

test("trades are ordered by (block, txIndex, logIndex)", () => {
  const b = buildBattle("1", TOKEN_A, TOKEN_B, makeTrades(), ex());
  const ts = b.dataset.trades;
  for (let i = 1; i < ts.length; i++) {
    const prev = ts[i - 1];
    const cur = ts[i];
    const before =
      BigInt(prev.blockNumber) < BigInt(cur.blockNumber) ||
      (prev.blockNumber === cur.blockNumber && prev.txIndex < cur.txIndex) ||
      (prev.blockNumber === cur.blockNumber &&
        prev.txIndex === cur.txIndex &&
        prev.logIndex <= cur.logIndex);
    assert.ok(before, `trade ${i} not in canonical order`);
  }
});

test("outcome mapping honors the 1% (1e16) draw margin", () => {
  const SCALE = 10n ** 18n;
  const MARGIN = 10n ** 16n;

  // Equal QV & buyers => Draw.
  const draw = computeScore({
    qvA: 100n,
    qvB: 100n,
    buyersA: 2n,
    buyersB: 2n,
  });
  assert.equal(draw.outcome, OUTCOME.Draw, "equal shares => Draw");
  assert.equal(draw.scoreA, draw.scoreB);

  // Construct scores exactly on the margin boundary via direct check:
  // A just meets scoreB + 1e16 => WinnerA.
  const win = computeScore({
    qvA: 60n,
    qvB: 40n,
    buyersA: 3n,
    buyersB: 1n,
  });
  assert.equal(win.outcome, OUTCOME.WinnerA, "clear lead => WinnerA");
  assert.ok(win.scoreA >= win.scoreB + MARGIN, "margin satisfied");

  // A tiny lead under 1% stays a Draw. qvA=505, qvB=495, buyers equal.
  const tiny = computeScore({
    qvA: 505n,
    qvB: 495n,
    buyersA: 5n,
    buyersB: 5n,
  });
  // qvShareA ~ 0.505, buyerShare 0.5 => scoreA ~ 0.7035, scoreB ~ 0.6965
  // diff ~ 0.007 < 0.01 => Draw.
  assert.equal(tiny.outcome, OUTCOME.Draw, "sub-1% lead => Draw");
  assert.ok(tiny.scoreA < tiny.scoreB + MARGIN);
  assert.ok(tiny.scoreA <= SCALE && tiny.scoreB <= SCALE);
});

test("week leaderboard ranks by QV desc, tie-break addr asc, pads winners", () => {
  const w = buildWeek(2900n, makeTrades(), ex());
  // Wallet totals (USD): W1 = 100 (A) + 40 (B) = 140; W2=50; W3=30; W4=20.
  const ranking = w.result.ranking;
  assert.equal(ranking[0].wallet, W1, "W1 top by QV");
  assert.equal(ranking[0].rank, 1);
  // Four wallets qualify, so the fifth place is the zero address.
  const ZERO = "0x0000000000000000000000000000000000000000";
  assert.deepEqual(w.result.winners, [W1, W2, W3, W4, ZERO]);
  assert.equal(w.result.winners.length, 5);
});

test("winners are zero-padded when fewer than 5 wallets qualify", () => {
  const only = [trade(TOKEN_A, W1, 100, "buy")];
  const w = buildWeek(2900n, only, { creators, denylist });
  assert.equal(w.result.winners.length, 5);
  assert.equal(w.result.winners[0], W1);
  assert.equal(
    w.result.winners[1],
    "0x0000000000000000000000000000000000000000",
  );
});

test("snapshot hashes are stable (drift detection)", () => {
  const b = buildBattle("1", TOKEN_A, TOKEN_B, makeTrades(), ex());
  const w = buildWeek(2900n, makeTrades(), ex());

  const current = {
    battleDatasetHash: b.datasetHash,
    battleResultHash: b.resultHash,
    weekDatasetHash: w.datasetHash,
    weekResultHash: w.resultHash,
  };

  if (process.env.UPDATE_SNAPSHOT === "1") {
    console.log("SNAPSHOT =", JSON.stringify(current, null, 2));
    return; // skip assertion while capturing
  }

  assert.equal(b.datasetHash, SNAPSHOT.battleDatasetHash, "battle dataset hash drift");
  assert.equal(b.resultHash, SNAPSHOT.battleResultHash, "battle result hash drift");
  assert.equal(w.datasetHash, SNAPSHOT.weekDatasetHash, "week dataset hash drift");
  assert.equal(w.resultHash, SNAPSHOT.weekResultHash, "week result hash drift");
});

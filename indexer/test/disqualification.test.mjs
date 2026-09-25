/**
 * disqualification.test.mjs — OFFLINE tests for the outcome the vault's
 * disqualification record forces (src/disqualification.ts), and for how
 * buildBattle commits it. Mirrors QualyraCompetitionVault._disqualificationOutcome.
 */
import "./_fixtureEnv.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { disqualificationOutcome } from "../src/disqualification.ts";
import { buildBattle } from "../src/build.ts";
import { OUTCOME, PAIR_ASSETS } from "../src/config.ts";

const clean = { disqualified: false, disqualifiedAt: 0n };
const droppedAt = at => ({ disqualified: true, disqualifiedAt: at });

test("no drop on either side leaves the scores to decide", () => {
  assert.equal(disqualificationOutcome(clean, clean), OUTCOME.None);
});

test("the token that dropped loses", () => {
  assert.equal(disqualificationOutcome(droppedAt(100n), clean), OUTCOME.DisqualifiedA);
  assert.equal(disqualificationOutcome(clean, droppedAt(100n)), OUTCOME.DisqualifiedB);
});

test("both dropped: the first to drop loses, the same second voids the battle", () => {
  assert.equal(disqualificationOutcome(droppedAt(100n), droppedAt(101n)), OUTCOME.DisqualifiedA);
  assert.equal(disqualificationOutcome(droppedAt(102n), droppedAt(101n)), OUTCOME.DisqualifiedB);
  assert.equal(disqualificationOutcome(droppedAt(101n), droppedAt(101n)), OUTCOME.Void);
});

const USDG = PAIR_ASSETS.USDG.address.toLowerCase();
const TOKEN_A = "0x000000000000000000000000000000000000aaaa";
const TOKEN_B = "0x000000000000000000000000000000000000bbbb";

function trade(token, trader, usd, n) {
  return {
    token,
    trader,
    quoteAsset: USDG,
    notionalQuote: BigInt(usd) * 10n ** 6n,
    side: "buy",
    blockNumber: BigInt(100 + n),
    txIndex: 0,
    logIndex: 0,
    txHash: "0x" + n.toString(16).padStart(64, "0"),
  };
}

const trades = () => [
  trade(TOKEN_A, "0x0000000000000000000000000000000000001111", 900, 1),
  trade(TOKEN_A, "0x0000000000000000000000000000000000002222", 500, 2),
  trade(TOKEN_B, "0x0000000000000000000000000000000000003333", 100, 3),
];
const ex = { creators: {}, denylist: new Set() };

test("buildBattle: the record replaces the score outcome; scores and dataset stay", () => {
  const scored = buildBattle("7", TOKEN_A, TOKEN_B, trades(), ex);
  assert.equal(scored.result.outcome, OUTCOME.WinnerA);

  const forced = buildBattle("7", TOKEN_A, TOKEN_B, trades(), ex, undefined, undefined, OUTCOME.DisqualifiedA);
  assert.equal(forced.result.outcome, OUTCOME.DisqualifiedA);
  assert.equal(forced.scoreOutcomeName, "DisqualifiedA");
  assert.equal(forced.result.scoreA, scored.result.scoreA);
  assert.equal(forced.result.scoreB, scored.result.scoreB);
  assert.equal(forced.datasetHash, scored.datasetHash);
  assert.notEqual(forced.resultHash, scored.resultHash);
});

test("buildBattle: an explicit None keeps the score outcome and its hash", () => {
  const scored = buildBattle("7", TOKEN_A, TOKEN_B, trades(), ex);
  const none = buildBattle("7", TOKEN_A, TOKEN_B, trades(), ex, undefined, undefined, OUTCOME.None);
  assert.equal(none.resultHash, scored.resultHash);
});

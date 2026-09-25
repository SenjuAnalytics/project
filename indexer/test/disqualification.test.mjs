/**
 * disqualification.test.mjs — OFFLINE tests for how buildBattle commits the
 * outcome the vault's disqualification record forces. The vault works that
 * outcome out itself (QualyraCompetitionVault.forcedOutcomeOf); the rule is
 * tested in the contracts' Foundry suite.
 */
import "./_fixtureEnv.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { buildBattle } from "../src/build.ts";
import { OUTCOME, PAIR_ASSETS } from "../src/config.ts";

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

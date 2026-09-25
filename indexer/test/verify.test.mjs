/**
 * verify.test.mjs — OFFLINE (no network) test for the public verification tool.
 *
 * Exercises the pure `compareCommitment` against real hashes produced by the
 * indexer pipeline (buildBattle), asserting:
 *   1. A faithful operator (commits exactly what the indexer recomputes) => MATCH.
 *   2. Case-insensitive hash comparison still MATCHES.
 *   3. A tampered on-chain resultHash is detected => MISMATCH.
 *   4. A manipulated dataset (extra trade) changes the datasetHash => MISMATCH.
 *
 * No RPC is used: buildBattle + compareCommitment are network-free.
 */
import "./_fixtureEnv.mjs"; // MUST be first: pins USDG addr before config.ts loads
import test from "node:test";
import assert from "node:assert/strict";

import { buildBattle } from "../src/build.ts";
import { compareCommitment } from "../src/verify.ts";
import { PAIR_ASSETS } from "../src/config.ts";

const USDG = PAIR_ASSETS.USDG.address.toLowerCase(); // 6 decimals, $1
const ONE_USDG = 10n ** 6n;

const TOKEN_A = "0x000000000000000000000000000000000000aaaa";
const TOKEN_B = "0x000000000000000000000000000000000000bbbb";
const W1 = "0x0000000000000000000000000000000000001111";
const W2 = "0x0000000000000000000000000000000000002222";

let seq = 0;
function trade(token, trader, usd, side = "buy") {
  seq += 1;
  return {
    token,
    trader,
    quoteAsset: USDG,
    notionalQuote: BigInt(usd) * ONE_USDG,
    side,
    blockNumber: BigInt(100 + seq),
    txIndex: 0,
    logIndex: 0,
    txHash: "0x" + seq.toString(16).padStart(64, "0"),
  };
}

function fixtureTrades() {
  seq = 0;
  return [trade(TOKEN_A, W1, 100), trade(TOKEN_A, W2, 50), trade(TOKEN_B, W1, 40)];
}

const ex = { creators: {}, denylist: new Set() };

test("verify: faithful operator commitment MATCHES the recompute", () => {
  const b = buildBattle("1", TOKEN_A, TOKEN_B, fixtureTrades(), ex);
  const onchain = { datasetHash: b.datasetHash, resultHash: b.resultHash };
  const cmp = compareCommitment(onchain, {
    datasetHash: b.datasetHash,
    resultHash: b.resultHash,
  });
  assert.equal(cmp.match, true);
  assert.equal(cmp.datasetMatch, true);
  assert.equal(cmp.resultMatch, true);
});

test("verify: hash comparison is case-insensitive", () => {
  const b = buildBattle("1", TOKEN_A, TOKEN_B, fixtureTrades(), ex);
  const upper = (h) => "0x" + h.slice(2).toUpperCase();
  const cmp = compareCommitment(
    { datasetHash: upper(b.datasetHash), resultHash: upper(b.resultHash) },
    { datasetHash: b.datasetHash, resultHash: b.resultHash },
  );
  assert.equal(cmp.match, true);
});

test("verify: tampered on-chain resultHash is detected as MISMATCH", () => {
  const b = buildBattle("1", TOKEN_A, TOKEN_B, fixtureTrades(), ex);
  const tampered = "0x" + "1".repeat(64);
  const cmp = compareCommitment(
    { datasetHash: b.datasetHash, resultHash: tampered },
    { datasetHash: b.datasetHash, resultHash: b.resultHash },
  );
  assert.equal(cmp.match, false);
  assert.equal(cmp.resultMatch, false);
  assert.equal(cmp.datasetMatch, true);
});

test("verify: a manipulated dataset (extra trade) yields a different datasetHash => MISMATCH", () => {
  const truth = buildBattle("1", TOKEN_A, TOKEN_B, fixtureTrades(), ex);
  const manipulated = buildBattle(
    "1",
    TOKEN_A,
    TOKEN_B,
    [...fixtureTrades(), trade(TOKEN_A, W2, 999)],
    ex,
  );
  const cmp = compareCommitment(
    { datasetHash: truth.datasetHash, resultHash: truth.resultHash },
    { datasetHash: manipulated.datasetHash, resultHash: manipulated.resultHash },
  );
  assert.equal(cmp.datasetMatch, false);
  assert.equal(cmp.match, false);
});

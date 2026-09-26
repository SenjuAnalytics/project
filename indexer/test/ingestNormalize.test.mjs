/**
 * ingestNormalize.test.mjs — OFFLINE tests for normalizeLogs' pair-asset
 * resolution (no network, no RPC).
 *
 * Regression guard for the pool-market path: `Swapped` — the event the SwapRouter
 * emits for trades on a graduated token's v4 pool — carries the token but NOT its
 * quote asset. The normalization used to read `log.quoteAsset`, a field no
 * `Swapped` log has, so every pool trade was normalized with an EMPTY quote asset,
 * `tradeUsdMicro` returned 0, and the $1 min-trade filter dropped the whole trade.
 * Pool volume therefore never reached Qualified Volume / the leaderboard, while
 * the datasetHash and resultHash committed on-chain were computed from those
 * incomplete trades.
 *
 * The pair asset now comes from the token's TokenLaunched record (the same map
 * that resolves curve trades), so both markets agree:
 *   - a USDG-paired token prices in USDG,
 *   - an ETH-paired token carries address(0), which is how PAIR_ASSETS keys ETH,
 *   - a token we never saw launched is skipped instead of being priced by guess.
 */
import "./_fixtureEnv.mjs"; // MUST be first: pins USDG addr before config.ts loads
import test from "node:test";
import assert from "node:assert/strict";

import { normalizeLogs, tokenQuoteMap } from "../src/ingest.ts";
import { computeQualifiedVolume } from "../src/qualifiedVolume.ts";
import { ConstantPriceProvider } from "../src/price/ConstantPriceProvider.ts";
import { PAIR_ASSETS } from "../src/config.ts";

const PRICES = new ConstantPriceProvider();
const NO_EXCLUSIONS = { creators: {}, denylist: new Set() };

const USDG = PAIR_ASSETS.USDG.address.toLowerCase();
const ETH = PAIR_ASSETS.ETH.address.toLowerCase(); // native ETH = address(0)

const CURVE_A = "0x000000000000000000000000000000000000c0de";
const CURVE_B = "0x000000000000000000000000000000000000c0df";
const CURVE_X = "0x0000000000000000000000000000000000000c0d";

const TOKEN_A = "0x000000000000000000000000000000000000aaaa"; // USDG pair
const TOKEN_B = "0x000000000000000000000000000000000000bbbb"; // ETH pair
const TOKEN_X = "0x000000000000000000000000000000000000cccc"; // never launched

const ALICE = "0x0000000000000000000000000000000000001111";
const BOB = "0x0000000000000000000000000000000000002222";

/** The launch map the ingester always builds from DEPLOY_BLOCK (see jobs.ts). */
const curveMap = {
  [CURVE_A]: { token: TOKEN_A, quoteAsset: USDG },
  [CURVE_B]: { token: TOKEN_B, quoteAsset: ETH },
};

let seq = 0;
function hash() {
  seq += 1;
  return "0x" + seq.toString(16).padStart(64, "0");
}

/** A SwapRouter `Swapped` log. Note: no `quoteAsset` anywhere — it has none. */
function swapped(token, payer, { buying = true, amount, block = 100, txIndex = 0, logIndex = 0 } = {}) {
  return {
    address: "0x000000000000000000000000000000000000s0ap",
    args: {
      token,
      payer,
      recipient: payer,
      buyingToken: buying,
      amountIn: BigInt(amount),
      amountOut: BigInt(amount),
    },
    blockNumber: BigInt(block),
    transactionIndex: txIndex,
    logIndex,
    transactionHash: hash(),
  };
}

/** A BondingCurve `Bought` log (resolved by the emitting curve address). */
function bought(curve, payer, { amount, block = 100, txIndex = 0, logIndex = 0 } = {}) {
  return {
    address: curve,
    args: { payer, recipient: payer, amountIn: BigInt(amount), tokensOut: 1n },
    blockNumber: BigInt(block),
    transactionIndex: txIndex,
    logIndex,
    transactionHash: hash(),
  };
}

const norm = (partial) => normalizeLogs({ swapped: [], bought: [], sold: [], ...partial, curveMap });

test("pool trade prices in the token's launch pair asset (regression: was empty)", () => {
  const trades = norm({ swapped: [swapped(TOKEN_A, ALICE, { amount: 5_000_000 })] });

  assert.equal(trades.length, 1, "the pool trade survives normalization");
  assert.equal(trades[0].quoteAsset, USDG, "priced in the launch pair asset, not ''");
  assert.notEqual(trades[0].quoteAsset, "", "empty quote asset is what dropped pool volume before");
});

test("an ETH-paired token keeps address(0), which PAIR_ASSETS keys as ETH", () => {
  const trades = norm({ swapped: [swapped(TOKEN_B, BOB, { amount: 10n ** 18n })] });

  assert.equal(trades[0].quoteAsset, ETH);
  assert.equal(ETH, "0x0000000000000000000000000000000000000000");
  assert.equal(PAIR_ASSETS.ETH.decimals, 18);
});

test("pool and curve trades on the same token resolve to the same pair asset", () => {
  const trades = norm({
    swapped: [swapped(TOKEN_A, BOB, { amount: 5_000_000, block: 101 })],
    bought: [bought(CURVE_A, ALICE, { amount: 1_000_000, block: 100 })],
  });

  assert.equal(trades.length, 2);
  assert.equal(new Set(trades.map((t) => t.quoteAsset)).size, 1, "one token -> one pair asset");
  assert.equal(trades[0].quoteAsset, USDG);
});

test("a token that was never launched is skipped, not priced by guess", () => {
  const trades = norm({ swapped: [swapped(TOKEN_X, ALICE, { amount: 5_000_000 })] });

  assert.equal(trades.length, 0, "unknown token -> no price basis -> skipped");
});

test("a stray quoteAsset field on a log is ignored (launch record wins)", () => {
  const decorated = swapped(TOKEN_A, ALICE, { amount: 5_000_000 });
  decorated.quoteAsset = "0x000000000000000000000000000000000000dead";

  const trades = norm({ swapped: [decorated] });
  assert.equal(trades[0].quoteAsset, USDG);
});

test("fields, sides and canonical ordering are unchanged", () => {
  const trades = norm({
    swapped: [
      swapped(TOKEN_A, BOB, { buying: false, amount: 7, block: 102, txIndex: 1, logIndex: 0 }),
      swapped(TOKEN_A, ALICE, { buying: true, amount: 5, block: 100, txIndex: 0, logIndex: 3 }),
    ],
    bought: [bought(CURVE_A, BOB, { amount: 9, block: 100, txIndex: 0, logIndex: 4 })],
  });

  assert.deepEqual(
    trades.map((t) => [t.blockNumber.toString(), t.txIndex, t.logIndex, t.side]),
    [
      ["100", 0, 3, "buy"],
      ["100", 0, 4, "buy"],
      ["102", 1, 0, "sell"],
    ],
    "ordered by (block, txIndex, logIndex)",
  );
  assert.equal(trades[2].trader, BOB, "trader is the payer/seller");
  assert.equal(trades[1].token, TOKEN_A, "curve trade resolves its token via the curve map");
});

test("pool volume now reaches Qualified Volume (the money path this unblocks)", () => {
  // 5 USDG of pool volume from one wallet == $5 of QV. Before the fix the trade
  // carried an empty quote asset, priced at 0, and fell under the $1 min-trade
  // filter — the wallet's whole pool volume vanished from the leaderboard.
  const trades = norm({ swapped: [swapped(TOKEN_A, ALICE, { amount: 5_000_000 })] });
  const qv = computeQualifiedVolume(trades, NO_EXCLUSIONS, PRICES);

  assert.equal(qv.perTokenWalletQv[TOKEN_A][ALICE], 5_000_000n);
  assert.equal(qv.uniqueBuyers[TOKEN_A], 1);
  assert.equal(qv.filteredTrades.length, 1, "the trade is part of the committed dataset");
});

test("an ETH-paired pool trade is priced with the ETH basis", () => {
  const oneEth = 10n ** 18n;
  const trades = norm({ swapped: [swapped(TOKEN_B, ALICE, { amount: oneEth })] });
  const qv = computeQualifiedVolume(trades, NO_EXCLUSIONS, PRICES);

  // ETH basis is a documented constant (default $2,660), scaled to micro-USD.
  assert.equal(qv.perTokenWalletQv[TOKEN_B][ALICE], BigInt(PAIR_ASSETS.ETH.usd * 1_000_000));
});

test("tokenQuoteMap inverts the curve map without losing tokens", () => {
  const byToken = tokenQuoteMap(curveMap);
  assert.equal(byToken[TOKEN_A], USDG);
  assert.equal(byToken[TOKEN_B], ETH);
});

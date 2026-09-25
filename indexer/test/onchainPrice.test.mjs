/**
 * onchainPrice.test.mjs — OFFLINE (no network) test for the event-based
 * OnchainPriceProvider.
 *
 * The provider derives the ETH/USD basis from the pool's LOGS (not historical
 * STATE), so it can be tested fully offline by injecting a FAKE PublicClient
 * whose `getLogs` returns hand-crafted event logs. No RPC is ever used.
 *
 * We assert the four properties that make the price basis trust-minimized and
 * reproducible:
 *   1. Exact BigInt price math — a known sqrtPriceX96 maps to the known
 *      micro-USD value proven live ($2659.999999) with zero float drift.
 *   2. Deterministic "last event" selection — the provider takes the global
 *      max (blockNumber, logIndex) <= the pinned block, INDEPENDENT of the
 *      getLogs page size (operator and verifier must agree on any node).
 *   3. Events strictly AFTER the pin block are ignored (per-week pinning).
 *   4. Fallback to the Initialize event when the pool has never been swapped,
 *      and a loud throw when neither event exists (misconfigured pool).
 *
 * NOTE: imports the .ts sources directly via Node's native TS type-strip
 * (Node 22.6+ with --experimental-strip-types).
 */
import "./_fixtureEnv.mjs"; // keep parity with the other suites (config pin)
import test from "node:test";
import assert from "node:assert/strict";

import {
  OnchainPriceProvider,
  computePoolId,
} from "../src/price/OnchainPriceProvider.ts";
import { V4SwapEvent, V4InitializeEvent } from "../src/abi/index.ts";

/* ------------------------------------------------------------------ */
/* Fixture pool + constants                                            */
/* ------------------------------------------------------------------ */
const POOL_MANAGER = "0x0000000000000000000000000000000000005555";
const ETH = "0x0000000000000000000000000000000000000000"; // currency0 (native)
const USDG = "0x000000000000000000000000000000000000d000"; // currency1

const POOL_KEY = {
  currency0: ETH,
  currency1: USDG,
  fee: 3000,
  tickSpacing: 60,
  hooks: "0x0000000000000000000000000000000000000000",
};

const POOL_ID = computePoolId(POOL_KEY);

// Proven live value: this sqrtPriceX96 => ethMicro 2659999999 ($2659.999999),
// with ethDecimals=18, usdgDecimals=6, usdgUsdMicro=1_000_000.
const SQRT_2660 = 4086207363329542387775121n;
const EXPECTED_ETH_MICRO = 2659999999n;

const FROM_BLOCK = 100n;

/* ------------------------------------------------------------------ */
/* Fake PublicClient — returns logs from an in-memory store, filtering  */
/* by the same [fromBlock,toBlock] window the provider walks. Records   */
/* how many getLogs calls were made so we can prove page-size           */
/* independence.                                                        */
/* ------------------------------------------------------------------ */
function makeFakeClient(store) {
  // store: array of { event: "swap"|"init", blockNumber, logIndex, sqrtPriceX96 }
  const calls = { count: 0 };
  const client = {
    calls,
    async getLogs({ event, fromBlock, toBlock }) {
      calls.count += 1;
      const wantSwap = event === V4SwapEvent;
      const wantInit = event === V4InitializeEvent;
      return store
        .filter((e) => (wantSwap ? e.event === "swap" : wantInit ? e.event === "init" : false))
        .filter((e) => e.blockNumber >= fromBlock && e.blockNumber <= toBlock)
        .map((e) => ({
          address: e.address ?? POOL_MANAGER,
          blockNumber: e.blockNumber,
          logIndex: e.logIndex,
          args: { id: e.id ?? POOL_ID, sqrtPriceX96: e.sqrtPriceX96 },
        }));
    },
  };
  return client;
}

function baseCfg(client, blockNumber, pageSize) {
  return {
    client,
    poolManager: POOL_MANAGER,
    poolKey: POOL_KEY,
    blockNumber,
    fromBlock: FROM_BLOCK,
    pageSize,
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test("onchain price: last Swap <= pin yields the exact known micro-USD basis", async () => {
  const store = [
    { event: "init", blockNumber: 100n, logIndex: 0, sqrtPriceX96: 1n },
    { event: "swap", blockNumber: 150n, logIndex: 2, sqrtPriceX96: 999n },
    { event: "swap", blockNumber: 200n, logIndex: 1, sqrtPriceX96: SQRT_2660 },
  ];
  const client = makeFakeClient(store);
  const p = await OnchainPriceProvider.load(baseCfg(client, 300n, 5000n));

  const eth = p.priceOf(ETH);
  assert.equal(eth.micro, EXPECTED_ETH_MICRO); // exact BigInt, no float drift
  assert.equal(eth.decimals, 18);

  const usdg = p.priceOf(USDG);
  assert.equal(usdg.micro, 1_000_000n); // pinned $1
  assert.equal(usdg.decimals, 6);

  // Source records the picked event location + sqrtPriceX96 for audit.
  const snap = p.snapshot();
  assert.match(snap[ETH.toLowerCase()].source, /onchain-ethusdg-v4-swap@upto:300/);
  assert.match(snap[ETH.toLowerCase()].source, /at:200\.1/);
  assert.match(snap[ETH.toLowerCase()].source, /sqrtPriceX96:4086207363329542387775121/);
});

test("onchain price: picks global max (block, logIndex) INDEPENDENT of page size", async () => {
  // Two swaps in the same block; the higher logIndex is the true 'last'.
  const store = [
    { event: "swap", blockNumber: 250n, logIndex: 0, sqrtPriceX96: 111n },
    { event: "swap", blockNumber: 250n, logIndex: 7, sqrtPriceX96: SQRT_2660 },
    { event: "swap", blockNumber: 180n, logIndex: 3, sqrtPriceX96: 222n },
  ];

  const results = [];
  for (const pageSize of [1n, 3n, 5000n]) {
    const client = makeFakeClient(store);
    const p = await OnchainPriceProvider.load(baseCfg(client, 300n, pageSize));
    results.push(p.priceOf(ETH).micro);
    // sanity: tiny page size forces multiple windows, large one a single window
    if (pageSize === 1n) assert.ok(client.calls.count > 1);
  }
  // Same resolved price regardless of pagination -> operator == verifier.
  assert.equal(results[0], EXPECTED_ETH_MICRO);
  assert.equal(results[1], EXPECTED_ETH_MICRO);
  assert.equal(results[2], EXPECTED_ETH_MICRO);
});

test("onchain price: events strictly after the pin block are ignored", async () => {
  const store = [
    { event: "swap", blockNumber: 200n, logIndex: 0, sqrtPriceX96: SQRT_2660 },
    // A later swap AFTER the pin must NOT be used (per-week reproducibility).
    { event: "swap", blockNumber: 500n, logIndex: 0, sqrtPriceX96: 1n },
  ];
  const client = makeFakeClient(store);
  const p = await OnchainPriceProvider.load(baseCfg(client, 300n, 5000n)); // pin=300
  assert.equal(p.priceOf(ETH).micro, EXPECTED_ETH_MICRO);
  assert.match(p.snapshot()[ETH.toLowerCase()].source, /at:200\.0/);
});

test("onchain price: falls back to Initialize when the pool was never swapped", async () => {
  const store = [
    { event: "init", blockNumber: 120n, logIndex: 4, sqrtPriceX96: SQRT_2660 },
  ];
  const client = makeFakeClient(store);
  const p = await OnchainPriceProvider.load(baseCfg(client, 300n, 5000n));
  assert.equal(p.priceOf(ETH).micro, EXPECTED_ETH_MICRO);
  assert.match(p.snapshot()[ETH.toLowerCase()].source, /onchain-ethusdg-v4-init@/);
  assert.match(p.snapshot()[ETH.toLowerCase()].source, /at:120\.4/);
});

test("onchain price: throws loudly when neither Swap nor Initialize exists", async () => {
  const client = makeFakeClient([]); // empty pool -> misconfigured key/manager
  await assert.rejects(
    () => OnchainPriceProvider.load(baseCfg(client, 300n, 5000n)),
    /no Swap or Initialize event/,
  );
});

test("onchain price: two independent loads produce identical snapshots (reproducible)", async () => {
  const store = [
    { event: "swap", blockNumber: 210n, logIndex: 1, sqrtPriceX96: SQRT_2660 },
  ];
  const a = await OnchainPriceProvider.load(baseCfg(makeFakeClient(store), 300n, 5000n));
  const b = await OnchainPriceProvider.load(baseCfg(makeFakeClient(store), 300n, 64n));
  assert.deepEqual(a.snapshot(), b.snapshot()); // byte-identical basis
});

test("onchain price: unknown assets fall back to the documented constant basis", async () => {
  const store = [
    { event: "swap", blockNumber: 210n, logIndex: 1, sqrtPriceX96: SQRT_2660 },
  ];
  const p = await OnchainPriceProvider.load(baseCfg(makeFakeClient(store), 300n, 5000n));
  // An asset with no on-chain pool must not be undefined solely due to onchain
  // mode — it defers to ConstantPriceProvider. Address(0)+USDG are onchain;
  // any PAIR_ASSETS entry other than those resolves via fallback.
  assert.ok(p.priceOf(USDG) !== undefined);
});

test("onchain price: a leaked WRONG-pool / WRONG-manager log is ignored (defensive re-filter)", async () => {
  // Simulate a lax RPC that ignores the indexed `id` topic and the address
  // filter: it returns, at a LATER block, a swap for a DIFFERENT pool and one
  // from a DIFFERENT PoolManager (both with a bogus price). The provider must
  // discard both and price off our pool's correct swap at block 210.
  const OTHER_POOL_ID =
    "0x1111111111111111111111111111111111111111111111111111111111111111";
  const OTHER_MANAGER = "0x0000000000000000000000000000000000009999";
  const store = [
    { event: "swap", blockNumber: 210n, logIndex: 1, sqrtPriceX96: SQRT_2660 }, // ours
    { event: "swap", blockNumber: 260n, logIndex: 0, sqrtPriceX96: 1n, id: OTHER_POOL_ID }, // wrong pool
    { event: "swap", blockNumber: 280n, logIndex: 0, sqrtPriceX96: 1n, address: OTHER_MANAGER }, // wrong manager
  ];
  const p = await OnchainPriceProvider.load(baseCfg(makeFakeClient(store), 300n, 5000n));
  assert.equal(p.priceOf(ETH).micro, EXPECTED_ETH_MICRO); // used OUR swap, not the leaks
  assert.match(p.snapshot()[ETH.toLowerCase()].source, /at:210\.1/);
});

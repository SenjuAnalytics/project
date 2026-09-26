import "./_fixtureEnv.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  replayQuoteAssetRegistry,
  registryKnown,
  registrySnapshot,
} from "../src/quoteAssetRegistry.ts";

const ASSET_A = "0x00000000000000000000000000000000000000aa";
const ASSET_B = "0x00000000000000000000000000000000000000bb";

function setLog(asset, opts = {}) {
  return {
    args: {
      asset,
      phantomQuote: opts.phantom ?? 10n,
      graduationThreshold: opts.threshold ?? 42n,
      decimals: opts.decimals ?? 18,
    },
    blockNumber: opts.block ?? 100n,
    transactionIndex: opts.tx ?? 0,
    logIndex: opts.log ?? 0,
    transactionHash: "0x".padEnd(66, "a"),
  };
}

function disabledLog(asset, opts = {}) {
  return {
    args: { asset },
    blockNumber: opts.block ?? 100n,
    transactionIndex: opts.tx ?? 0,
    logIndex: opts.log ?? 1,
    transactionHash: "0x".padEnd(66, "b"),
  };
}

test("a Set event creates an enabled entry with decimals and curve params", () => {
  const reg = replayQuoteAssetRegistry(
    [setLog(ASSET_A, { decimals: 6, phantom: 10n, threshold: 42n })],
    [],
  );
  const e = reg[ASSET_A];
  assert.ok(e, "entry exists, keyed by the lowercased address");
  assert.equal(e.enabled, true);
  assert.equal(e.decimals, 6);
  assert.equal(e.phantomQuote, 10n);
  assert.equal(e.graduationThreshold, 42n);
  assert.equal(e.lastEventBlock, 100n);
});

test("a Disable flips enabled to false", () => {
  const reg = replayQuoteAssetRegistry(
    [setLog(ASSET_A, { block: 100n })],
    [disabledLog(ASSET_A, { block: 200n })],
  );
  assert.equal(reg[ASSET_A].enabled, false);
  assert.equal(reg[ASSET_A].lastEventBlock, 200n);
});

test("a Set after a Disable re-enables with the fresh parameters", () => {
  const reg = replayQuoteAssetRegistry(
    [setLog(ASSET_A, { block: 100n, decimals: 6 }), setLog(ASSET_A, { block: 300n, decimals: 8, phantom: 99n })],
    [disabledLog(ASSET_A, { block: 200n })],
  );
  const e = reg[ASSET_A];
  assert.equal(e.enabled, true, "re-enabled by the later Set");
  assert.equal(e.decimals, 8, "the LATER set wins");
  assert.equal(e.phantomQuote, 99n);
});

test("ordering is canonical (block, tx, log) — input order does not matter", () => {
  // Same block: the disable is at logIndex 5, the set at logIndex 2 -> the set
  // is earlier, so the disable (later) wins regardless of array order.
  const reg = replayQuoteAssetRegistry(
    [setLog(ASSET_A, { block: 100n, log: 2 })],
    [disabledLog(ASSET_A, { block: 100n, log: 5 })],
  );
  assert.equal(reg[ASSET_A].enabled, false);
});

test("cross-block ordering: a later block's Disable beats an earlier Set", () => {
  const reg = replayQuoteAssetRegistry(
    [setLog(ASSET_A, { block: 150n })],
    [disabledLog(ASSET_A, { block: 200n })],
  );
  assert.equal(reg[ASSET_A].enabled, false);
});

test("asset keys are lowercased even when the event carries checksum case", () => {
  const checksummed = "0x00000000000000000000000000000000000000AA";
  const reg = replayQuoteAssetRegistry([setLog(checksummed)], []);
  assert.ok(reg[ASSET_A], "lookup by the lowercased address works");
  assert.equal(Object.keys(reg).length, 1);
});

test("a Disable with no prior Set is ignored (cannot create an entry)", () => {
  const reg = replayQuoteAssetRegistry([], [disabledLog(ASSET_A)]);
  assert.deepEqual(reg, {});
});

test("registryKnown gates on listed-and-enabled; no registry means ungated", () => {
  const reg = {
    [ASSET_A]: { decimals: 18, enabled: true, phantomQuote: 0n, graduationThreshold: 0n, lastEventBlock: 1n },
    [ASSET_B]: { decimals: 6, enabled: false, phantomQuote: 0n, graduationThreshold: 0n, lastEventBlock: 1n },
  };
  assert.equal(registryKnown(reg, ASSET_A), true);
  assert.equal(registryKnown(reg, ASSET_A.toUpperCase().replace("0X", "0x")), true, "case-insensitive");
  assert.equal(registryKnown(reg, ASSET_B), false, "disabled asset is not known");
  assert.equal(registryKnown(reg, "0x0000000000000000000000000000000000000dead"), false, "unknown asset is not known");
  assert.equal(registryKnown(undefined, ASSET_B), true, "no registry supplied -> ungated (offline default)");
});

test("registrySnapshot is sorted, hash-ready, and empty without a registry", () => {
  const reg = {
    [ASSET_B]: { decimals: 6, enabled: false, phantomQuote: 7n, graduationThreshold: 8n, lastEventBlock: 999n },
    [ASSET_A]: { decimals: 18, enabled: true, phantomQuote: 1n, graduationThreshold: 2n, lastEventBlock: 5n },
  };
  const snap = registrySnapshot(reg);
  assert.deepEqual(Object.keys(snap), [ASSET_A, ASSET_B], "sorted keys");
  assert.deepEqual(snap[ASSET_A], { decimals: 18, enabled: true }, "only the fields that affect scoring");
  assert.deepEqual(registrySnapshot(undefined), {});
});

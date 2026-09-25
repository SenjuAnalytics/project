/**
 * rpc.test.mjs — OFFLINE test for the resilient RPC helpers (src/rpc.ts):
 * transient-error retry/backoff and automatic getLogs range-splitting. No
 * network — a fake client throws synthetic errors so the behaviour is
 * deterministic.
 *
 * Backoff is pinned to 0ms and retries to a known count via env. rpc.ts reads
 * those at module load, so it is imported DYNAMICALLY *after* the assignments
 * (static `import` is hoisted and would run before them).
 */
process.env.INDEXER_RPC_BACKOFF_MS = "0";
process.env.INDEXER_RPC_RETRIES = "3";

import test from "node:test";
import assert from "node:assert/strict";

const {
  withRetry,
  getLogsResilient,
  getBlockResilient,
  isRangeTooLargeError,
  isTransientRpcError,
  RPC_RETRIES,
} = await import("../src/rpc.ts");

/* ------------------------------------------------------------------ */
/* Error classification                                                */
/* ------------------------------------------------------------------ */
test("classifies transient vs range-too-large vs unrelated errors", () => {
  assert.equal(isTransientRpcError(new Error("HTTP 429 Too Many Requests")), true);
  assert.equal(isTransientRpcError(new Error("request timeout")), true);
  assert.equal(isTransientRpcError(new Error("socket hang up")), true);
  // A range error must NOT be transient (retrying the same wide call won't help;
  // the caller splits it instead).
  assert.equal(isTransientRpcError(new Error("query returned more than 10000 results")), false);
  assert.equal(isRangeTooLargeError(new Error("query returned more than 10000 results")), true);
  assert.equal(isRangeTooLargeError(new Error("block range too large")), true);
  // An unrelated error is neither.
  assert.equal(isTransientRpcError(new Error("execution reverted")), false);
  assert.equal(isRangeTooLargeError(new Error("execution reverted")), false);
});

/* ------------------------------------------------------------------ */
/* withRetry                                                           */
/* ------------------------------------------------------------------ */
test("withRetry: retries transient errors then succeeds", async () => {
  let calls = 0;
  const out = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error("429 too many requests");
    return "ok";
  }, "unit");
  assert.equal(out, "ok");
  assert.equal(calls, 3); // failed twice, succeeded on the 3rd attempt
});

test("withRetry: rethrows a non-transient error immediately (no retry)", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw new Error("execution reverted");
    }, "unit"),
    /execution reverted/,
  );
  assert.equal(calls, 1);
});

test("withRetry: gives up after RPC_RETRIES transient failures", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(async () => {
      calls += 1;
      throw new Error("503 service unavailable");
    }, "unit"),
    /service unavailable/,
  );
  assert.equal(calls, RPC_RETRIES + 1); // first attempt + RPC_RETRIES retries
});

/* ------------------------------------------------------------------ */
/* getBlockResilient                                                   */
/* ------------------------------------------------------------------ */
test("getBlockResilient: retries a transient getBlock then returns", async () => {
  let calls = 0;
  const client = {
    async getBlock({ blockNumber }) {
      calls += 1;
      if (calls < 2) throw new Error("ETIMEDOUT");
      return { number: blockNumber, timestamp: 123n };
    },
  };
  const b = await getBlockResilient(client, 42n);
  assert.equal(b.timestamp, 123n);
  assert.equal(calls, 2);
});

/* ------------------------------------------------------------------ */
/* getLogsResilient: automatic range splitting                         */
/* ------------------------------------------------------------------ */
test("getLogsResilient: splits a too-large range and returns ALL logs exactly once", async () => {
  const FROM = 0n;
  const TO = 100n;
  const MAX_INCLUSIVE_SPAN = 3n; // fake RPC caps windows at 4 blocks (to-from<=3)
  let calls = 0;
  const client = {
    async getLogs({ fromBlock, toBlock }) {
      calls += 1;
      if (toBlock - fromBlock > MAX_INCLUSIVE_SPAN) {
        throw new Error("query returned more than 10000 results");
      }
      const logs = [];
      for (let b = fromBlock; b <= toBlock; b += 1n) logs.push({ blockNumber: b });
      return logs;
    },
  };
  const logs = await getLogsResilient(client, { fromBlock: FROM, toBlock: TO });
  assert.equal(logs.length, Number(TO - FROM + 1n));
  assert.ok(calls > 1, "expected the wide range to be split into multiple calls");
  const nums = logs.map((l) => Number(l.blockNumber)).sort((a, b) => a - b);
  for (let i = 0; i <= 100; i++) assert.equal(nums[i], i, `block ${i} present exactly once`);
});

test("getLogsResilient: rethrows a range error that cannot be split further", async () => {
  const client = {
    async getLogs() {
      throw new Error("query returned more than 10000 results");
    },
  };
  await assert.rejects(
    getLogsResilient(client, { fromBlock: 7n, toBlock: 7n }),
    /more than 10000/,
  );
});

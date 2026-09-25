/**
 * rpc.ts
 * -----------------------------------------------------------------------------
 * Resilient wrappers around the viem PublicClient's `getBlock` / `getLogs`, so a
 * long historical scan against a public / rate-limited RPC does not fail — or
 * silently look like a "parity mismatch" — for reasons unrelated to the
 * indexer's determinism:
 *
 *   - Transient failures (HTTP 429 / 5xx, timeouts, dropped sockets) are retried
 *     with exponential backoff. Tunable via INDEXER_RPC_RETRIES (default 4) and
 *     INDEXER_RPC_BACKOFF_MS (default 250).
 *   - "Block range too large / too many results" responses are handled by
 *     AUTOMATICALLY halving the [fromBlock, toBlock] window and fetching each
 *     half recursively, so a large INDEXER_LOG_PAGE_SIZE (or an unexpectedly
 *     dense range) is safe on any RPC.
 *
 * This never changes the set, order, or content of the logs returned, so it is
 * fully reproducibility-neutral: operator and verifier obtain the identical
 * result and therefore the identical datasetHash.
 */
import type { PublicClient } from "viem";

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

/** Max retry attempts for a transient error (in addition to the first try). */
export const RPC_RETRIES = intFromEnv("INDEXER_RPC_RETRIES", 4);
/** Base backoff in milliseconds; doubled on each successive retry. */
export const RPC_BACKOFF_MS = intFromEnv("INDEXER_RPC_BACKOFF_MS", 250);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Lowercased, joined error text used for message matching. */
function errText(err: unknown): string {
  const e = err as any;
  return [e?.message, e?.shortMessage, e?.details, e?.cause?.message]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * The RPC rejected the call because the block RANGE / result set is too large.
 * These are NOT retried as-is (retrying the same wide call won't help) — the
 * caller splits the window instead.
 */
export function isRangeTooLargeError(err: unknown): boolean {
  const t = errText(err);
  if (!t) return false;
  if (
    containsAny(t, [
      "too many results",
      "query returned more than",
      "response size",
      "limit exceeded",
      "exceeds the limit",
      "log response size exceeded",
      "block range too large",
      "block range is too large",
      "range too large",
      "max results",
    ])
  ) {
    return true;
  }
  // Generic "range" paired with a size qualifier.
  return (
    t.includes("range") &&
    containsAny(t, ["large", "wide", "exceed", "limit", "too many", "maximum"])
  );
}

/**
 * A transient error worth retrying with backoff: rate limits, timeouts, and
 * temporary server / socket failures. A "range too large" error is explicitly
 * NOT transient.
 */
export function isTransientRpcError(err: unknown): boolean {
  const t = errText(err);
  if (!t || isRangeTooLargeError(err)) return false;
  return containsAny(t, [
    "429",
    "too many requests",
    "rate limit",
    "timeout",
    "timed out",
    "etimedout",
    "econnreset",
    "econnrefused",
    "enotfound",
    "socket hang up",
    "network",
    "fetch failed",
    "502",
    "503",
    "504",
    "bad gateway",
    "service unavailable",
    "try again",
  ]);
}

/**
 * Run `fn`, retrying transient errors up to RPC_RETRIES times with exponential
 * backoff. Non-transient errors (including "range too large") are rethrown
 * immediately so the caller can handle them (e.g. by splitting the range).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RPC_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === RPC_RETRIES || !isTransientRpcError(err)) break;
      const delay = RPC_BACKOFF_MS * 2 ** attempt;
      console.warn(
        `[rpc] ${label} failed (${errText(err).slice(0, 140)}); ` +
          `retry ${attempt + 1}/${RPC_RETRIES} in ${delay}ms`,
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** getBlock with transient-error retry/backoff. */
export async function getBlockResilient(
  client: PublicClient,
  blockNumber: bigint,
) {
  return withRetry(
    () => client.getBlock({ blockNumber }),
    `getBlock(${blockNumber.toString()})`,
  );
}

export interface ResilientLogsArgs {
  address?: `0x${string}`;
  event?: unknown;
  args?: unknown;
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * getLogs with transient-error retry AND automatic range-splitting: on a
 * "range too large / too many results" error the [fromBlock, toBlock] window is
 * halved and each half fetched recursively, then concatenated. The halves are
 * disjoint, so no dedup/reorder is needed and the returned logs are exactly
 * those the RPC would have returned for the full window — identical regardless
 * of INDEXER_LOG_PAGE_SIZE or the RPC's own range cap.
 */
export async function getLogsResilient(
  client: PublicClient,
  params: ResilientLogsArgs,
): Promise<any[]> {
  const { fromBlock, toBlock } = params;
  try {
    return (await withRetry(
      () => (client.getLogs as any)(params),
      `getLogs[${fromBlock.toString()},${toBlock.toString()}]`,
    )) as any[];
  } catch (err) {
    if (isRangeTooLargeError(err) && toBlock > fromBlock) {
      const mid = fromBlock + (toBlock - fromBlock) / 2n;
      console.warn(
        `[rpc] getLogs[${fromBlock.toString()},${toBlock.toString()}] ` +
          `range too large; splitting at ${mid.toString()}`,
      );
      const left = await getLogsResilient(client, { ...params, toBlock: mid });
      const right = await getLogsResilient(client, {
        ...params,
        fromBlock: mid + 1n,
      });
      return [...left, ...right];
    }
    throw err;
  }
}

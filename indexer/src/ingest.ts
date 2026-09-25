/**
 * ingest.ts
 * -----------------------------------------------------------------------------
 * Fetches on-chain logs via viem and produces a DETERMINISTICALLY ORDERED array
 * of normalized trades.
 *
 * Ordering key: (blockNumber, transactionIndex, logIndex) ascending — this is
 * the canonical on-chain order and is stable across nodes.
 *
 * Notional (in quote-asset smallest units):
 *   - pool buy  (Swapped.buyingToken=true)  => amountIn   (quote in)
 *   - pool sell (Swapped.buyingToken=false) => amountOut  (quote out)
 *   - curve buy (Bought)                    => amountIn   (quote in)
 *   - curve sell(Sold)                      => amountOut  (quote out)
 *
 * Trader = Swapped.payer / Bought.payer / Sold.seller.
 */
import {
  createPublicClient,
  http,
  type PublicClient,
  type AbiEvent,
} from "viem";
import {
  RPC_URL,
  CHAIN_ID,
  ADDRESSES,
  LOG_PAGE_SIZE,
  DEPLOY_BLOCK,
} from "./config.ts";
import {
  SwappedEvent,
  BoughtEvent,
  SoldEvent,
  TokenLaunchedEvent,
} from "./abi/index.ts";
import type { NormalizedTrade, CreatorMap } from "./types.ts";
import { pairAssetByAddress } from "./config.ts";
import { weekEnd } from "./leaderboard.ts";
import { getBlockResilient, getLogsResilient } from "./rpc.ts";

/** ETH native sentinel used by PAIR_ASSETS (address(0)). */
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * curve (lowercased) -> its launched token + quote asset, from TokenLaunched.
 * Bought/Sold events carry NO token/quoteAsset, so we resolve them by the
 * emitting curve address.
 */
export type CurveInfo = { token: string; quoteAsset: string };
export type CurveMap = Record<string, CurveInfo>;

/**
 * Option B — normalize a curve trade's quote asset.
 * ETH-native curves emit a TokenLaunched.quoteAsset that is a non-standard
 * sentinel (no contract code, not in PAIR_ASSETS). We map any quote asset that
 * is not a known priced asset to the ETH native address(0) so it prices as ETH,
 * matching the config convention (native ETH = address(0)).
 */
function normalizeQuote(qa: string): string {
  const lc = (qa ?? "").toLowerCase();
  if (pairAssetByAddress(lc)) return lc; // already a known priced asset
  return ETH_ADDRESS; // ETH-native sentinel (or unknown) -> price as ETH
}

export function makeClient(): PublicClient {
  return createPublicClient({
    transport: http(RPC_URL),
    // A minimal inline chain definition keeps us independent of viem/chains.
    chain: {
      id: CHAIN_ID,
      name: "robinhood-testnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [RPC_URL] } },
    },
  });
}

/** Paginated getLogs across [fromBlock, toBlock] for a single event/address. */
async function getLogsPaged(
  client: PublicClient,
  params: {
    address: `0x${string}`;
    event: AbiEvent;
    fromBlock: bigint;
    toBlock: bigint;
  },
): Promise<any[]> {
  const out: any[] = [];
  let start = params.fromBlock;
  while (start <= params.toBlock) {
    const end =
      start + LOG_PAGE_SIZE - 1n > params.toBlock
        ? params.toBlock
        : start + LOG_PAGE_SIZE - 1n;
    const logs = await getLogsResilient(client, {
      address: params.address,
      event: params.event,
      fromBlock: start,
      toBlock: end,
    });
    out.push(...logs);
    start = end + 1n;
  }
  return out;
}

/** Sort key comparator for deterministic ordering. */
function compareTrades(a: NormalizedTrade, b: NormalizedTrade): number {
  if (a.blockNumber !== b.blockNumber)
    return a.blockNumber < b.blockNumber ? -1 : 1;
  if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
  return a.logIndex - b.logIndex;
}

/**
 * Normalize raw viem logs into trades. Exported so the offline test can reuse
 * the exact same normalization/ordering logic with hand-built log objects.
 */
export function normalizeLogs(raw: {
  swapped: any[];
  bought: any[];
  sold: any[];
  /**
   * curve(lowercased) -> { token, quoteAsset } from TokenLaunched. Bought/Sold
   * logs are resolved by their emitting curve address (l.address); logs from a
   * curve NOT in this map are ignored (not a Qualyra-launched token).
   */
  curveMap?: CurveMap;
}): NormalizedTrade[] {
  const trades: NormalizedTrade[] = [];
  const curveMap: CurveMap = raw.curveMap ?? {};

  for (const l of raw.swapped) {
    const a = l.args;
    const buying = Boolean(a.buyingToken);
    trades.push({
      token: String(a.token).toLowerCase(),
      trader: String(a.payer).toLowerCase(),
      quoteAsset: l.quoteAsset ? String(l.quoteAsset).toLowerCase() : "",
      notionalQuote: buying ? BigInt(a.amountIn) : BigInt(a.amountOut),
      side: buying ? "buy" : "sell",
      blockNumber: BigInt(l.blockNumber),
      txIndex: Number(l.transactionIndex),
      logIndex: Number(l.logIndex),
      txHash: String(l.transactionHash).toLowerCase(),
    });
  }

  for (const l of raw.bought) {
    const a = l.args;
    const curve = String(l.address ?? "").toLowerCase();
    const info = curveMap[curve];
    if (!info) continue; // not a known Qualyra curve -> skip
    trades.push({
      token: info.token.toLowerCase(),
      trader: String(a.payer).toLowerCase(),
      quoteAsset: normalizeQuote(info.quoteAsset),
      notionalQuote: BigInt(a.amountIn),
      side: "buy",
      blockNumber: BigInt(l.blockNumber),
      txIndex: Number(l.transactionIndex),
      logIndex: Number(l.logIndex),
      txHash: String(l.transactionHash).toLowerCase(),
    });
  }

  for (const l of raw.sold) {
    const a = l.args;
    const curve = String(l.address ?? "").toLowerCase();
    const info = curveMap[curve];
    if (!info) continue; // not a known Qualyra curve -> skip
    trades.push({
      token: info.token.toLowerCase(),
      trader: String(a.seller).toLowerCase(),
      quoteAsset: normalizeQuote(info.quoteAsset),
      notionalQuote: BigInt(a.amountOut),
      side: "sell",
      blockNumber: BigInt(l.blockNumber),
      txIndex: Number(l.transactionIndex),
      logIndex: Number(l.logIndex),
      txHash: String(l.transactionHash).toLowerCase(),
    });
  }

  trades.sort(compareTrades);
  return trades;
}

/** Paginated getLogs by EVENT only (no address filter) across [from,to]. */
async function getLogsPagedNoAddress(
  client: PublicClient,
  params: { event: AbiEvent; fromBlock: bigint; toBlock: bigint },
): Promise<any[]> {
  const out: any[] = [];
  let start = params.fromBlock;
  while (start <= params.toBlock) {
    const end =
      start + LOG_PAGE_SIZE - 1n > params.toBlock
        ? params.toBlock
        : start + LOG_PAGE_SIZE - 1n;
    const logs = await getLogsResilient(client, {
      event: params.event,
      fromBlock: start,
      toBlock: end,
    });
    out.push(...logs);
    start = end + 1n;
  }
  return out;
}

/** Fetch per-token creators from TokenLaunched over the range. */
export async function fetchCreators(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<CreatorMap> {
  const logs = await getLogsPaged(client, {
    address: ADDRESSES.factory as `0x${string}`,
    event: TokenLaunchedEvent as AbiEvent,
    fromBlock,
    toBlock,
  });
  const map: CreatorMap = {};
  for (const l of logs) {
    const a: any = (l as any).args;
    map[String(a.token).toLowerCase()] = String(a.creator).toLowerCase();
  }
  return map;
}

/**
 * Build curve(lowercased) -> { token, quoteAsset } from factory TokenLaunched.
 * This is what lets us resolve Bought/Sold (which carry no token/quoteAsset)
 * back to their launched token, and restricts ingestion to Qualyra curves.
 */
export async function fetchCurveMap(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<CurveMap> {
  const logs = await getLogsPaged(client, {
    address: ADDRESSES.factory as `0x${string}`,
    event: TokenLaunchedEvent as AbiEvent,
    fromBlock,
    toBlock,
  });
  const map: CurveMap = {};
  for (const l of logs) {
    const a: any = (l as any).args;
    const curve = String(a.curve).toLowerCase();
    map[curve] = {
      token: String(a.token).toLowerCase(),
      quoteAsset: String(a.quoteAsset).toLowerCase(),
    };
  }
  return map;
}

/**
 * Fetch and normalize all trades in [fromBlock, toBlock].
 * Network errors bubble up; the CLI wraps them with a clear message.
 */
export async function ingestTrades(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint,
  /** Optional pre-fetched curve map; fetched here when omitted. */
  curveMap?: CurveMap,
): Promise<NormalizedTrade[]> {
  const cmap = curveMap ?? (await fetchCurveMap(client, fromBlock, toBlock));

  const [swapped, bought, sold] = await Promise.all([
    // Swapped is emitted by the periphery SwapRouter (correct address filter).
    getLogsPaged(client, {
      address: ADDRESSES.swapRouter as `0x${string}`,
      event: SwappedEvent as AbiEvent,
      fromBlock,
      toBlock,
    }),
    // Bought/Sold are emitted by EACH per-token BondingCurve (many addresses),
    // so we match by event signature across all contracts and then keep only
    // logs whose emitting address is a known Qualyra curve (see normalizeLogs).
    getLogsPagedNoAddress(client, {
      event: BoughtEvent as AbiEvent,
      fromBlock,
      toBlock,
    }).catch(() => [] as any[]),
    getLogsPagedNoAddress(client, {
      event: SoldEvent as AbiEvent,
      fromBlock,
      toBlock,
    }).catch(() => [] as any[]),
  ]);

  return normalizeLogs({ swapped, bought, sold, curveMap: cmap });
}

/** Deterministic per-week upper block bound (+ whether the week has closed). */
export interface WeekBlockRange {
  /** Highest block whose timestamp is strictly before weekEnd(week). */
  toBlock: bigint;
  /** True once the week has fully elapsed on-chain (toBlock is a FIXED block). */
  closed: boolean;
  /**
   * True when the ENTIRE week ends at or before the factory deploy block's
   * timestamp — i.e. no block in [DEPLOY_BLOCK, latest] falls inside the week,
   * so the week contains zero indexable activity. Such a week must NOT be
   * treated as a committable "closed" week; callers should refuse to commit it.
   */
  predatesDeploy: boolean;
}

/**
 * Resolve the DETERMINISTIC per-week upper block bound: the highest block whose
 * timestamp is strictly before `weekEnd(week)` (the week window is
 * [weekStart, weekEnd)). For a CLOSED week this is a fixed historical block, so
 * BOTH the scanned trade set AND the pinned on-chain price block reproduce
 * byte-identically on any machine and at any later time — this is what makes the
 * committed datasetHash publicly verifiable. While the week is still open
 * (weekEnd in the future) it falls back to the latest block and reports
 * `closed:false`, signalling the commitment would be PROVISIONAL.
 *
 * Uses binary search over block timestamps (monotonically increasing), so it is
 * O(log n) header reads — no per-trade timestamp lookups. Both `index-week`
 * (commit) and `verifyWeek` (public verify) call this, guaranteeing they scan
 * the identical range.
 */
export async function resolveWeekToBlock(
  client: PublicClient,
  week: bigint,
): Promise<WeekBlockRange> {
  const endTs = weekEnd(week); // unix seconds (exclusive upper bound)
  const latest = await client.getBlockNumber();

  // Reorg safety: don't trust the raw chain tip. A CLOSED decision is only made
  // once the week-end boundary is buried under INDEXER_CONFIRMATIONS blocks, so
  // a shallow reorg near weekEnd can't shift `toBlock` after the operator has
  // committed. `safeLatest` is the deepest block we treat as stable; it also
  // bounds the binary search. Default 0 keeps offline/CI behaviour unchanged;
  // production should set a value >= the chain's practical finality depth.
  const confRaw = process.env.INDEXER_CONFIRMATIONS;
  const confirmations = confRaw && /^\d+$/.test(confRaw) ? BigInt(confRaw) : 0n;
  const safeLatest =
    latest - confirmations > DEPLOY_BLOCK ? latest - confirmations : DEPLOY_BLOCK;

  const safeLatestBlock = await getBlockResilient(client, safeLatest);
  if (safeLatestBlock.timestamp < endTs) {
    // Week has not finished (or not yet buried under `confirmations`) -> the
    // upper bound is still moving; report PROVISIONAL at the safe tip.
    return { toBlock: safeLatest, closed: false, predatesDeploy: false };
  }
  // Guard the pre-deploy edge case: if the WHOLE week ends at or before the
  // factory deploy block's timestamp, NO block in [DEPLOY_BLOCK, safeLatest] is
  // inside the week (binary search below would find nothing and fall back to
  // DEPLOY_BLOCK). Such a week has zero indexable activity and must not be
  // reported as a committable `closed` week — flag it so callers refuse it.
  const deployBlock = await getBlockResilient(client, DEPLOY_BLOCK);
  if (endTs <= deployBlock.timestamp) {
    return { toBlock: DEPLOY_BLOCK, closed: false, predatesDeploy: true };
  }
  // Highest block with timestamp < endTs, searched within [DEPLOY_BLOCK, safeLatest].
  let lo = DEPLOY_BLOCK;
  let hi = safeLatest;
  let ans = DEPLOY_BLOCK;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1n;
    const b = await getBlockResilient(client, mid);
    if (b.timestamp < endTs) {
      ans = mid;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }
  return { toBlock: ans, closed: true, predatesDeploy: false };
}

/**
 * The block at which the on-chain price basis is pinned. For a REPRODUCIBLE
 * commitment this MUST equal `toBlock` (the deterministic per-week/battle upper
 * bound) so the operator (commit) and the public (verify) read the identical
 * pool state and produce the identical datasetHash.
 *
 * `INDEXER_PRICE_BLOCK` is a DEBUG-ONLY override and is IGNORED unless
 * `INDEXER_ALLOW_UNSAFE_PRICE_BLOCK=1` is also set. When honored it prints a
 * loud warning, because a hand-picked price block that a verifier does not also
 * set will make an honest commitment MISMATCH — exactly the failure mode the
 * deterministic pinning was introduced to remove.
 */
export function resolvePriceBlock(toBlock: bigint): bigint {
  const override = process.env.INDEXER_PRICE_BLOCK;
  const allowUnsafe = process.env.INDEXER_ALLOW_UNSAFE_PRICE_BLOCK === "1";
  if (override && allowUnsafe) {
    console.warn(
      `[UNSAFE] Pricing at INDEXER_PRICE_BLOCK=${override} instead of the ` +
        `deterministic toBlock=${toBlock.toString()}. The resulting datasetHash is ` +
        `NON-REPRODUCIBLE and MUST NOT be committed on-chain — a public verifier ` +
        `(who prices at toBlock) will report MISMATCH.`,
    );
    return BigInt(override);
  }
  if (override && !allowUnsafe) {
    console.warn(
      `[ignored] INDEXER_PRICE_BLOCK=${override} is ignored (reproducibility guard). ` +
        `Pricing at toBlock=${toBlock.toString()}. Set INDEXER_ALLOW_UNSAFE_PRICE_BLOCK=1 ` +
        `to force it for local debugging only.`,
    );
  }
  return toBlock;
}

/**
 * Validate the trade-scan floor (`START_BLOCK`) against the deploy block and the
 * resolved per-week upper bound. `START_BLOCK` is NOT part of the dataset hash,
 * but a bad override can silently corrupt a commit:
 *   - START_BLOCK > toBlock       => the scan window is EMPTY (no trades) — fatal
 *     for a week commit, so callers should refuse.
 *   - START_BLOCK > DEPLOY_BLOCK  => trades before it are skipped, which can DROP
 *     early trades and change the datasetHash — warn.
 *   - START_BLOCK < DEPLOY_BLOCK  => harmless (nothing exists pre-deploy) but the
 *     extra range only slows the scan — warn.
 * Pure function (no I/O) so it is unit-tested offline.
 */
export interface ScanFloorCheck {
  warnings: string[];
  fatal?: string;
}
export function checkScanFloor(
  startBlock: bigint,
  deployBlock: bigint,
  toBlock: bigint,
): ScanFloorCheck {
  const warnings: string[] = [];
  let fatal: string | undefined;
  if (startBlock > toBlock) {
    fatal =
      `INDEXER_START_BLOCK=${startBlock.toString()} is greater than the resolved ` +
      `toBlock=${toBlock.toString()} — the trade-scan window is EMPTY. Unset ` +
      `INDEXER_START_BLOCK (it defaults to DEPLOY_BLOCK) so the full week is scanned.`;
  }
  if (startBlock > deployBlock) {
    warnings.push(
      `INDEXER_START_BLOCK=${startBlock.toString()} is above DEPLOY_BLOCK=` +
        `${deployBlock.toString()}; trades before it are skipped, which can DROP ` +
        `early trades and change the datasetHash. Leave it unset for a canonical commit.`,
    );
  } else if (startBlock < deployBlock) {
    warnings.push(
      `INDEXER_START_BLOCK=${startBlock.toString()} is below DEPLOY_BLOCK=` +
        `${deployBlock.toString()}; nothing indexable exists before deploy, so the ` +
        `extra range only slows the scan (hashes are unaffected).`,
    );
  }
  return { warnings, fatal };
}

export { compareTrades };

/**
 * quoteAssetRegistry.ts
 * -----------------------------------------------------------------------------
 * The factory's quote-asset registry, reconstructed from its LOGS.
 *
 * QualyraFactory is the on-chain source of truth for which pair (quote) assets
 * exist and for their DECIMALS: `setQuoteAsset` reverts unless the token's
 * on-chain `decimals()` matches the claimed scale (native ETH is forced to 18),
 * and every change is logged as `QuoteAssetSet` / `QuoteAssetDisabled`.
 *
 * Replaying those events over [deployBlock, toBlock] yields the registry state
 * exactly at the pinned block — using only getLogs (NO historical eth_call), so
 * the replay is byte-identical on any non-archive RPC, the same determinism
 * philosophy as the on-chain ETH/USDG price read (see OnchainPriceProvider).
 * Operator and verifier scan the same range and therefore derive the identical
 * registry.
 *
 * Why the indexer needs this (ISSUE-LIST Q-11 item 2): the hardcoded
 * PAIR_ASSETS map used to be the only place pair assets and their decimals
 * lived, so an asset added on-chain was silently invisible here — and a
 * DECIMALS typo would have mis-scaled its USD volume with no error at all.
 * The registry is now the source of truth for EXISTENCE and DECIMALS; the
 * config constants remain only as the USD price BASIS.
 */
import type { PublicClient, AbiEvent } from "viem";
import { ADDRESSES, DEPLOY_BLOCK, LOG_PAGE_SIZE } from "./config.ts";
import { QuoteAssetSetEvent, QuoteAssetDisabledEvent } from "./abi/index.ts";
import { getLogsResilient } from "./rpc.ts";

export interface QuoteAssetInfo {
  /** The pair asset's own token decimals (verified on-chain at setQuoteAsset). */
  decimals: number;
  /** False after a QuoteAssetDisabled that no later QuoteAssetSet reversed. */
  enabled: boolean;
  /** Phantom (virtual) quote reserve configured for this asset's curves. */
  phantomQuote: bigint;
  /** Graduation threshold configured for this asset's curves. */
  graduationThreshold: bigint;
  /** Block of the event that last touched this entry (diagnostics only). */
  lastEventBlock: bigint;
}

/** Lowercased asset address -> its registry state. Native ETH = address(0). */
export type QuoteAssetRegistry = Record<string, QuoteAssetInfo>;

/** One ordered registry event (Set or Disabled) ready for replay. */
interface RegistryEvent {
  kind: "set" | "disabled";
  asset: string; // lowercased
  decimals: number;
  phantomQuote: bigint;
  graduationThreshold: bigint;
  blockNumber: bigint;
  txIndex: number;
  logIndex: number;
}

function eventOrder(a: RegistryEvent, b: RegistryEvent): number {
  if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
  if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
  return a.logIndex - b.logIndex;
}

/**
 * Pure replay of factory registry events into a registry. `setLogs` /
 * `disabledLogs` are raw viem-decoded logs (args already objects); input order
 * does not matter — we sort by the canonical (block, tx, log) order first. This
 * is exported separately from the network fetch so the offline tests exercise
 * the exact same replay logic with hand-built logs.
 */
export function replayQuoteAssetRegistry(
  setLogs: any[],
  disabledLogs: any[],
): QuoteAssetRegistry {
  const events: RegistryEvent[] = [];
  for (const l of setLogs) {
    const a: any = l.args;
    events.push({
      kind: "set",
      asset: String(a.asset).toLowerCase(),
      decimals: Number(a.decimals),
      phantomQuote: BigInt(a.phantomQuote),
      graduationThreshold: BigInt(a.graduationThreshold),
      blockNumber: BigInt(l.blockNumber),
      txIndex: Number(l.transactionIndex ?? 0),
      logIndex: Number(l.logIndex ?? 0),
    });
  }
  for (const l of disabledLogs) {
    const a: any = l.args;
    events.push({
      kind: "disabled",
      asset: String(a.asset).toLowerCase(),
      decimals: 0,
      phantomQuote: 0n,
      graduationThreshold: 0n,
      blockNumber: BigInt(l.blockNumber),
      txIndex: Number(l.transactionIndex ?? 0),
      logIndex: Number(l.logIndex ?? 0),
    });
  }
  events.sort(eventOrder);

  const out: QuoteAssetRegistry = {};
  for (const e of events) {
    if (e.kind === "set") {
      // A Set (re-)enables the asset with fresh parameters — also after a
      // previous Disable.
      out[e.asset] = {
        decimals: e.decimals,
        enabled: true,
        phantomQuote: e.phantomQuote,
        graduationThreshold: e.graduationThreshold,
        lastEventBlock: e.blockNumber,
      };
    } else {
      const cur = out[e.asset];
      // A disable with no prior set is impossible on-chain (the factory
      // reverts); ignore it defensively so a stray log can never create an
      // entry.
      if (cur) {
        cur.enabled = false;
        cur.lastEventBlock = e.blockNumber;
      }
    }
  }
  return out;
}

/** Paginated getLogs across [fromBlock, toBlock] for one factory event. */
async function getLogsPaged(
  client: PublicClient,
  event: AbiEvent,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<any[]> {
  const out: any[] = [];
  let start = fromBlock;
  while (start <= toBlock) {
    const end =
      start + LOG_PAGE_SIZE - 1n > toBlock ? toBlock : start + LOG_PAGE_SIZE - 1n;
    const logs = await getLogsResilient(client, {
      address: ADDRESSES.factory as `0x${string}`,
      event,
      fromBlock: start,
      toBlock: end,
    });
    out.push(...logs);
    start = end + 1n;
  }
  return out;
}

/**
 * Fetch the factory's quote-asset registry as of `toBlock`, from its LOGS in
 * [fromBlock, toBlock] (default fromBlock = the factory deploy block). Uses no
 * historical state reads, so it reproduces on any non-archive RPC.
 */
export async function fetchQuoteAssetRegistry(
  client: PublicClient,
  fromBlock: bigint = DEPLOY_BLOCK,
  toBlock: bigint,
): Promise<QuoteAssetRegistry> {
  const [setLogs, disabledLogs] = await Promise.all([
    getLogsPaged(client, QuoteAssetSetEvent as AbiEvent, fromBlock, toBlock),
    getLogsPaged(client, QuoteAssetDisabledEvent as AbiEvent, fromBlock, toBlock),
  ]);
  return replayQuoteAssetRegistry(setLogs, disabledLogs);
}

/**
 * Is `addr` a currently-listed (set AND not disabled) pair asset? A trade whose
 * quote asset fails this check must NOT be priced — not even guessed as ETH
 * (ISSUE-LIST Q-11 item 3). When no registry is supplied (offline default), the
 * gate is open and the provider's own knowledge decides.
 */
export function registryKnown(
  registry: QuoteAssetRegistry | undefined,
  addr: string,
): boolean {
  if (registry === undefined) return true; // no gate supplied (offline default)
  const e = registry[addr.toLowerCase()];
  return !!e && e.enabled;
}

/**
 * Deterministic, hash-ready view of the registry used for the dataset: sorted
 * lowercased-address keys, only the fields that affect scoring (decimals +
 * enabled). Embedded into the dataset so the datasetHash pins the exact
 * registry state used.
 */
export function registrySnapshot(
  registry: QuoteAssetRegistry | undefined,
): Record<string, { decimals: number; enabled: boolean }> {
  const out: Record<string, { decimals: number; enabled: boolean }> = {};
  if (!registry) return out;
  for (const addr of Object.keys(registry).sort()) {
    out[addr] = {
      decimals: registry[addr].decimals,
      enabled: registry[addr].enabled,
    };
  }
  return out;
}

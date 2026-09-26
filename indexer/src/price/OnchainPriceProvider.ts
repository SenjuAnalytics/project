/**
 * price/OnchainPriceProvider.ts
 * -----------------------------------------------------------------------------
 * Phase 2 PriceProvider: derives the ETH/USD basis from an on-chain Uniswap v4
 * ETH/USDG pool, so testnet (46630) and mainnet (4663) use the EXACT SAME price
 * code path — no chain branch. USDG is the $1 numeraire; every other pair asset
 * falls back to the documented constant basis (until it gets its own on-chain
 * pool).
 *
 * Determinism WITHOUT an archive node: instead of reading pool STATE (slot0) at
 * a historical block — which non-archive RPCs cannot serve — we read the
 * sqrtPriceX96 carried by the pool's LOGS. We take the LAST `Swap` event whose
 * block is <= the pinned upper-bound block (fallback: the pool's `Initialize`
 * event when it has never been swapped). Logs are retained/indexed by ordinary
 * RPCs, so operator and verifier reproduce the identical price on any node. The
 * resolved micro-USD numbers are frozen into snapshot() so the datasetHash is
 * reproducible. All math is BigInt (no floats).
 *
 *   poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 *   sqrtPriceX96 = <last Swap|Initialize event for poolId at block <= pin>
 *
 * Price conversion (currency0 = ETH 18dec, currency1 = USDG 6dec):
 *   price_raw   = sqrtPriceX96^2 / 2^192                 // USDG_raw per ETH_raw
 *   ethUsdMicro = price_raw * 10^(ethDec - usdgDec) * usdgUsdMicro
 *               = sqrtPriceX96^2 * 10^(ethDec-usdgDec) * usdgUsdMicro / 2^192
 */
import {
  keccak256,
  encodeAbiParameters,
  type PublicClient,
  type Address,
  type AbiEvent,
  type Hex,
} from "viem";
import { ConstantPriceProvider } from "./ConstantPriceProvider.ts";
import { V4SwapEvent, V4InitializeEvent } from "../abi/index.ts";
import type { AssetPrice, PriceProvider } from "./PriceProvider.ts";
import { getLogsResilient } from "../rpc.ts";
import {
  registryKnown,
  registrySnapshot as snapshotRegistry,
  type QuoteAssetRegistry,
} from "../quoteAssetRegistry.ts";

const Q192 = 1n << 192n;

/** The ETH/USDG reference PoolKey. Must match the on-chain pool exactly. */
export interface EthUsdgPoolKey {
  /** currency0 (lower address). Native-ETH pool => the zero address. */
  currency0: Address;
  /** currency1 (higher address) — the USDG token. */
  currency1: Address;
  /** LP fee (uint24), e.g. 3000 for 0.30%. */
  fee: number;
  /** tick spacing (int24), e.g. 60. */
  tickSpacing: number;
  /** hooks contract (address(0) for the plain reference pool). */
  hooks: Address;
}

export interface OnchainPriceConfig {
  client: PublicClient;
  /** Uniswap v4 PoolManager address. */
  poolManager: Address;
  /** The ETH/USDG reference pool key. */
  poolKey: EthUsdgPoolKey;
  /** Upper-bound (pin) block: use the LAST pool event at a block <= this. */
  blockNumber: bigint;
  /** Lower bound for the event scan (e.g. factory/pool deploy block). */
  fromBlock: bigint;
  /** getLogs window size for the backward scan (default 5000). */
  pageSize?: bigint;
  /** ETH token decimals (native = 18). */
  ethDecimals?: number;
  /** USDG token decimals (6). */
  usdgDecimals?: number;
  /** USDG USD price in micro-USD (pinned stablecoin basis, default 1_000_000). */
  usdgUsdMicro?: bigint;
  /**
   * The factory's quote-asset registry at `blockNumber` (live path always
   * passes one — jobs.ts): the source of truth for which pair assets exist
   * (listed AND enabled at the pin) and for their DECIMALS.
   */
  registry: QuoteAssetRegistry;
}

/** v4 PoolId = keccak256(abi.encode(PoolKey)). */
export function computePoolId(k: EthUsdgPoolKey): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { name: "currency0", type: "address" },
        { name: "currency1", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "tickSpacing", type: "int24" },
        { name: "hooks", type: "address" },
      ],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
    ),
  );
}

/**
 * Backward-scan getLogs for the LAST log (highest block, then highest logIndex)
 * of `event` for our poolId in [fromBlock, toBlock], reading only LOGS (never
 * historical STATE). Windows are walked from the tip downward; the first
 * non-empty window necessarily holds the globally-last event, so the picked log
 * is independent of pageSize and identical for operator and verifier.
 */
async function lastEventLog(
  client: PublicClient,
  poolManager: Address,
  event: AbiEvent,
  poolId: Hex,
  fromBlock: bigint,
  toBlock: bigint,
  pageSize: bigint,
): Promise<any | undefined> {
  let end = toBlock;
  while (end >= fromBlock) {
    const start =
      end - pageSize + 1n > fromBlock ? end - pageSize + 1n : fromBlock;
    const raw = (await getLogsResilient(client, {
      address: poolManager,
      event: event,
      args: { id: poolId },
      fromBlock: start,
      toBlock: end,
    })) as any[];
    // Defensive re-filter: some RPCs ignore the indexed-topic (`id`) filter (or
    // the address filter) and return events for OTHER pools. Trusting those
    // would price ETH off the wrong pool's sqrtPriceX96 and silently corrupt the
    // datasetHash. Re-check both on the client so the result is identical no
    // matter how lax the RPC is.
    const wantPool = poolId.toLowerCase();
    const wantMgr = poolManager.toLowerCase();
    const logs = raw.filter(
      (l) =>
        String(l.args?.id ?? "").toLowerCase() === wantPool &&
        String(l.address ?? "").toLowerCase() === wantMgr,
    );
    if (logs.length > 0) {
      // Deterministic "last": max by (blockNumber, logIndex).
      let best = logs[0];
      for (const l of logs) {
        const lb = BigInt(l.blockNumber);
        const bb = BigInt(best.blockNumber);
        if (lb > bb || (lb === bb && Number(l.logIndex) > Number(best.logIndex))) {
          best = l;
        }
      }
      return best;
    }
    if (start === fromBlock) break;
    end = start - 1n;
  }
  return undefined;
}

type ResolvedPrice = { micro: bigint; decimals: number; source: string };

export class OnchainPriceProvider implements PriceProvider {
  readonly source: string;
  private readonly prices: Map<string, ResolvedPrice>;
  private readonly fallback: ConstantPriceProvider;
  private readonly registry: QuoteAssetRegistry;

  private constructor(
    source: string,
    prices: Map<string, ResolvedPrice>,
    registry: QuoteAssetRegistry,
  ) {
    this.source = source;
    this.prices = prices;
    this.registry = registry;
    this.fallback = new ConstantPriceProvider(registry);
  }

  /**
   * Resolve the ETH/USD basis from the LAST Uniswap v4 `Swap` event at a block
   * <= the pinned upper bound (fallback: the pool's `Initialize` event). Reads
   * only LOGS via getLogs — never historical STATE — so it reproduces on any
   * non-archive RPC. Throws if neither event exists (pool never initialized) so
   * a misconfigured PoolKey/PoolManager fails loudly instead of pricing ETH $0.
   */
  static async load(cfg: OnchainPriceConfig): Promise<OnchainPriceProvider> {
    // Decimals come from the on-chain registry (the factory verified them
    // against the token's decimals() at setQuoteAsset); the optional config
    // fields are only a fallback for older callers.
    const ethDecimals =
      cfg.registry[cfg.poolKey.currency0.toLowerCase()]?.decimals ??
      cfg.ethDecimals ?? 18;
    const usdgDecimals =
      cfg.registry[cfg.poolKey.currency1.toLowerCase()]?.decimals ??
      cfg.usdgDecimals ?? 6;
    const usdgUsdMicro = cfg.usdgUsdMicro ?? 1_000_000n;
    const pageSize = cfg.pageSize && cfg.pageSize > 0n ? cfg.pageSize : 5000n;

    const poolId = computePoolId(cfg.poolKey);

    // Prefer the latest Swap <= pin block; else fall back to Initialize.
    let kind = "swap";
    let log = await lastEventLog(
      cfg.client, cfg.poolManager, V4SwapEvent as AbiEvent, poolId,
      cfg.fromBlock, cfg.blockNumber, pageSize,
    );
    if (!log) {
      kind = "init";
      log = await lastEventLog(
        cfg.client, cfg.poolManager, V4InitializeEvent as AbiEvent, poolId,
        cfg.fromBlock, cfg.blockNumber, pageSize,
      );
    }
    if (!log) {
      throw new Error(
        `OnchainPriceProvider: no Swap or Initialize event for ETH/USDG pool ${poolId} ` +
          `in [${cfg.fromBlock}, ${cfg.blockNumber}] — pool not initialized? Check PoolKey ` +
          `(fee/tickSpacing/hooks/currencies) and PoolManager ${cfg.poolManager}.`,
      );
    }

    const sqrtPriceX96 = BigInt(log.args.sqrtPriceX96);
    if (sqrtPriceX96 === 0n) {
      throw new Error(
        `OnchainPriceProvider: ETH/USDG pool ${poolId} ${kind} event reports sqrtPriceX96=0.`,
      );
    }

    const decScale = 10n ** BigInt(ethDecimals - usdgDecimals);
    const ethUsdMicro = (sqrtPriceX96 * sqrtPriceX96 * decScale * usdgUsdMicro) / Q192;

    const evtBlock = BigInt(log.blockNumber).toString();
    const evtLog = Number(log.logIndex).toString();
    const source =
      `onchain-ethusdg-v4-${kind}@upto:${cfg.blockNumber.toString()}` +
      `|at:${evtBlock}.${evtLog}|pool:${poolId}|sqrtPriceX96:${sqrtPriceX96.toString()}`;

    const prices = new Map<string, ResolvedPrice>();
    prices.set(cfg.poolKey.currency0.toLowerCase(), {
      micro: ethUsdMicro,
      decimals: ethDecimals,
      source,
    });
    prices.set(cfg.poolKey.currency1.toLowerCase(), {
      micro: usdgUsdMicro,
      decimals: usdgDecimals,
      source: "pinned-usd-1",
    });
    return new OnchainPriceProvider(source, prices, cfg.registry);
  }

  priceOf(quoteAssetAddr: string): AssetPrice | undefined {
    const lc = quoteAssetAddr.toLowerCase();
    // Registry gate (ISSUE-LIST Q-11 items 2-3): an asset not listed+enabled
    // in the factory registry at the pinned block is NEVER priced — not even
    // via the constant basis, and never guessed as ETH.
    if (!registryKnown(this.registry, lc)) return undefined;
    const hit = this.prices.get(lc);
    if (hit) return { micro: hit.micro, decimals: hit.decimals };
    // Assets without an on-chain pool yet -> documented constant basis
    // (itself registry-gated; decimals from the registry).
    return this.fallback.priceOf(lc);
  }

  snapshot(): Record<string, { micro: string; decimals: number; source: string }> {
    // Merge chain-resolved (ETH, USDG) over the constant basis for all pair
    // assets, emitting deterministic sorted lowercased-address keys.
    const merged = new Map<string, { micro: string; decimals: number; source: string }>();
    for (const [addr, v] of Object.entries(this.fallback.snapshot())) {
      merged.set(addr.toLowerCase(), v);
    }
    for (const [addr, v] of this.prices) {
      merged.set(addr.toLowerCase(), {
        micro: v.micro.toString(),
        decimals: v.decimals,
        source: v.source,
      });
    }
    const out: Record<string, { micro: string; decimals: number; source: string }> = {};
    for (const addr of [...merged.keys()].sort()) {
      out[addr] = merged.get(addr)!;
    }
    return out;
  }

  registrySnapshot(): Record<string, { decimals: number; enabled: boolean }> {
    return snapshotRegistry(this.registry);
  }
}

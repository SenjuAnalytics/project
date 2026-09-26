/**
 * price/ConstantPriceProvider.ts
 * -----------------------------------------------------------------------------
 * A documented, reproducible USD price basis backed by the config constants.
 * USDG is pinned at $1; ETH/NVDA/AAPL/SPY use the configured constants
 * (env-overridable, e.g. INDEXER_PRICE_ETH_USD, default 2660). These are NOT a
 * live oracle — they are pinned into the dataset via snapshot() so the
 * datasetHash is reproducible on any machine.
 *
 * REGISTRY-GATED (ISSUE-LIST Q-11 item 2): when constructed with the factory's
 * quote-asset registry (the live path — jobs.ts always passes one), an asset
 * prices only if it is listed AND enabled in that registry at the pinned block,
 * and its DECIMALS come from the registry (the factory verified them against
 * the token's on-chain decimals() at setQuoteAsset). The config constants then
 * serve only as the USD price BASIS. A listed asset with NO configured USD
 * basis is UNPRICED — priceOf returns undefined, its volume contributes 0 QV,
 * and the dataset reports it in `unpricedQuoteAssets` (build.ts) — never
 * guessed.
 *
 * Without a registry (build.ts's offline DEFAULT_PRICES / older unit tests) the
 * legacy behaviour stands: PAIR_ASSETS alone decides existence, decimals and
 * price.
 */
import { PAIR_ASSETS, pairAssetByAddress } from "../config.ts";
import type { AssetPrice, PriceProvider } from "./PriceProvider.ts";
import {
  registryKnown,
  registrySnapshot as snapshotRegistry,
  type QuoteAssetRegistry,
} from "../quoteAssetRegistry.ts";

/** Round a USD float to micro-USD (1e6) deterministically (round half up). */
function toMicro(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

/** The documented constant USD basis (micro-USD), keyed by lowercased address. */
function usdBasisByAddress(): Record<string, bigint> {
  const out: Record<string, bigint> = {};
  for (const a of Object.values(PAIR_ASSETS)) {
    out[a.address.toLowerCase()] = toMicro(a.usd);
  }
  return out;
}

export class ConstantPriceProvider implements PriceProvider {
  readonly source = "constant-config-v1";
  private readonly basis = usdBasisByAddress();
  private readonly registry: QuoteAssetRegistry | undefined;

  /**
   * @param registry The factory's quote-asset registry at the pinned block
   * (live path). Omit only for the offline default/tests: then PAIR_ASSETS
   * alone decides existence, decimals and price (the pre-registry behaviour).
   */
  constructor(registry?: QuoteAssetRegistry) {
    this.registry = registry;
  }

  priceOf(quoteAssetAddr: string): AssetPrice | undefined {
    const lc = quoteAssetAddr.toLowerCase();
    const micro = this.basis[lc];
    if (micro === undefined) return undefined; // no configured USD basis
    if (this.registry !== undefined) {
      // Strict mode: existence + decimals come from the factory registry.
      if (!registryKnown(this.registry, lc)) return undefined;
      return { micro, decimals: this.registry[lc].decimals };
    }
    // Legacy mode: PAIR_ASSETS is the only source of truth.
    const asset = pairAssetByAddress(lc);
    return asset ? { micro, decimals: asset.decimals } : undefined;
  }

  snapshot(): Record<string, { micro: string; decimals: number; source: string }> {
    const out: Record<string, { micro: string; decimals: number; source: string }> = {};
    if (this.registry !== undefined) {
      // Strict mode: exactly the listed-and-enabled assets that have a basis.
      for (const addr of Object.keys(this.registry).sort()) {
        const info = this.registry[addr];
        const micro = this.basis[addr];
        if (!info.enabled || micro === undefined) continue;
        out[addr] = {
          micro: micro.toString(),
          decimals: info.decimals,
          source: this.source,
        };
      }
      return out;
    }
    // Legacy mode: every configured pair asset (sorted keys, deterministic).
    const entries = Object.values(PAIR_ASSETS)
      .map((a) => ({
        addr: a.address.toLowerCase(),
        micro: toMicro(a.usd).toString(),
        decimals: a.decimals,
      }))
      .sort((x, y) => (x.addr < y.addr ? -1 : x.addr > y.addr ? 1 : 0));
    for (const e of entries) {
      out[e.addr] = { micro: e.micro, decimals: e.decimals, source: this.source };
    }
    return out;
  }

  registrySnapshot(): Record<string, { decimals: number; enabled: boolean }> {
    return snapshotRegistry(this.registry);
  }
}

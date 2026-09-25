/**
 * price/ConstantPriceProvider.ts
 * -----------------------------------------------------------------------------
 * Phase 1 PriceProvider: a documented, reproducible CONSTANT price basis backed
 * by PAIR_ASSETS in config.ts. USDG is pinned at $1; ETH/NVDA/AAPL/SPY use the
 * configured constants (env-overridable, e.g. INDEXER_PRICE_ETH_USD, default
 * 2660). These are NOT a live oracle — they are pinned into the dataset via
 * snapshot() so the datasetHash is reproducible on any machine.
 */
import { PAIR_ASSETS, pairAssetByAddress } from "../config.ts";
import type { AssetPrice, PriceProvider } from "./PriceProvider.ts";

/** Round a USD float to micro-USD (1e6) deterministically (round half up). */
function toMicro(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

export class ConstantPriceProvider implements PriceProvider {
  readonly source = "constant-config-v1";

  priceOf(quoteAssetAddr: string): AssetPrice | undefined {
    const asset = pairAssetByAddress(quoteAssetAddr);
    if (!asset) return undefined;
    return { micro: toMicro(asset.usd), decimals: asset.decimals };
  }

  snapshot(): Record<string, { micro: string; decimals: number; source: string }> {
    const out: Record<string, { micro: string; decimals: number; source: string }> = {};
    // Deterministic: iterate assets and emit sorted lowercased-address keys.
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
}

/**
 * price/PriceProvider.ts
 * -----------------------------------------------------------------------------
 * Abstraction over the USD price basis used to convert a trade's quote-asset
 * notional into USD (micro-USD, BigInt). The KEY determinism invariant is that
 * whatever the source (a documented constant now, or an on-chain ETH/USDG pool
 * read at a pinned block later), the resolved numbers are FROZEN and pinned into
 * the dataset via snapshot() — so any verifier reproduces identical hashes.
 *
 * Phase 1 ships ConstantPriceProvider. Phase 2 (mainnet) will add an
 * OnchainPriceProvider that reads the ETH/USDG pool at a pinned block; both
 * implement this same interface, so the QV pipeline never changes.
 */

/** A resolved USD price for one asset, in micro-USD (USD * 1e6) as BigInt. */
export interface AssetPrice {
  /** USD price scaled by 1e6, as a BigInt (no floats downstream). */
  micro: bigint;
  /** The asset's own token decimals (for notional normalization). */
  decimals: number;
}

/**
 * Resolves USD prices for quote assets. All implementations MUST be
 * deterministic: given the same inputs they return the same numbers, and
 * snapshot() records exactly the basis used so the dataset hash pins it.
 */
export interface PriceProvider {
  /** Human-readable source tag embedded into the dataset (audit/verify). */
  readonly source: string;
  /**
   * Resolve the price for a (lowercased) quote-asset address.
   * Returns undefined when the asset is unknown -> the trade contributes 0 QV.
   */
  priceOf(quoteAssetAddr: string): AssetPrice | undefined;
  /**
   * Deterministic snapshot (sorted lowercased-address keys) of the price basis
   * used, embedded into the dataset config so hashes stay reproducible.
   */
  snapshot(): Record<string, { micro: string; decimals: number; source: string }>;
}

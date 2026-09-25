/**
 * types.ts — shared normalized types for the indexer.
 */

export type TradeSide = "buy" | "sell";

/**
 * A normalized trade. `notionalQuote` is expressed in the quote asset's own
 * smallest units (wei-like, i.e. scaled by 10**decimals of the quote asset).
 */
export interface NormalizedTrade {
  /** Battle/launch token address (lowercased). */
  token: string;
  /** Trader wallet (payer for buys / seller for sells) lowercased. */
  trader: string;
  /** Quote asset address (lowercased). */
  quoteAsset: string;
  /** Notional in quote-asset smallest units. */
  notionalQuote: bigint;
  side: TradeSide;
  blockNumber: bigint;
  txIndex: number;
  logIndex: number;
  txHash: string;
}

/** Per-token creator, from TokenLaunched. token -> creator (both lowercased). */
export type CreatorMap = Record<string, string>;

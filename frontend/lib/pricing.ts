/**
 * Centralized currency valuation and quote asset pricing across the entire Qualyra platform.
 * Supports Native ETH, USDG stablecoin, and RWA Stock pairs (NVDA, AAPL, SPY).
 */

import { formatPrice } from './formatters'

/** Dollars per ETH. Set NEXT_PUBLIC_ETH_USD_PRICE to override; defaults to realistic benchmark. */
export const ETH_USD_RATE: number = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_ETH_USD_PRICE)
  return Number.isFinite(raw) && raw > 0 ? raw : 3200
})()

/** Dollars per USDG. A 1:1 USD-pegged stablecoin issued by Paxos. */
export const USDG_USD_RATE = 1

/** Benchmark fallbacks for approved Robinhood RWA stock tokens. */
export const STOCK_FALLBACK_PRICES: Record<string, number> = {
  NVDA: 213.21,
  AAPL: 228.50,
  SPY: 575.00,
}

/**
 * Returns the current USD price of a given quote asset (ETH, USDG, NVDA, AAPL, SPY).
 */
export function getQuoteAssetPriceUsd(
  quoteSymbol: string | undefined,
  livePrices?: Record<string, { price: number }> | null,
): number {
  const sym = (quoteSymbol ?? 'ETH').toUpperCase()
  if (sym === 'ETH') return ETH_USD_RATE
  if (sym === 'USDG' || sym === 'USD' || sym === 'USDC') return USDG_USD_RATE

  const key = sym.toLowerCase()
  if (livePrices && livePrices[key]?.price && Number.isFinite(livePrices[key].price)) {
    return livePrices[key].price
  }

  return STOCK_FALLBACK_PRICES[sym] ?? 1
}

/**
 * Converts an amount of a quote asset into US dollars.
 */
export function quoteToUsd(
  amount: number,
  quoteSymbol: string | undefined,
  livePrices?: Record<string, { price: number }> | null,
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const rate = getQuoteAssetPriceUsd(quoteSymbol, livePrices)
  return amount * rate
}

/**
 * Converts a US dollar amount into the target quote asset quantity.
 */
export function usdToQuote(
  usdAmount: number,
  quoteSymbol: string | undefined,
  livePrices?: Record<string, { price: number }> | null,
): number {
  if (!Number.isFinite(usdAmount) || usdAmount <= 0) return 0
  const rate = getQuoteAssetPriceUsd(quoteSymbol, livePrices)
  return rate > 0 ? usdAmount / rate : 0
}

export interface DualPrice {
  usdPrice: number
  usdFormatted: string
  quotePrice: number
  quoteFormatted: string
  quoteSymbol: string
  isUsdNative: boolean
}

/**
 * Produces standardized GMGN-style dual price display (USD + Native Quote Asset).
 */
export function formatDualPrice(
  priceInQuote: number,
  quoteSymbol: string | undefined,
  livePrices?: Record<string, { price: number }> | null,
  isRwa?: boolean,
): DualPrice {
  const sym = (quoteSymbol ?? 'ETH').toUpperCase()
  const isUsdNative = sym === 'USDG' || sym === 'USD' || sym === 'USDC'
  const rate = getQuoteAssetPriceUsd(sym, livePrices)
  const usdPrice = isUsdNative ? priceInQuote : priceInQuote * rate

  return {
    usdPrice,
    usdFormatted: `$${formatPrice(usdPrice, isRwa)}`,
    quotePrice: priceInQuote,
    quoteFormatted: `${formatPrice(priceInQuote, isRwa)} ${sym}`,
    quoteSymbol: sym,
    isUsdNative,
  }
}


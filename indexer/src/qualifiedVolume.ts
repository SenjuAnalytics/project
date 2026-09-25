/**
 * qualifiedVolume.ts
 * -----------------------------------------------------------------------------
 * Computes per-wallet Qualified Volume (QV) normalized to USD and unique
 * qualifying buyer counts per token, after applying the published (open) v1
 * exclusion filters.
 *
 * USD normalization (integer/BigInt only, NO JS floats in the QV total):
 *   usdMicro = notionalQuote * priceUsdMicro(quoteAsset) / 10**decimals
 * where priceUsdMicro is the asset's USD price scaled by 1e6 (micro-USD). This
 * keeps QV as an exact integer in micro-USD units — fully deterministic.
 *
 * Published / open QV filter rules (v1), all parameters documented in config:
 *   1. Minimum USD per trade: drop trades whose USD notional < QV_PARAMS.minTradeUsd.
 *   2. Net out same-wallet round-trip buy/sell (per token) when enabled.
 *   3. Exclude a token's creator wallet (from TokenLaunched).
 *   4. Exclude connected-wallet denylist (connected-wallets.json).
 *   5. Exclude buyback-contract purchases (buybackBurner).
 *   6. Wash/circular/coordinated volume: v1 handled via the explicit denylist;
 *      Sybil/cluster detection is future work (documented in README).
 */
import {
  PAIR_ASSETS,
  QV_PARAMS,
  ADDRESSES,
  type PairAssetSymbol,
} from "./config.ts";
import type { NormalizedTrade, CreatorMap } from "./types.ts";
import type { PriceProvider } from "./price/PriceProvider.ts";

/** USD price scaled to micro-USD (1e6) as a BigInt, keyed by lowercased addr. */
function priceUsdMicroByAddress(): Record<string, { micro: bigint; decimals: number }> {
  const m: Record<string, { micro: bigint; decimals: number }> = {};
  for (const sym of Object.keys(PAIR_ASSETS) as PairAssetSymbol[]) {
    const a = PAIR_ASSETS[sym];
    // Round USD price to micro-USD deterministically (round half up).
    const micro = BigInt(Math.round(a.usd * 1_000_000));
    m[a.address.toLowerCase()] = { micro, decimals: a.decimals };
  }
  return m;
}

/** Convert a trade's quote notional to micro-USD (BigInt, floor division). */
export function tradeUsdMicro(
  trade: NormalizedTrade,
  prices: PriceProvider,
): bigint {
  const entry = prices.priceOf(trade.quoteAsset.toLowerCase());
  if (!entry) return 0n; // unknown quote asset -> not counted
  const denom = 10n ** BigInt(entry.decimals);
  return (trade.notionalQuote * entry.micro) / denom;
}

export interface QualifiedResult {
  /** token -> wallet -> QV in micro-USD (BigInt). */
  perTokenWalletQv: Record<string, Record<string, bigint>>;
  /** token -> count of unique qualifying buyers. */
  uniqueBuyers: Record<string, number>;
  /** wallet -> total QV in micro-USD across all tokens (for leaderboard). */
  walletTotalQv: Record<string, bigint>;
  /** Trades that survived all filters, in input order (for the dataset). */
  filteredTrades: NormalizedTrade[];
}

export interface ExclusionInputs {
  creators: CreatorMap; // token -> creator
  denylist: Set<string>; // lowercased connected wallets
}

const minTradeUsdMicro = (): bigint =>
  BigInt(Math.round(QV_PARAMS.minTradeUsd * 1_000_000));

/**
 * Apply exclusions + min-trade filter, optionally net round-trips, and compute
 * per-token wallet QV, unique buyers, and per-wallet totals — all deterministic.
 */
export function computeQualifiedVolume(
  trades: NormalizedTrade[],
  ex: ExclusionInputs,
  /** Price basis (constant now, on-chain pool later). Pins USD conversion. */
  prices: PriceProvider,
  /**
   * Buyback/burn contract to exclude. Defaults to the static config value so
   * offline callers/tests behave identically (and determinism is preserved).
   * Network callers pass the address resolved on-chain from the factory.
   */
  buybackBurner: string = ADDRESSES.buybackBurner,
): QualifiedResult {
  const buyback = buybackBurner.toLowerCase();
  const minMicro = minTradeUsdMicro();

  // 1) Row-level exclusion + min-trade filter.
  const kept: NormalizedTrade[] = [];
  for (const t of trades) {
    const trader = t.trader.toLowerCase();
    const token = t.token.toLowerCase();
    // Exclude buyback-contract purchases.
    if (trader === buyback) continue;
    // Exclude per-token creator.
    if (ex.creators[token] && ex.creators[token] === trader) continue;
    // Exclude connected-wallet denylist.
    if (ex.denylist.has(trader)) continue;
    // Minimum USD per trade.
    if (tradeUsdMicro(t, prices) < minMicro) continue;
    kept.push(t);
  }

  // 2) Optionally net out same-wallet round trips per token (USD micro level).
  //    We accumulate signed micro (buy +, sell -), floor at 0 for QV.
  const perTokenWalletQv: Record<string, Record<string, bigint>> = {};
  const buyersPerToken: Record<string, Set<string>> = {};

  // Track signed accumulation to support netting deterministically.
  const signed: Record<string, Record<string, bigint>> = {};

  for (const t of kept) {
    const token = t.token.toLowerCase();
    const wallet = t.trader.toLowerCase();
    const usd = tradeUsdMicro(t, prices);
    signed[token] ??= {};
    signed[token][wallet] ??= 0n;
    if (QV_PARAMS.netRoundTrips) {
      signed[token][wallet] += t.side === "buy" ? usd : -usd;
    } else {
      // Without netting, only buy-side notional contributes to QV.
      if (t.side === "buy") signed[token][wallet] += usd;
    }
    if (t.side === "buy") {
      buyersPerToken[token] ??= new Set();
      buyersPerToken[token].add(wallet);
    }
  }

  const walletTotalQv: Record<string, bigint> = {};
  for (const token of Object.keys(signed)) {
    perTokenWalletQv[token] = {};
    for (const wallet of Object.keys(signed[token])) {
      const qv = signed[token][wallet] > 0n ? signed[token][wallet] : 0n;
      perTokenWalletQv[token][wallet] = qv;
      walletTotalQv[wallet] = (walletTotalQv[wallet] ?? 0n) + qv;
    }
  }

  const uniqueBuyers: Record<string, number> = {};
  for (const token of Object.keys(buyersPerToken)) {
    // Only count buyers whose net QV on the token is > 0.
    let count = 0;
    for (const w of buyersPerToken[token]) {
      if ((perTokenWalletQv[token]?.[w] ?? 0n) > 0n) count++;
    }
    uniqueBuyers[token] = count;
  }

  return {
    perTokenWalletQv,
    uniqueBuyers,
    walletTotalQv,
    filteredTrades: kept,
  };
}

/** Sum of a token's per-wallet QV (micro-USD). */
export function tokenTotalQv(
  perTokenWalletQv: Record<string, Record<string, bigint>>,
  token: string,
): bigint {
  const w = perTokenWalletQv[token.toLowerCase()];
  if (!w) return 0n;
  let sum = 0n;
  for (const k of Object.keys(w)) sum += w[k];
  return sum;
}

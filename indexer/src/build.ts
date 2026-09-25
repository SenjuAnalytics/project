/**
 * build.ts
 * -----------------------------------------------------------------------------
 * Pure (network-free) assembly of dataset & result objects from normalized
 * trades. Shared by the CLI and the offline determinism test so both exercise
 * the exact same pipeline: QV -> score -> leaderboard -> canonical -> hash.
 */
import { configSnapshot, paramsSnapshot, OUTCOME } from "./config.ts";
import type { NormalizedTrade, CreatorMap } from "./types.ts";
import {
  computeQualifiedVolume,
  tokenTotalQv,
  type ExclusionInputs,
} from "./qualifiedVolume.ts";
import { computeScore } from "./score.ts";
import { buildLeaderboard, type Winners } from "./leaderboard.ts";
import { hash } from "./canonical.ts";
import type { PriceProvider } from "./price/PriceProvider.ts";
import { ConstantPriceProvider } from "./price/ConstantPriceProvider.ts";

/** Default price basis (Phase 1: documented constant). Swap for on-chain later. */
const DEFAULT_PRICES: PriceProvider = new ConstantPriceProvider();

const outcomeName = (outcome: number): string =>
  Object.entries(OUTCOME).find(([, value]) => value === outcome)?.[0] ?? String(outcome);

/** Serialize a normalized trade into a canonical-friendly plain object. */
function tradeToPlain(t: NormalizedTrade) {
  return {
    blockNumber: t.blockNumber,
    logIndex: t.logIndex,
    notionalQuote: t.notionalQuote,
    quoteAsset: t.quoteAsset,
    side: t.side,
    token: t.token,
    trader: t.trader,
    txHash: t.txHash,
    txIndex: t.txIndex,
  };
}

export function buildDataset(
  orderedFilteredTrades: NormalizedTrade[],
  prices: PriceProvider = DEFAULT_PRICES,
) {
  return {
    config: configSnapshot(),
    params: paramsSnapshot(),
    // Pin the exact USD price basis used so the datasetHash is reproducible.
    priceBasis: { source: prices.source, prices: prices.snapshot() },
    trades: orderedFilteredTrades.map(tradeToPlain),
  };
}

export interface BattleBuild {
  dataset: ReturnType<typeof buildDataset>;
  result: {
    battleId: string | number;
    outcome: number;
    scoreA: bigint;
    scoreB: bigint;
  };
  datasetHash: `0x${string}`;
  resultHash: `0x${string}`;
  scoreOutcomeName: string;
}

/** Build a battle result (and dataset) from all trades + exclusions. */
export function buildBattle(
  battleId: string | number,
  tokenA: string,
  tokenB: string,
  trades: NormalizedTrade[],
  ex: ExclusionInputs,
  /** Optional buyback address (resolved on-chain). Omit offline: uses config default. */
  buybackBurner?: string,
  prices: PriceProvider = DEFAULT_PRICES,
  /**
   * Outcome the vault's disqualification record forces (src/disqualification.ts). It replaces the score
   * outcome; the scores stay in the result. OUTCOME.None leaves the scores to decide.
   */
  disqualification: number = OUTCOME.None,
): BattleBuild {
  const a = tokenA.toLowerCase();
  const b = tokenB.toLowerCase();
  // Only trades on the two battle tokens are relevant to the dataset.
  const relevant = trades.filter(
    (t) => t.token === a || t.token === b,
  );
  const qv = computeQualifiedVolume(relevant, ex, prices, buybackBurner);

  const qvA = tokenTotalQv(qv.perTokenWalletQv, a);
  const qvB = tokenTotalQv(qv.perTokenWalletQv, b);
  const buyersA = BigInt(qv.uniqueBuyers[a] ?? 0);
  const buyersB = BigInt(qv.uniqueBuyers[b] ?? 0);

  const score = computeScore({ qvA, qvB, buyersA, buyersB });

  const dataset = buildDataset(qv.filteredTrades, prices);
  const result = {
    battleId,
    outcome: disqualification === OUTCOME.None ? score.outcome : disqualification,
    scoreA: score.scoreA,
    scoreB: score.scoreB,
  };

  return {
    dataset,
    result,
    datasetHash: hash(dataset),
    resultHash: hash(result),
    scoreOutcomeName: disqualification === OUTCOME.None ? score.outcomeName : outcomeName(disqualification),
  };
}

export interface WeekBuild {
  dataset: ReturnType<typeof buildDataset>;
  result: {
    week: bigint;
    winners: Winners;
    ranking: { wallet: string; qvUsdMicro: bigint; rank: number }[];
  };
  datasetHash: `0x${string}`;
  resultHash: `0x${string}`;
}

/** Build the global weekly leaderboard result (and dataset). */
export function buildWeek(
  week: bigint,
  trades: NormalizedTrade[],
  ex: ExclusionInputs,
  /** Optional buyback address (resolved on-chain). Omit offline: uses config default. */
  buybackBurner?: string,
  prices: PriceProvider = DEFAULT_PRICES): WeekBuild {
  const qv = computeQualifiedVolume(trades, ex, prices, buybackBurner);
  const lb = buildLeaderboard(week, qv.walletTotalQv);

  const dataset = buildDataset(qv.filteredTrades, prices);
  const result = {
    week: week,
    winners: lb.winners,
    ranking: lb.ranking.map((r) => ({
      wallet: r.wallet,
      qvUsdMicro: r.qvUsdMicro,
      rank: r.rank,
    })),
  };

  return {
    dataset,
    result: { ...result, week: week },
    datasetHash: hash(dataset),
    resultHash: hash(result),
  };
}

export type { ExclusionInputs, CreatorMap };

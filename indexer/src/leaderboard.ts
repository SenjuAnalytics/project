/**
 * leaderboard.ts
 * -----------------------------------------------------------------------------
 * ONE global weekly leaderboard across ALL tokens.
 *
 * Wallets are ranked by total USD Qualified Volume (micro-USD BigInt) DESCENDING.
 * Deterministic tie-break: wallet address ASCENDING (lexicographic on the
 * lowercased 0x string). Winners = top 5 addresses, zero-address padded to 5, the
 * shape proposeWeeklyWinners takes (address[5]).
 *
 * Week math (contract-aligned):
 *   WEEK=604800, WEEK_SHIFT=259200
 *   weekIndex = floor((unixTs + WEEK_SHIFT) / WEEK)
 *   weekStart = week*WEEK - WEEK_SHIFT
 *   weekEnd   = (week+1)*WEEK - WEEK_SHIFT
 */
import { WEEK, WEEK_SHIFT, ZERO_ADDRESS } from "./config.ts";

export function weekIndex(unixTs: bigint): bigint {
  return (unixTs + WEEK_SHIFT) / WEEK; // floor for non-negative
}
export function weekStart(week: bigint): bigint {
  return week * WEEK - WEEK_SHIFT;
}
export function weekEnd(week: bigint): bigint {
  return (week + 1n) * WEEK - WEEK_SHIFT;
}

export interface RankingEntry {
  wallet: string;
  qvUsdMicro: bigint;
  rank: number; // 1-based
}

/** Places paid by the Trader League. Mirrors QualyraCompetitionVault (address[5], 40/30/15/10/5). */
export const WINNER_COUNT = 5;

export type Winners = [string, string, string, string, string];

export interface LeaderboardResult {
  week: bigint;
  ranking: RankingEntry[];
  winners: Winners;
}

/**
 * Build the global weekly leaderboard from wallet -> total QV (micro-USD).
 */
export function buildLeaderboard(
  week: bigint,
  walletTotalQv: Record<string, bigint>,
): LeaderboardResult {
  const entries = Object.keys(walletTotalQv)
    .map((w) => ({ wallet: w.toLowerCase(), qvUsdMicro: walletTotalQv[w] }))
    .filter((e) => e.qvUsdMicro > 0n);

  entries.sort((a, b) => {
    if (a.qvUsdMicro !== b.qvUsdMicro)
      return a.qvUsdMicro > b.qvUsdMicro ? -1 : 1; // QV desc
    return a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0; // addr asc
  });

  const ranking: RankingEntry[] = entries.map((e, i) => ({
    wallet: e.wallet,
    qvUsdMicro: e.qvUsdMicro,
    rank: i + 1,
  }));

  const top = ranking.slice(0, WINNER_COUNT).map((r) => r.wallet);
  while (top.length < WINNER_COUNT) top.push(ZERO_ADDRESS);
  const winners: Winners = [top[0], top[1], top[2], top[3], top[4]];

  return { week, ranking, winners };
}

/**
 * operator/plan.ts
 * -----------------------------------------------------------------------------
 * What is due on chain right now, decided from a snapshot of vault state and
 * the chain's own clock. No I/O here, so every rule is unit tested offline.
 * The constants mirror QualyraCompetitionVault and QualyraBuybackBurner.
 */
import { OUTCOME } from "../config.ts";
import { weekEnd } from "../leaderboard.ts";

export const DAY = 86_400;
export const BATTLE_DURATION = DAY;
export const BATTLE_CHALLENGE_PERIOD = DAY;
export const LEAGUE_CHALLENGE_PERIOD = 2 * DAY;
export const TRANCHE_INTERVAL = 30 * 60;
export const MAX_SCHEDULE_LEAD = 7 * DAY;

export interface BattleState {
  id: number;
  tokenA: string;
  tokenB: string;
  asset: string;
  startTime: number;
  proposedAt: number;
  outcome: number;
  finalized: boolean;
  /** Commitments of the posted result, zero hashes while none is posted. */
  datasetHash?: string;
  resultHash?: string;
}

export interface BuybackState {
  battleId: number;
  token: string;
  remaining: bigint;
  /** When the token's last tranche ran, from any of its pots. */
  lastTrancheAt: number;
}

export interface WeekState {
  week: number;
  proposedAt: number;
  finalizedAt: number;
  closed: boolean;
  datasetHash?: string;
  resultHash?: string;
}

export interface TokenState {
  token: string;
  asset: string;
  eligible: boolean;
  disqualified: boolean;
  hasBattled: boolean;
  /** Untagged fees the hook holds for the token (trade fee plus creator tax). */
  parkedFees: bigint;
  pendingPot: bigint;
  pendingExpired: boolean;
}

/** Over, but no result posted yet. A cancelled booking is finalized and never shows up here. */
export function battlesAwaitingResult(battles: BattleState[], now: number, vetoed: ReadonlySet<number>): BattleState[] {
  return battles.filter(
    b =>
      !b.finalized &&
      b.outcome === OUTCOME.None &&
      now >= b.startTime + BATTLE_DURATION &&
      !vetoed.has(b.id),
  );
}

/** Result posted and its challenge window over. */
export function battlesToFinalize(battles: BattleState[], now: number): BattleState[] {
  return battles.filter(
    b => !b.finalized && b.outcome !== OUTCOME.None && now >= b.proposedAt + BATTLE_CHALLENGE_PERIOD,
  );
}

/** Results still inside their challenge window: what the watcher double-checks. */
export function battlesInChallenge(battles: BattleState[], now: number): BattleState[] {
  return battles.filter(
    b => !b.finalized && b.outcome !== OUTCOME.None && now < b.proposedAt + BATTLE_CHALLENGE_PERIOD,
  );
}

/**
 * Buyback tranches that can run now. The burner spaces tranches per token, so a token with more than one pot
 * gets one tranche per pass, oldest pot first.
 */
export function tranchesDue(buybacks: BuybackState[], now: number): BuybackState[] {
  const byToken = new Map<string, BuybackState>();
  for (const b of buybacks) {
    if (b.remaining === 0n || now < b.lastTrancheAt + TRANCHE_INTERVAL) continue;
    const key = b.token.toLowerCase();
    const current = byToken.get(key);
    if (!current || b.battleId < current.battleId) byToken.set(key, b);
  }
  return [...byToken.values()].sort((a, b) => a.battleId - b.battleId);
}

/** Finished league weeks with no winners posted yet, oldest first. */
export function weeksAwaitingWinners(
  firstLeagueWeek: number,
  weeks: WeekState[],
  now: number,
  vetoed: ReadonlySet<number>,
): WeekState[] {
  if (firstLeagueWeek === 0) return [];
  return weeks
    .filter(
      w =>
        w.week >= firstLeagueWeek &&
        w.proposedAt === 0 &&
        w.finalizedAt === 0 &&
        !w.closed &&
        now >= Number(weekEnd(BigInt(w.week))) &&
        !vetoed.has(w.week),
    )
    .sort((a, b) => a.week - b.week);
}

export function weeksToFinalize(weeks: WeekState[], now: number): WeekState[] {
  return weeks.filter(
    w => w.proposedAt > 0 && w.finalizedAt === 0 && !w.closed && now >= w.proposedAt + LEAGUE_CHALLENGE_PERIOD,
  );
}

export function weeksInChallenge(weeks: WeekState[], now: number): WeekState[] {
  return weeks.filter(w => w.proposedAt > 0 && w.finalizedAt === 0 && !w.closed && now < w.proposedAt + LEAGUE_CHALLENGE_PERIOD);
}

/** Next 00:00 UTC a battle can start at, leaving at least `minLead` seconds to book it. */
export function nextBattleStart(now: number, minLead: number): number {
  const midnight = (Math.floor(now / DAY) + 1) * DAY;
  return midnight - now >= minLead ? midnight : midnight + DAY;
}

export function bookingOpen(now: number, bookingHourUtc: number): boolean {
  return now % DAY >= bookingHourUtc * 3600;
}

/** Tokens the vault would accept in a booking right now. */
export function bookableTokens(tokens: TokenState[]): TokenState[] {
  return tokens.filter(t => t.eligible && !t.disqualified && !t.hasBattled);
}

/**
 * Pairs tokens of the same pair asset by market cap: sorted largest first, neighbours meet. Market caps are
 * compared in the pair asset, so tokens on different assets never meet. An odd token out waits for the next
 * booking. Ties sort by address so the pairing is deterministic.
 */
export function pairByMarketCap(candidates: { token: string; asset: string; marketCap: bigint }[]): [string, string][] {
  const byAsset = new Map<string, { token: string; marketCap: bigint }[]>();
  for (const c of candidates) {
    const key = c.asset.toLowerCase();
    const list = byAsset.get(key) ?? [];
    list.push({ token: c.token.toLowerCase(), marketCap: c.marketCap });
    byAsset.set(key, list);
  }

  const pairs: [string, string][] = [];
  for (const asset of [...byAsset.keys()].sort()) {
    const list = byAsset.get(asset)!;
    list.sort((a, b) =>
      a.marketCap === b.marketCap ? (a.token < b.token ? -1 : 1) : a.marketCap > b.marketCap ? -1 : 1,
    );
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i].token, list[i + 1].token]);
  }
  return pairs;
}

/** The daily sweep runs once per UTC day, at or after its minute. */
export function sweepDue(now: number, lastSweepDay: number | undefined, sweepMinuteUtc: number): boolean {
  const day = Math.floor(now / DAY);
  return day !== lastSweepDay && Math.floor((now % DAY) / 60) >= sweepMinuteUtc;
}

export function tokensToSweep(tokens: TokenState[]): TokenState[] {
  return tokens.filter(t => t.parkedFees > 0n);
}

export function expiredPendingToRelease(tokens: TokenState[]): TokenState[] {
  return tokens.filter(t => t.pendingExpired && t.pendingPot > 0n);
}

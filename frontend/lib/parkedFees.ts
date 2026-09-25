// How QualyraFeeVault splits one sweep of the fees the pool hook holds. The UI uses it to count those fees
// before anyone sweeps them. Mirrors `collectFees` and `_routeCompetition`: change both together.
//
// A swap in a graduated pool only records its fees in the hook, per token and bucket, so trading pays no extra
// gas. Bucket zero holds a token's untagged fees. A battle id is the bucket for fees tagged to that battle, from
// its booking until its live window ends. Sweeping is permissionless: the keeper sweeps every token daily, a
// creator withdrawal sweeps its own token first, and finalizing a battle sweeps that battle's buckets.

const BPS = 10_000n

/** Share of a token's competition cut that funds the Trader League while the token is not in a battle. */
const LEAGUE_SHARE_OF_COMPETITION_BPS = 3_000n

/** QualyraFees.PENDING_EXPIRY in seconds. */
export const PENDING_EXPIRY = 30 * 24 * 60 * 60

/** Where the vault sends the competition cut of a token's untagged fees, decided when they are swept. */
export type UntaggedRoute =
  /** Waiting for its battle: 70% goes to the token's pending pot, 30% to the league. */
  | 'pending'
  /** Battle already booked or spent, or no eligibility timer within PENDING_EXPIRY: 70% treasury, 30% league. */
  | 'treasury-and-league'
  /** Disqualified before it ever battled: all of it goes to the treasury. */
  | 'treasury'

export interface RoutingState {
  /** Eligibility timer start, zero if the token never closed a trade at or above the threshold. */
  firstCloseAt: number
  disqualified: boolean
  hasBattled: boolean
  /** Launch time in seconds. */
  launchedAt: number
}

export function untaggedRoute(token: RoutingState, now: number): UntaggedRoute {
  if (token.disqualified && !token.hasBattled) return 'treasury'
  if (token.hasBattled) return 'treasury-and-league'
  if (token.firstCloseAt === 0 && now >= token.launchedAt + PENDING_EXPIRY) return 'treasury-and-league'
  return 'pending'
}

/** Fee split locked in at launch, in basis points of the trade fee. */
export interface LaunchSplit {
  creatorShareBps: number
  competitionShareBps: number
}

/** Fees recorded in one hook bucket. The trade fee includes any snipe tax. */
export interface Accrual {
  tradeFee: bigint
  creatorTax: bigint
}

/** What each party gets when one bucket is swept. The platform share is left out: no screen shows it. */
export interface FeeSplit {
  /** Creator share of the trade fee plus the whole creator tax. */
  creator: bigint
  /** Joins the token's pending battle pot. */
  pending: bigint
  /** Joins the pot of the battle the fees were tagged to. */
  pot: bigint
  /** Funds the league week in progress, or the bootstrap pool before the league starts. */
  league: bigint
}

/**
 * Split of one bucket. `tagged` is true for a battle's bucket: its whole competition cut joins that battle's pot,
 * which stays open until the battle is finalized, and finalizing sweeps the bucket first.
 */
export function splitParkedFees(accrual: Accrual, split: LaunchSplit, tagged: boolean, route: UntaggedRoute): FeeSplit {
  const creator = (accrual.tradeFee * BigInt(split.creatorShareBps)) / BPS + accrual.creatorTax
  const competition = (accrual.tradeFee * BigInt(split.competitionShareBps)) / BPS

  if (tagged) return { creator, pending: 0n, pot: competition, league: 0n }
  if (route === 'treasury') return { creator, pending: 0n, pot: 0n, league: 0n }

  const league = (competition * LEAGUE_SHARE_OF_COMPETITION_BPS) / BPS
  return { creator, pending: route === 'pending' ? competition - league : 0n, pot: 0n, league }
}

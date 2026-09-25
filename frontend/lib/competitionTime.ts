// Week boundaries as QualyraCompetitionVault computes them. Keep WEEK and WEEK_SHIFT in sync with the contract.
//
// The Unix epoch fell on a Thursday, so shifting by three days lines every week up on Monday 00:00 UTC.
export const WEEK = 7 * 86_400
export const WEEK_SHIFT = 3 * 86_400

export const nowSeconds = () => Math.floor(Date.now() / 1000)

/** Week number containing `timestamp`. Matches the contract's `currentWeek()`. */
export const weekOf = (timestamp: number) => Math.floor((timestamp + WEEK_SHIFT) / WEEK)

/** Start of the following week. Matches the contract's `weekEndsAt(week)`. */
export const weekEndsAt = (week: number) => (week + 1) * WEEK - WEEK_SHIFT

/** When the week in progress closes. */
export const currentWeekEnd = (now: number = nowSeconds()) => weekEndsAt(weekOf(now))

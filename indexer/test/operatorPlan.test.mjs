/**
 * operatorPlan.test.mjs — OFFLINE tests for what the operator service decides
 * is due (src/operator/plan.ts). Pure functions over plain snapshots.
 */
import "./_fixtureEnv.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  DAY,
  battlesAwaitingResult,
  battlesInChallenge,
  battlesToExpire,
  battlesToFinalize,
  bookableTokens,
  bookingOpen,
  expiredPendingToRelease,
  nextBattleStart,
  pairByMarketCap,
  sweepDue,
  tokensToPoke,
  tokensToSweep,
  tranchesDue,
  weeksAwaitingWinners,
  weeksToFinalize,
  weeksToSkip,
} from "../src/operator/plan.ts";
import { weekEnd } from "../src/leaderboard.ts";
import { OUTCOME } from "../src/config.ts";

const MIDNIGHT = 20_000 * DAY; // some 00:00 UTC
const battle = (over = {}) => ({
  id: 1,
  tokenA: "0xa",
  tokenB: "0xb",
  asset: "0x0",
  startTime: MIDNIGHT,
  proposedAt: 0,
  outcome: OUTCOME.None,
  finalized: false,
  ...over,
});

test("a battle needs a result once its 24 hours are over, unless it was vetoed or cancelled", () => {
  const b = battle();
  assert.deepEqual(battlesAwaitingResult([b], MIDNIGHT + DAY - 1, new Set()), []);
  assert.deepEqual(battlesAwaitingResult([b], MIDNIGHT + DAY, new Set()), [b]);
  assert.deepEqual(battlesAwaitingResult([b], MIDNIGHT + DAY, new Set([1])), []);
  // A cancelled booking is finalized as void without a result.
  const cancelled = battle({ finalized: true, outcome: OUTCOME.Void });
  assert.deepEqual(battlesAwaitingResult([cancelled], MIDNIGHT + DAY, new Set()), []);
});

test("a posted result is finalized after its 24-hour challenge window, checked before that", () => {
  const posted = battle({ outcome: OUTCOME.WinnerA, proposedAt: MIDNIGHT + DAY + 60 });
  assert.deepEqual(battlesToFinalize([posted], posted.proposedAt + DAY - 1), []);
  assert.deepEqual(battlesInChallenge([posted], posted.proposedAt + DAY - 1), [posted]);
  assert.deepEqual(battlesToFinalize([posted], posted.proposedAt + DAY), [posted]);
  assert.deepEqual(battlesInChallenge([posted], posted.proposedAt + DAY), []);
  assert.deepEqual(battlesToFinalize([{ ...posted, finalized: true }], posted.proposedAt + DAY), []);
});

test("buyback tranches wait 30 minutes per token and take the oldest pot first", () => {
  const now = 1_000_000;
  const due = tranchesDue(
    [
      { battleId: 5, token: "0xA", remaining: 10n, lastTrancheAt: now - 1800 },
      { battleId: 3, token: "0xa", remaining: 10n, lastTrancheAt: now - 1800 },
      { battleId: 4, token: "0xb", remaining: 10n, lastTrancheAt: now - 1799 },
      { battleId: 6, token: "0xc", remaining: 0n, lastTrancheAt: 0 },
      { battleId: 7, token: "0xd", remaining: 1n, lastTrancheAt: 0 },
    ],
    now,
  );
  assert.deepEqual(
    due.map(t => t.battleId),
    [3, 7],
  );
});

test("weekly winners are due once the week ended, for league weeks only, oldest first", () => {
  const weeks = [
    { week: 12, proposedAt: 0, finalizedAt: 0, closed: false },
    { week: 11, proposedAt: 0, finalizedAt: 0, closed: false },
    { week: 10, proposedAt: 0, finalizedAt: 0, closed: false },
    { week: 13, proposedAt: 0, finalizedAt: 0, closed: false },
  ];
  const now = Number(weekEnd(12n)); // week 12 just ended, week 13 is running
  assert.deepEqual(weeksAwaitingWinners(0, weeks, now, new Set()), []);
  assert.deepEqual(
    weeksAwaitingWinners(11, weeks, now, new Set()).map(w => w.week),
    [11, 12],
  );
  assert.deepEqual(
    weeksAwaitingWinners(11, weeks, now, new Set([11])).map(w => w.week),
    [12],
  );
  const posted = { week: 12, proposedAt: now, finalizedAt: 0, closed: false };
  assert.deepEqual(weeksToFinalize([posted], now + 2 * DAY - 1), []);
  assert.deepEqual(weeksToFinalize([posted], now + 2 * DAY), [posted]);
});

test("battles start at the next 00:00 UTC, or the one after when it is too close", () => {
  assert.equal(nextBattleStart(MIDNIGHT + 10 * 3600, 3600), MIDNIGHT + DAY);
  assert.equal(nextBattleStart(MIDNIGHT + DAY - 1800, 3600), MIDNIGHT + 2 * DAY);
  assert.equal(nextBattleStart(MIDNIGHT, 3600) % DAY, 0);
  assert.equal(nextBattleStart(MIDNIGHT, 3600), MIDNIGHT + DAY);
});

test("booking opens at the configured UTC hour", () => {
  assert.equal(bookingOpen(MIDNIGHT + 18 * 3600 - 1, 18), false);
  assert.equal(bookingOpen(MIDNIGHT + 18 * 3600, 18), true);
  assert.equal(bookingOpen(MIDNIGHT + DAY - 1, 18), true);
});

const token = (over = {}) => ({
  token: "0xt",
  asset: "0x0",
  eligible: true,
  disqualified: false,
  hasBattled: false,
  firstCloseAt: 0,
  belowThresholdSince: 0,
  averageReady: true,
  lastSwapAt: 0,
  parkedFees: 0n,
  pendingPot: 0n,
  pendingExpired: false,
  ...over,
});

test("only eligible tokens that never battled and hold the threshold can be booked", () => {
  const list = [
    token({ token: "0x1" }),
    token({ token: "0x2", eligible: false }),
    token({ token: "0x3", disqualified: true }),
    token({ token: "0x4", hasBattled: true }),
    token({ token: "0x5", belowThresholdSince: MIDNIGHT }),
  ];
  assert.deepEqual(
    bookableTokens(list).map(t => t.token),
    ["0x1"],
  );
});

test("the keeper checks quiet tokens where timing matters: in a drop, in a battle, bookable while booking is open", () => {
  const now = MIDNIGHT + 20 * 3600;
  const list = [
    token({ token: "0x1", belowThresholdSince: now - 600 }),
    token({ token: "0x2", hasBattled: true }),
    token({ token: "0x3" }),
    token({ token: "0x4", hasBattled: true, belowThresholdSince: now - 900 }),
    token({ token: "0x5", disqualified: true }),
    token({ token: "0x6", averageReady: false }),
    token({ token: "0x7", belowThresholdSince: now - 600, lastSwapAt: now - 60 }),
  ];
  // 0x2 is booked for the coming midnight; 0x4 battled and its battle is over, so nothing it does counts any more.
  const battles = [battle({ tokenA: "0x2", tokenB: "0x9", startTime: MIDNIGHT + DAY })];
  const pick = opts => tokensToPoke(list, battles, now, { quietSeconds: 600, lastPokeAt: {}, ...opts }).map(t => t.token);

  assert.deepEqual(pick({ bookingOpen: false }), ["0x1", "0x2"]);
  assert.deepEqual(pick({ bookingOpen: true }), ["0x1", "0x2", "0x3"]);
  // Poked five minutes ago: not again until it has been quiet for another 600 seconds.
  assert.deepEqual(pick({ bookingOpen: true, lastPokeAt: { "0x1": now - 300 } }), ["0x2", "0x3"]);
});

test("pairing: neighbours by market cap, per pair asset, odd one out waits", () => {
  const pairs = pairByMarketCap([
    { token: "0x01", asset: "0xeth", marketCap: 500n },
    { token: "0x02", asset: "0xeth", marketCap: 100n },
    { token: "0x03", asset: "0xeth", marketCap: 480n },
    { token: "0x04", asset: "0xeth", marketCap: 90n },
    { token: "0x05", asset: "0xeth", marketCap: 10n },
    { token: "0x06", asset: "0xusdg", marketCap: 7n },
  ]);
  assert.deepEqual(pairs, [
    ["0x01", "0x03"],
    ["0x02", "0x04"],
  ]);
});

test("pairing breaks market cap ties by address, so every run pairs the same way", () => {
  const a = pairByMarketCap([
    { token: "0x0b", asset: "0x0", marketCap: 5n },
    { token: "0x0a", asset: "0x0", marketCap: 5n },
    { token: "0x0c", asset: "0x0", marketCap: 5n },
    { token: "0x0d", asset: "0x0", marketCap: 5n },
  ]);
  assert.deepEqual(a, [
    ["0x0a", "0x0b"],
    ["0x0c", "0x0d"],
  ]);
});

test("the daily sweep runs once per UTC day, from its minute on", () => {
  const minute = 23 * 60 + 40;
  const day = MIDNIGHT / DAY;
  assert.equal(sweepDue(MIDNIGHT + minute * 60 - 1, undefined, minute), false);
  assert.equal(sweepDue(MIDNIGHT + minute * 60, undefined, minute), true);
  assert.equal(sweepDue(MIDNIGHT + minute * 60, day, minute), false);
  assert.equal(sweepDue(MIDNIGHT + DAY + minute * 60, day, minute), true);
});

test("sweeps cover tokens with parked fees; releases cover expired pending pots only", () => {
  const list = [
    token({ token: "0x1", parkedFees: 5n }),
    token({ token: "0x2", pendingExpired: true, pendingPot: 3n }),
    token({ token: "0x3", pendingExpired: true, pendingPot: 0n }),
    token({ token: "0x4", pendingExpired: false, pendingPot: 9n }),
  ];
  assert.deepEqual(
    tokensToSweep(list).map(t => t.token),
    ["0x1"],
  );
  assert.deepEqual(
    expiredPendingToRelease(list).map(t => t.token),
    ["0x2"],
  );
});

test("a battle with no result can be expired after the grace period, a reported one cannot", () => {
  const now = MIDNIGHT + 10 * DAY;
  const list = [
    battle({ id: 1, startTime: now - DAY - 3 * DAY + 1 }), // grace still running
    battle({ id: 2, startTime: now - DAY - 3 * DAY }), // opens exactly now
    battle({ id: 3, startTime: now - 6 * DAY }), // long past the grace
    battle({ id: 4, startTime: now - 6 * DAY, outcome: OUTCOME.WinnerA }), // reported: finalize path
    battle({ id: 5, startTime: now - 6 * DAY, finalized: true, outcome: OUTCOME.Void }), // already closed
  ];
  assert.deepEqual(
    battlesToExpire(list, now).map(b => b.id),
    [2, 3],
  );
});

test("a league week with no winners is skippable after the grace period, a proposed one is not", () => {
  const open11 = Number(weekEnd(11n)) + 14 * DAY;
  const openAt = Number(weekEnd(12n)) + 14 * DAY;
  const weeks = [
    { week: 11, proposedAt: 0, finalizedAt: 0, closed: false },
    { week: 12, proposedAt: 0, finalizedAt: 0, closed: false },
    { week: 13, proposedAt: openAt - DAY, finalizedAt: 0, closed: false }, // pending proposal
    { week: 14, proposedAt: 0, finalizedAt: openAt, closed: false }, // already settled
  ];
  assert.deepEqual(weeksToSkip(0, weeks, openAt), []);
  // Each week opens its own skip deadline, grace after that week's own end.
  assert.deepEqual(
    weeksToSkip(11, weeks, open11 - 1).map(w => w.week),
    [],
  );
  assert.deepEqual(
    weeksToSkip(11, weeks, open11).map(w => w.week),
    [11],
  );
  assert.deepEqual(
    weeksToSkip(11, weeks, openAt).map(w => w.week),
    [11, 12],
  );
});

test("a token whose timer started but never resolved is poked, so the story ends either way", () => {
  const now = MIDNIGHT + 20 * 3600;
  const quiet = { lastSwapAt: now - 3600 };
  const limbo = token({ token: "0x9", eligible: false, firstCloseAt: now - 2 * DAY, ...quiet });
  const list = [
    limbo,
    // Eligible and not in booking hours: the normal rules already cover it, so limbo adds nothing.
    token({ token: "0x8", firstCloseAt: now - 5 * DAY, ...quiet }),
    // Already resolved: no longer limbo.
    token({ token: "0x7", firstCloseAt: now - 5 * DAY, ...quiet }),
    token({ token: "0x6", eligible: false, firstCloseAt: now - 2 * DAY, hasBattled: true, ...quiet }),
  ];
  const pick = opts => tokensToPoke(list, [], now, { quietSeconds: 600, lastPokeAt: {}, ...opts }).map(t => t.token);
  assert.deepEqual(pick({ bookingOpen: false }), ["0x9"]);
  // Booking open: the eligible token is picked by the normal rule too, the limbo one only once.
  assert.deepEqual(pick({ bookingOpen: true }), ["0x9", "0x8", "0x7"]);
});

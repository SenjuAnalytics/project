/**
 * score.ts
 * -----------------------------------------------------------------------------
 * Battle scoring using exact BigInt fixed-point math (SCORE_SCALE = 1e18).
 *
 *   scoreX = round( 1e18 * (0.7 * qvShareX + 0.3 * uniqueBuyerShareX) )
 *
 * Shares are computed at the 1e18 fixed-point scale using integer division.
 *
 * Rounding: we compute the weighted numerator entirely in integer arithmetic
 * scaled by SCORE_SCALE, then apply round-half-up on the final division so that
 * scoreX is a whole SCORE_SCALE-scaled integer in [0, 1e18].
 *
 *   qvShareX_scaled       = qvX      * 1e18 / qvTotal        (0 if qvTotal==0)
 *   buyerShareX_scaled    = buyersX  * 1e18 / buyersTotal    (0 if total==0)
 *   weightedNum           = 7 * qvShareX_scaled + 3 * buyerShareX_scaled
 *   scoreX                = roundHalfUp(weightedNum, 10)     // /10 with rounding
 *
 * Outcome mapping (DRAW_MARGIN = 1e16 = 1%):
 *   WinnerA iff scoreA >= scoreB + 1e16
 *   WinnerB iff scoreB >= scoreA + 1e16
 *   else Draw
 */
import { SCORE_SCALE, DRAW_MARGIN, OUTCOME } from "./config.ts";

/** share = value * SCALE / total, integer division; 0 when total == 0. */
function share(value: bigint, total: bigint): bigint {
  if (total <= 0n) return 0n;
  return (value * SCORE_SCALE) / total;
}

/** Round-half-up division of `num` by `den` (both non-negative). */
function roundDiv(num: bigint, den: bigint): bigint {
  return (num + den / 2n) / den;
}

export interface ScoreInputs {
  qvA: bigint;
  qvB: bigint;
  buyersA: bigint;
  buyersB: bigint;
}

export interface ScoreResult {
  scoreA: bigint;
  scoreB: bigint;
  outcome: number; // OUTCOME.*
  outcomeName: string;
}

export function computeScore(inp: ScoreInputs): ScoreResult {
  const qvTotal = inp.qvA + inp.qvB;
  const buyersTotal = inp.buyersA + inp.buyersB;

  const qvShareA = share(inp.qvA, qvTotal);
  const qvShareB = share(inp.qvB, qvTotal);
  const buyerShareA = share(inp.buyersA, buyersTotal);
  const buyerShareB = share(inp.buyersB, buyersTotal);

  // weighted numerator = 7*qvShare + 3*buyerShare, then /10 (round half up).
  const scoreA = roundDiv(7n * qvShareA + 3n * buyerShareA, 10n);
  const scoreB = roundDiv(7n * qvShareB + 3n * buyerShareB, 10n);

  let outcome: number = OUTCOME.Draw;
  let outcomeName = "Draw";
  if (scoreA >= scoreB + DRAW_MARGIN) {
    outcome = OUTCOME.WinnerA;
    outcomeName = "WinnerA";
  } else if (scoreB >= scoreA + DRAW_MARGIN) {
    outcome = OUTCOME.WinnerB;
    outcomeName = "WinnerB";
  }

  return { scoreA, scoreB, outcome, outcomeName };
}

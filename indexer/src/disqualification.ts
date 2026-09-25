/**
 * disqualification.ts
 * -----------------------------------------------------------------------------
 * The competition vault records the moment a token closes below the market-cap
 * threshold during its live battle, and `proposeBattleResult` only accepts the
 * outcome that record implies (spec §6): the token that dropped loses, the first
 * of two to drop loses, and two drops in the same second void the battle. Scores
 * can't overturn it, so the indexer puts that outcome in the committed result.
 *
 * The record can only change while the battle is live (an eligible token is never
 * disqualified outside it), so once the window has closed a read at the latest
 * block returns the same answer forever. That keeps verification working on RPCs
 * without archive state.
 */
import type { PublicClient } from "viem";
import { OUTCOME } from "./config.ts";
import { QualyraCompetitionVaultAbi } from "./abi/index.ts";

export interface DisqualificationRecord {
  disqualified: boolean;
  /** Unix seconds, zero when not disqualified. */
  disqualifiedAt: bigint;
}

/** Mirrors QualyraCompetitionVault._disqualificationOutcome. OUTCOME.None when neither token dropped. */
export function disqualificationOutcome(
  a: DisqualificationRecord,
  b: DisqualificationRecord,
): number {
  if (!a.disqualified && !b.disqualified) return OUTCOME.None;
  if (a.disqualified && b.disqualified) {
    if (a.disqualifiedAt === b.disqualifiedAt) return OUTCOME.Void;
    return a.disqualifiedAt < b.disqualifiedAt ? OUTCOME.DisqualifiedA : OUTCOME.DisqualifiedB;
  }
  return a.disqualified ? OUTCOME.DisqualifiedA : OUTCOME.DisqualifiedB;
}

async function readRecord(
  client: PublicClient,
  competitionVault: string,
  token: string,
): Promise<DisqualificationRecord> {
  const [, , disqualified, disqualifiedAt] = (await client.readContract({
    address: competitionVault as `0x${string}`,
    abi: QualyraCompetitionVaultAbi as any,
    functionName: "eligibilityOf",
    args: [token],
  })) as readonly [number, boolean, boolean, number];
  return { disqualified, disqualifiedAt: BigInt(disqualifiedAt) };
}

/** The outcome the vault's disqualification record forces on a battle, or OUTCOME.None. */
export async function readDisqualificationOutcome(
  client: PublicClient,
  competitionVault: string,
  tokenA: string,
  tokenB: string,
): Promise<number> {
  const [a, b] = await Promise.all([
    readRecord(client, competitionVault, tokenA),
    readRecord(client, competitionVault, tokenB),
  ]);
  return disqualificationOutcome(a, b);
}

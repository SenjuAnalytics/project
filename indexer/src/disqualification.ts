/**
 * disqualification.ts
 * -----------------------------------------------------------------------------
 * The competition vault disqualifies a token whose market cap stays below the
 * threshold for DQ_DWELL (30 minutes), from the start of its eligibility timer
 * until its battle is over, and dates the drop from when it went below. A drop
 * that has run for 30 minutes by the end of the battle counts even when no trade
 * came along to confirm it. `proposeBattleResult` only accepts the outcome that
 * record implies (spec §6): the token that dropped loses, the first of two to
 * drop loses, and two drops dated to the same second void the battle. Scores
 * can't overturn it, so the indexer puts that outcome in the committed result.
 *
 * The vault works the outcome out itself (`forcedOutcomeOf`) and stops changing
 * the record when the battle's 24 hours are over, so after the window has closed
 * a read at the latest block returns the same answer forever. That keeps
 * verification working on RPCs without archive state.
 */
import type { PublicClient } from "viem";
import { QualyraCompetitionVaultAbi } from "./abi/index.ts";

/** The outcome the vault's disqualification record forces on a battle, or OUTCOME.None. */
export async function readForcedOutcome(
  client: PublicClient,
  competitionVault: string,
  battleId: string | number | bigint,
): Promise<number> {
  const outcome = await client.readContract({
    address: competitionVault as `0x${string}`,
    abi: QualyraCompetitionVaultAbi as any,
    functionName: "forcedOutcomeOf",
    args: [BigInt(battleId)],
  });
  return Number(outcome);
}

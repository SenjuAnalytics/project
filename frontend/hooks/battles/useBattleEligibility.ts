'use client'

// Battle eligibility of launched tokens, straight from QualyraCompetitionVault. The vault tracks it on
// settled trades: the 24-hour timer starts at the first close with a market cap of $100k or more, the token
// qualifies once the window passes, and a drop below $100k before that disqualifies it for good. Each token
// gets one battle.

import { useMemo } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { qualyraCompetitionVaultAbi, qualyraDeployment, isDeployed, resolveTargetChainId } from '@/lib/contracts'

/** Mirrors QualyraCompetitionVault.ELIGIBILITY_WINDOW. */
export const ELIGIBILITY_WINDOW = 24 * 60 * 60

export type BattleEligibility =
  | { state: 'unknown' }
  | { state: 'waiting' }
  | { state: 'qualifying'; since: number; eligibleAt: number }
  | { state: 'eligible' }
  | { state: 'disqualified'; at: number }
  | { state: 'battled' }

/** Token address (lowercase) to its status. `supported` is false when the deployed vault predates these views. */
export function useBattleEligibility(tokens: Address[]): {
  byToken: Map<string, BattleEligibility>
  supported: boolean | null
} {
  const chainId = resolveTargetChainId(useChainId())
  const vault = qualyraDeployment(chainId)?.competitionVault
  const enabled = isDeployed(vault) && tokens.length > 0

  const { data } = useReadContracts({
    contracts: tokens.flatMap(token => [
      { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'eligibilityOf' as const, args: [token] as const },
      { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'hasBattled' as const, args: [token] as const },
    ]),
    query: { enabled },
  })

  return useMemo(() => {
    const byToken = new Map<string, BattleEligibility>()
    if (!data) return { byToken, supported: null }

    let anySuccess = false
    tokens.forEach((token, i) => {
      const eligibility = data[i * 2]
      const battled = data[i * 2 + 1]
      if (eligibility?.status !== 'success' || battled?.status !== 'success') {
        byToken.set(token.toLowerCase(), { state: 'unknown' })
        return
      }
      anySuccess = true
      const [firstCloseAt, eligible, disqualified, disqualifiedAt] = eligibility.result as readonly [
        number,
        boolean,
        boolean,
        number,
      ]
      let status: BattleEligibility
      if (battled.result) status = { state: 'battled' }
      else if (disqualified) status = { state: 'disqualified', at: Number(disqualifiedAt) }
      else if (eligible) status = { state: 'eligible' }
      else if (Number(firstCloseAt) > 0) {
        const since = Number(firstCloseAt)
        status = { state: 'qualifying', since, eligibleAt: since + ELIGIBILITY_WINDOW }
      } else status = { state: 'waiting' }
      byToken.set(token.toLowerCase(), status)
    })

    return { byToken, supported: anySuccess }
  }, [data, tokens])
}

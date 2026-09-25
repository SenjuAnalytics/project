'use client'

// Fees the pool hook still holds for graduated tokens, split the way the fee vault will split them when they are
// swept (see lib/parkedFees). Vault balances only move on a sweep, so the creator balance, the pending and battle
// pots and the league pool are all short by these amounts until then. Screens that show one of those balances
// add their part from here, so the numbers are complete without waiting for the daily sweep.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'

import {
  qualyraCompetitionVaultAbi,
  qualyraHookAbi,
  qualyraDeployment,
  isDeployed,
  NATIVE_PAIR_ASSET,
} from '@/lib/contracts'
import type { Project } from '@/lib/data'
import { splitParkedFees, untaggedRoute, type Accrual } from '@/lib/parkedFees'

/** QualyraCompetitionVault.BATTLE_DURATION in seconds. */
const BATTLE_DURATION = 24 * 60 * 60

/** Swaps add to the hook all the time and nothing announces it cheaply, so the reads poll. */
const REFRESH_MS = 30_000

/** Reads per token in the first batch: untagged fees, schedule, eligibility, hasBattled. */
const PER_TOKEN = 4

export interface TokenParkedFees {
  token: Address
  asset: Address
  /** Creator cut a withdrawal collects right now: untagged fees plus those of a battle that is booked or live. */
  creator: bigint
  /** Creator cut held for a battle past its live window. The vault credits it when the battle is finalized. */
  creatorAtSettlement: bigint
  /** Battle share headed for the token's pending pot. */
  pending: bigint
}

export interface ParkedFees {
  /** Tokens with something parked, by lowercase address. */
  tokens: ReadonlyMap<string, TokenParkedFees>
  /** Competition cut headed for each open battle's pot, by battle id. */
  battlePots: ReadonlyMap<number, bigint>
  /** League slice by lowercase pair asset. It lands in the week in progress when swept. */
  league: ReadonlyMap<string, bigint>
  isLoading: boolean
  refetch: () => void
}

type LaunchedToken = Project & { address: string; creatorShareBps: number; competitionShareBps: number }

const toAccrual = (result: unknown): Accrual => {
  const [tradeFee, creatorTax] = result as readonly [bigint, bigint]
  return { tradeFee, creatorTax }
}

function add<K>(map: Map<K, bigint>, key: K, amount: bigint) {
  if (amount > 0n) map.set(key, (map.get(key) ?? 0n) + amount)
}

/**
 * @param chainId Chain the caller reads the vaults on.
 * @param projects Any project list. Only graduated Qualyra launches are read.
 */
export function useParkedFees(chainId: number, projects: readonly Project[]): ParkedFees {
  const deployment = qualyraDeployment(chainId)
  const hook = deployment?.hook
  const vault = deployment?.competitionVault
  const enabled = isDeployed(hook) && isDeployed(vault)

  // Only graduated launches trade through the hook, and the split needs their launch record.
  const tokens = useMemo(
    () =>
      projects.filter(
        (p): p is LaunchedToken =>
          p.status === 'graduated' &&
          !!p.address &&
          p.creatorShareBps !== undefined &&
          p.competitionShareBps !== undefined,
      ),
    [projects],
  )

  // Routing depends on the clock (a battle's live window ending, the pending expiry), not only on chain data.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const stateQuery = useReadContracts({
    contracts: tokens.flatMap(p => {
      const token = p.address as Address
      return [
        { address: hook, chainId, abi: qualyraHookAbi, functionName: 'accruedFees' as const, args: [token, 0n] as const },
        { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'scheduleOf' as const, args: [token] as const },
        { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'eligibilityOf' as const, args: [token] as const },
        { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'hasBattled' as const, args: [token] as const },
      ]
    }),
    query: { enabled: enabled && tokens.length > 0, refetchInterval: REFRESH_MS },
  })

  // The battle each token is (or was last) booked into. Its bucket holds fees tagged to that battle until the
  // battle is finalized, which sweeps it. A cancelled booking is swept and cleared on the spot.
  const booked = useMemo(
    () =>
      tokens.flatMap((p, i) => {
        const entry = stateQuery.data?.[i * PER_TOKEN + 1]
        if (entry?.status !== 'success') return []
        const schedule = entry.result as unknown as { battleId: bigint | number; startTime: bigint | number }
        const battleId = Number(schedule.battleId)
        if (battleId === 0) return []
        return [{ index: i, token: p.address as Address, battleId, startTime: Number(schedule.startTime) }]
      }),
    [tokens, stateQuery.data],
  )

  const bucketQuery = useReadContracts({
    contracts: booked.map(b => ({
      address: hook,
      chainId,
      abi: qualyraHookAbi,
      functionName: 'accruedFees' as const,
      args: [b.token, BigInt(b.battleId)] as const,
    })),
    query: { enabled: enabled && booked.length > 0, refetchInterval: REFRESH_MS },
  })

  const { refetch: refetchState } = stateQuery
  const { refetch: refetchBuckets } = bucketQuery
  const refetch = useCallback(() => {
    refetchState()
    refetchBuckets()
  }, [refetchState, refetchBuckets])

  return useMemo<ParkedFees>(() => {
    const byToken = new Map<string, TokenParkedFees>()
    const battlePots = new Map<number, bigint>()
    const league = new Map<string, bigint>()

    const bookedAt = new Map(booked.map((b, j) => [b.index, { ...b, entry: bucketQuery.data?.[j] }]))

    tokens.forEach((p, i) => {
      const read = (offset: number) => stateQuery.data?.[i * PER_TOKEN + offset]
      const untaggedEntry = read(0)
      if (untaggedEntry?.status !== 'success') return

      const token = p.address as Address
      const asset = ((p.quoteAssetAddress as Address | undefined) ?? NATIVE_PAIR_ASSET) as Address
      const split = { creatorShareBps: p.creatorShareBps, competitionShareBps: p.competitionShareBps }

      const eligibilityEntry = read(2)
      const battledEntry = read(3)
      const eligibility =
        eligibilityEntry?.status === 'success'
          ? (eligibilityEntry.result as unknown as readonly [number | bigint, boolean, boolean, number | bigint])
          : undefined
      const route = untaggedRoute(
        {
          firstCloseAt: Number(eligibility?.[0] ?? 0),
          disqualified: Boolean(eligibility?.[2]),
          hasBattled: battledEntry?.status === 'success' && Boolean(battledEntry.result),
          launchedAt: p.launchedAt ?? 0,
        },
        now,
      )

      const untagged = splitParkedFees(toAccrual(untaggedEntry.result), split, false, route)
      let creator = untagged.creator
      let creatorAtSettlement = 0n
      add(league, asset.toLowerCase(), untagged.league)

      const booking = bookedAt.get(i)
      if (booking?.entry?.status === 'success') {
        const tagged = splitParkedFees(toAccrual(booking.entry.result), split, true, route)
        // A withdrawal sweeps the bucket the hook is filling right now, which is the battle's until its window ends.
        if (now < booking.startTime + BATTLE_DURATION) creator += tagged.creator
        else creatorAtSettlement += tagged.creator
        add(battlePots, booking.battleId, tagged.pot)
      }

      if (creator + creatorAtSettlement + untagged.pending > 0n) {
        byToken.set(token.toLowerCase(), { token, asset, creator, creatorAtSettlement, pending: untagged.pending })
      }
    })

    return {
      tokens: byToken,
      battlePots,
      league,
      isLoading: stateQuery.isLoading || bucketQuery.isLoading,
      refetch,
    }
  }, [tokens, booked, now, stateQuery.data, stateQuery.isLoading, bucketQuery.data, bucketQuery.isLoading, refetch])
}

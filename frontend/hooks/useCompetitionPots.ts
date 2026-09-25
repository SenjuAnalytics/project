'use client'

// On-chain reads for the two competition pots, kept apart so the UI can show them side by side:
//
//   • Battle pots — funded by the 15% competition share of a token's trading fees.
//       - pending: until a token's battle is booked, 70% of that share waits in `pendingBattlePot(token, asset)`.
//                  It seeds the pot at booking. It goes to the treasury instead if the token is disqualified
//                  before it qualifies, or starts no eligibility timer within 30 days of launch. It is never
//                  paid to the league.
//       - open:    the pot of a battle that is booked, live or settling, from `getBattle(id).pot`. From the
//                  booking until the 24 hours end, the whole 15% goes in. The keeper finalizes the battle once
//                  its challenge window closes, and the pot goes to the buyback.
//   • League pot — the other 30% of the share outside battles, in `weekPool(week, asset)`, or in the
//     bootstrap pool until the league starts.
//
// Every balance includes what the pool hook still holds for it (useParkedFees), so the numbers don't wait for
// the daily sweep. Only balances live here. Battle lifecycle, winners and claims are in useCompetition.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChainId, useReadContracts } from 'wagmi'
import { watchContractEvent } from '@wagmi/core'
import { formatUnits, type Address } from 'viem'

import { wagmiConfig } from '@/lib/wagmi'
import {
  qualyraCompetitionVaultAbi,
  qualyraDeployment,
  isDeployed,
  resolveTargetChainId,
  NATIVE_PAIR_ASSET,
} from '@/lib/contracts'
import { usePairAssets } from '@/lib/usePairAssets'
import { quoteToUsd } from '@/lib/pricing'
import { useAllProjects } from '@/hooks/useAllProjects'
import { useParkedFees } from '@/hooks/useParkedFees'

/** A pot balance for a single pair asset, in whole units and its USD estimate. */
export interface PotAmount {
  asset: Address
  symbol: string
  amount: number
  usd: number
  /** Part of `amount` the pool hook still holds. The next sweep moves it into the vault. */
  unswept: number
}

/** The battle share a token has parked while it has no open battle. Seeds its next battle. */
export interface PendingBattlePot {
  token: Address
  tick: string
  name: string
  logoUrl?: string
  /** One entry per pair asset that has a non-zero pending balance. */
  amounts: PotAmount[]
  totalUsd: number
}

/** Where an open battle stands. `settling`: the 24 hours are over and the pot waits to be finalized. */
export type OpenBattlePhase = 'booked' | 'live' | 'settling'

/** The pot of a battle that is booked, live or settling. */
export interface ActiveBattlePot {
  battleId: number
  tokenA: Address
  tokenB: Address
  tickA: string
  tickB: string
  asset: Address
  assetSymbol: string
  amount: number
  usd: number
  /** Part of `amount` the pool hook still holds. Finalize sweeps it into the pot at the latest. */
  unswept: number
  startTime: number
  endTime: number
  /** The 24 hours are running. */
  live: boolean
  phase: OpenBattlePhase
  /** When the posted result can be finalized, or zero while no result is posted. */
  settlesAt: number
}

/** The Trader League prize pool for one week, summed across assets. */
export interface LeagueWeekPot {
  week: number
  pools: PotAmount[]
  totalUsd: number
}

export interface CompetitionPotsState {
  deployed: boolean
  /** First read of the vault counters still in flight. */
  isLoading: boolean
  chainId: number
  vaultAddress?: Address

  /** Battle share held per token, waiting to seed a future battle. */
  pendingBattlePots: PendingBattlePot[]
  pendingTotalUsd: number
  /** Part of `pendingTotalUsd` the pool hook still holds. */
  pendingUnsweptUsd: number
  pendingLoading: boolean
  /**
   * False when every `pendingBattlePot` read reverted, i.e. the deployed vault predates per-token battle
   * pots. Null until there is something to read.
   */
  pendingSupported: boolean | null

  /** Pots of battles that are booked, live or settling right now. */
  activeBattlePots: ActiveBattlePot[]
  activeTotalUsd: number
  /** Part of `activeTotalUsd` the pool hook still holds. */
  activeUnsweptUsd: number

  /** Trader League pool for the week in progress. */
  currentLeaguePot: LeagueWeekPot | null
  /** Trader League pools already funded for upcoming weeks. */
  upcomingLeaguePots: LeagueWeekPot[]
  /** Pre-start bootstrap pool (before startLeague has run). */
  bootstrapPot: LeagueWeekPot | null
  /** startLeague has run, so fees fund weekly pools instead of the bootstrap pool. */
  leagueStarted: boolean
  leagueTotalUsd: number
  /** Part of `leagueTotalUsd` the pool hook still holds. It lands in the week in progress when swept. */
  leagueUnsweptUsd: number

  refetch: () => void
}

const BATTLE_DURATION = 24 * 60 * 60 // seconds, mirrors QualyraCompetitionVault.BATTLE_DURATION
const BATTLE_CHALLENGE_PERIOD = 24 * 60 * 60 // seconds, mirrors QualyraCompetitionVault.BATTLE_CHALLENGE_PERIOD

type BattleTuple = {
  tokenA: Address
  startTime: bigint
  tokenB: Address
  proposedAt: bigint
  outcome: number
  finalized: boolean
  asset: Address
  pot: bigint
  datasetHash: `0x${string}`
  resultHash: `0x${string}`
}

const ZERO = '0x0000000000000000000000000000000000000000'

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export function useCompetitionPots(): CompetitionPotsState {
  const chainId = resolveTargetChainId(useChainId())
  const vault = qualyraDeployment(chainId)?.competitionVault
  const enabled = isDeployed(vault)

  const { assets } = usePairAssets()
  const { projects } = useAllProjects()
  const parked = useParkedFees(chainId, projects)

  // Re-evaluates which battles are live without waiting for new data.
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 15_000)
    return () => clearInterval(timer)
  }, [])

  // Every launched token can hold a pending battle share, so we read pendingBattlePot for each
  // token+asset pair. Also grab the counters we need to enumerate battles and league weeks.
  const tokenAddresses = useMemo(
    () => projects.map(p => p.address).filter((a): a is Address => !!a),
    [projects],
  )

  // 1. Counters: battleCount + currentWeek + firstLeagueWeek, then bootstrapPool per asset.
  const baseQuery = useReadContracts({
    contracts: [
      { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'battleCount' },
      { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'currentWeek' },
      { address: vault, chainId, abi: qualyraCompetitionVaultAbi, functionName: 'firstLeagueWeek' },
      ...assets.map(asset => ({
        address: vault,
        chainId,
        abi: qualyraCompetitionVaultAbi,
        functionName: 'bootstrapPool' as const,
        args: [asset.address] as const,
      })),
    ],
    query: { enabled: enabled && assets.length > 0 },
  })

  const battleCount =
    baseQuery.data?.[0]?.status === 'success' ? Number(baseQuery.data[0].result as bigint) : 0
  const currentWeekNum =
    baseQuery.data?.[1]?.status === 'success' ? Number(baseQuery.data[1].result as bigint) : 0
  const firstLeagueWeek =
    baseQuery.data?.[2]?.status === 'success' ? Number(baseQuery.data[2].result as bigint) : 0

  const battleIds = useMemo(
    () => Array.from({ length: battleCount }, (_, i) => i + 1),
    [battleCount],
  )

  // Weeks we want league pools for: the one in progress plus the next two already funded.
  const weekList = useMemo(() => {
    if (currentWeekNum <= 0) return [] as number[]
    return [currentWeekNum, currentWeekNum + 1, currentWeekNum + 2]
  }, [currentWeekNum])

  // 2. pendingBattlePot(token, asset) for every token × asset.
  const pendingContracts = useMemo(
    () =>
      tokenAddresses.flatMap(token =>
        assets.map(asset => ({
          address: vault,
          chainId,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'pendingBattlePot' as const,
          args: [token, asset.address] as const,
        })),
      ),
    [tokenAddresses, assets, vault, chainId],
  )

  const pendingQuery = useReadContracts({
    contracts: pendingContracts,
    query: { enabled: enabled && pendingContracts.length > 0 },
  })

  // 3. getBattle(id) for each battle, so we can surface the pot of the ones that are open.
  const battlesQuery = useReadContracts({
    contracts: battleIds.map(id => ({
      address: vault,
      chainId,
      abi: qualyraCompetitionVaultAbi,
      functionName: 'getBattle' as const,
      args: [BigInt(id)] as const,
    })),
    query: { enabled: enabled && battleCount > 0 },
  })

  // 4. weekPool(week, asset) for the current + upcoming weeks.
  const weekPoolContracts = useMemo(
    () =>
      weekList.flatMap(week =>
        assets.map(asset => ({
          address: vault,
          chainId,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'weekPool' as const,
          args: [BigInt(week), asset.address] as const,
        })),
      ),
    [weekList, assets, vault, chainId],
  )

  const weekPoolQuery = useReadContracts({
    contracts: weekPoolContracts,
    query: { enabled: enabled && weekPoolContracts.length > 0 },
  })

  // Keep the latest refetchers in a ref so the event watcher (registered once per chain/vault) always
  // calls the current query instances without re-subscribing on every render.
  const refetchAllRef = useRef<() => void>(() => {})
  useEffect(() => {
    refetchAllRef.current = () => {
      baseQuery.refetch()
      pendingQuery.refetch()
      battlesQuery.refetch()
      weekPoolQuery.refetch()
      // A sweep empties the hook in the same transaction that credits the vault.
      parked.refetch()
    }
  })

  // Any vault event can move money between the pots (fees parked or seeded, battle deposits, league
  // funding, claims, drains), so one subscription to all of them refreshes the reads.
  useEffect(() => {
    if (!enabled || !vault) return
    return watchContractEvent(wagmiConfig, {
      address: vault,
      abi: qualyraCompetitionVaultAbi,
      // resolveTargetChainId always returns a chain the wagmiConfig knows about; the plain
      // `number` type just isn't narrow enough for @wagmi/core's chain-id union.
      chainId: chainId as (typeof wagmiConfig)['chains'][number]['id'],
      onLogs: () => refetchAllRef.current(),
    })
  }, [enabled, vault, chainId])

  return useMemo<CompetitionPotsState>(() => {
    const refetch = () => {
      baseQuery.refetch()
      pendingQuery.refetch()
      battlesQuery.refetch()
      weekPoolQuery.refetch()
      parked.refetch()
    }

    if (!enabled) {
      return {
        deployed: false,
        isLoading: false,
        chainId,
        vaultAddress: vault,
        pendingBattlePots: [],
        pendingTotalUsd: 0,
        pendingUnsweptUsd: 0,
        pendingLoading: false,
        pendingSupported: null,
        activeBattlePots: [],
        activeTotalUsd: 0,
        activeUnsweptUsd: 0,
        currentLeaguePot: null,
        upcomingLeaguePots: [],
        bootstrapPot: null,
        leagueStarted: false,
        leagueTotalUsd: 0,
        leagueUnsweptUsd: 0,
        refetch,
      }
    }

    const isLoading = baseQuery.isLoading
    const now = nowSec

    const pendingResults = pendingQuery.data ?? []
    const pendingSupported =
      pendingResults.length === 0 ? null : pendingResults.some(r => r.status === 'success')

    const assetSymbolFor = (asset: Address): string => {
      if (asset === NATIVE_PAIR_ASSET) return 'ETH'
      return assets.find(a => a.address.toLowerCase() === asset.toLowerCase())?.symbol ?? shortAddr(asset)
    }
    const assetDecimalsFor = (asset: Address): number => {
      if (asset === NATIVE_PAIR_ASSET) return 18
      return assets.find(a => a.address.toLowerCase() === asset.toLowerCase())?.decimals ?? 18
    }

    const projectByAddress = new Map<string, (typeof projects)[number]>()
    projects.forEach(p => {
      if (p.address) projectByAddress.set(p.address.toLowerCase(), p)
    })
    const tickFor = (token: Address) =>
      projectByAddress.get(token.toLowerCase())?.tick ?? shortAddr(token)

    // ---- Pending battle pots (the 70% held while idle) ----
    const pendingBattlePots: PendingBattlePot[] = []
    let pendingTotalUsd = 0
    let pendingUnsweptUsd = 0
    tokenAddresses.forEach((token, ti) => {
      const amounts: PotAmount[] = []
      let tokenUsd = 0
      const held = parked.tokens.get(token.toLowerCase())
      assets.forEach((asset, ai) => {
        const raw = pendingQuery.data?.[ti * assets.length + ai]
        // A vault without per-token pending pots has nowhere to put the parked share either.
        if (raw?.status !== 'success') return
        const inVault = raw.result as bigint
        const inHook = held?.asset.toLowerCase() === asset.address.toLowerCase() ? held.pending : 0n
        if (inVault + inHook <= 0n) return
        const amount = Number(formatUnits(inVault + inHook, asset.decimals))
        const unswept = Number(formatUnits(inHook, asset.decimals))
        const usd = quoteToUsd(amount, asset.symbol)
        tokenUsd += usd
        pendingUnsweptUsd += quoteToUsd(unswept, asset.symbol)
        amounts.push({ asset: asset.address, symbol: asset.symbol, amount, usd, unswept })
      })
      if (amounts.length === 0) return
      pendingTotalUsd += tokenUsd
      const project = projectByAddress.get(token.toLowerCase())
      pendingBattlePots.push({
        token,
        tick: project?.tick ?? shortAddr(token),
        name: project?.name ?? shortAddr(token),
        logoUrl: project?.logoUrl,
        amounts,
        totalUsd: tokenUsd,
      })
    })
    pendingBattlePots.sort((a, b) => b.totalUsd - a.totalUsd)

    // ---- Open battle pots: booked, live, or over and waiting to be finalized ----
    const activeBattlePots: ActiveBattlePot[] = []
    let activeTotalUsd = 0
    let activeUnsweptUsd = 0
    battleIds.forEach((id, i) => {
      const entry = battlesQuery.data?.[i]
      if (entry?.status !== 'success') return
      const b = entry.result as unknown as BattleTuple
      const startTime = Number(b.startTime)
      const endTime = startTime + BATTLE_DURATION
      const bothZero =
        b.tokenA.toLowerCase() === ZERO && b.tokenB.toLowerCase() === ZERO
      // A finalized pot is spent, or refunded to both tokens when the booking was cancelled.
      if (bothZero || startTime === 0 || b.finalized) return

      const decimals = assetDecimalsFor(b.asset)
      const inHook = parked.battlePots.get(id) ?? 0n
      const amount = Number(formatUnits(b.pot + inHook, decimals))
      const unswept = Number(formatUnits(inHook, decimals))
      const assetSymbol = assetSymbolFor(b.asset)
      const usd = quoteToUsd(amount, assetSymbol)
      const proposedAt = Number(b.proposedAt)
      activeTotalUsd += usd
      activeUnsweptUsd += quoteToUsd(unswept, assetSymbol)
      activeBattlePots.push({
        battleId: id,
        tokenA: b.tokenA,
        tokenB: b.tokenB,
        tickA: tickFor(b.tokenA),
        tickB: tickFor(b.tokenB),
        asset: b.asset,
        assetSymbol,
        amount,
        usd,
        unswept,
        startTime,
        endTime,
        live: startTime <= now && now < endTime,
        phase: now < startTime ? 'booked' : now < endTime ? 'live' : 'settling',
        settlesAt: proposedAt > 0 ? proposedAt + BATTLE_CHALLENGE_PERIOD : 0,
      })
    })

    // ---- League pots (the 30% share) ----
    // A sweep funds the week in progress (the first league week if it hasn't begun), or the bootstrap pool
    // before the league starts, so that is where the league slice the hook still holds is counted.
    const sweepWeek = firstLeagueWeek === 0 ? 0 : Math.max(currentWeekNum, firstLeagueWeek)
    let leagueUnsweptUsd = 0
    const readAmount = (entry: { status: string; result?: unknown } | undefined): bigint =>
      entry?.status === 'success' ? (entry.result as bigint) : 0n
    const leaguePot = (week: number, inVaultAt: (assetIndex: number) => bigint): LeagueWeekPot => {
      const pools: PotAmount[] = []
      let totalUsd = 0
      assets.forEach((asset, ai) => {
        const inVault = inVaultAt(ai)
        const inHook = week === sweepWeek ? (parked.league.get(asset.address.toLowerCase()) ?? 0n) : 0n
        if (inVault + inHook <= 0n) return
        const amount = Number(formatUnits(inVault + inHook, asset.decimals))
        const unswept = Number(formatUnits(inHook, asset.decimals))
        const usd = quoteToUsd(amount, asset.symbol)
        totalUsd += usd
        leagueUnsweptUsd += quoteToUsd(unswept, asset.symbol)
        pools.push({ asset: asset.address, symbol: asset.symbol, amount, usd, unswept })
      })
      return { week, pools, totalUsd }
    }
    const weekPotFor = (weekIdx: number, week: number): LeagueWeekPot =>
      leaguePot(week, ai => readAmount(weekPoolQuery.data?.[weekIdx * assets.length + ai]))

    const currentLeaguePot: LeagueWeekPot | null =
      weekList.length > 0 ? weekPotFor(0, weekList[0]) : null
    const upcomingLeaguePots: LeagueWeekPot[] = weekList
      .slice(1)
      .map((week, i) => weekPotFor(i + 1, week))
      .filter(pot => pot.pools.length > 0)

    // Bootstrap pool (only meaningful before startLeague; firstLeagueWeek === 0).
    let bootstrapPot: LeagueWeekPot | null = null
    if (firstLeagueWeek === 0) {
      const pot = leaguePot(0, ai => readAmount(baseQuery.data?.[3 + ai]))
      if (pot.pools.length > 0) bootstrapPot = pot
    }

    const leagueTotalUsd =
      (currentLeaguePot?.totalUsd ?? 0) +
      upcomingLeaguePots.reduce((s, p) => s + p.totalUsd, 0) +
      (bootstrapPot?.totalUsd ?? 0)

    return {
      deployed: true,
      isLoading,
      chainId,
      vaultAddress: vault,
      pendingBattlePots,
      pendingTotalUsd,
      pendingUnsweptUsd,
      pendingLoading: pendingQuery.isLoading,
      pendingSupported,
      activeBattlePots,
      activeTotalUsd,
      activeUnsweptUsd,
      currentLeaguePot,
      upcomingLeaguePots,
      bootstrapPot,
      leagueStarted: firstLeagueWeek !== 0,
      leagueTotalUsd,
      leagueUnsweptUsd,
      refetch,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    chainId,
    vault,
    assets,
    projects,
    tokenAddresses,
    battleIds,
    weekList,
    currentWeekNum,
    firstLeagueWeek,
    nowSec,
    parked,
    baseQuery.data,
    baseQuery.isLoading,
    pendingQuery.data,
    pendingQuery.isLoading,
    battlesQuery.data,
    battlesQuery.isLoading,
    weekPoolQuery.data,
    weekPoolQuery.isLoading,
  ])
}

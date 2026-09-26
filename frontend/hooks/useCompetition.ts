'use client'

// Live on-chain reads and write actions for the Battles & Trader League pages,
// straight from the QualyraCompetitionVault.
//
// Supports:
// 1. Reading live on-chain battles, pots, status, and countdowns. Pots include what the pool hook still holds.
// 2. Reading Trader League weekly prize pools (including bootstrap pool before official start).
// 3. 1-click Prize Claiming for winning traders (claim).
// 4. Settling battles and weeks. The keeper service finalizes both as soon as their challenge window closes;
//    finalizeBattle and finalizeWeek stay here as the fallback anyone can use if it falls behind.

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useChainId, useReadContracts, useAccount, useWriteContract } from 'wagmi'
import { formatUnits, type Address } from 'viem'
import { waitForTransactionReceipt } from '@wagmi/core'

import { wagmiConfig } from '@/lib/wagmi'
import { useToast } from '@/components/ui/Toast'
import { feeOverrides, describeTxError } from '@/lib/gas'
import { openTxReceipt } from '@/components/shared/TxReceiptModal'
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
import { WEEK, weekEndsAt } from '@/lib/competitionTime'

// Documented in the contract; hardcoded so we don't pay a multicall for constants.
const BATTLE_DURATION = 24 * 60 * 60 // 24h, seconds
const BATTLE_CHALLENGE_PERIOD = 24 * 60 * 60 // 24h, seconds
const LEAGUE_CHALLENGE_PERIOD = 48 * 60 * 60 // 48h, seconds
/** How late the keeper can be settling something before the UI offers the permissionless call. */
const SETTLE_GRACE = 60 * 60 // 1h, seconds

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

/**
 * Trader League split of the vault in this repo, first to fifth place, in percent (`prizeShareBps` / 100).
 * Only a fallback: `usePrizeShares` reads what the deployed vault actually pays.
 */
export const PRIZE_SHARE_PERCENT: readonly number[] = [40, 30, 15, 10, 5]
export const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th'] as const
const MAX_PRIZE_PLACES = RANK_LABELS.length

export type BattleStatus =
  | 'upcoming'
  | 'live'
  | 'awaiting-result'
  | 'challenge'
  | 'finalized'
  | 'void'
  /** The guardian cancelled the booking before the start; both tokens got their contribution back as pending. */
  | 'canceled'

export interface BattleTokenInfo {
  address: Address
  tick: string
  name: string
  logoUrl?: string
  rwa?: boolean
  price?: number
  id?: string
}

export interface BattleView {
  id: number
  asset: Address
  assetSymbol: string
  startTime: number
  endTime: number
  pot: number
  /** Undefined when the battle's pair asset has no USD price — rendered as "—". */
  potUsd: number | undefined
  outcome: number
  finalized: boolean
  status: BattleStatus
  winnerSide: 'A' | 'B' | null
  tokenA: BattleTokenInfo
  tokenB: BattleTokenInfo
  /** Part of `pot` the pool hook still holds. Finalizing sweeps it in. */
  unswept: number
  proposedAt: number
  /** When the posted result can be finalized, or zero while none is posted. */
  settlesAt: number
  canFinalize: boolean
  /** The keeper is late settling it, so the UI offers the permissionless call. */
  settleOverdue: boolean
}

export interface LeaguePoolEntry {
  asset: Address
  symbol: string
  amount: number
  /** Undefined when the asset has no USD price — rendered as "—". */
  usd: number | undefined
}

export interface WeekView {
  week: number
  endsAt: number
  closed: boolean
  proposedAt: number
  finalizedAt: number
  pools: LeaguePoolEntry[]
  totalUsd: number
  winners: Address[]
  /** When the posted winners can be finalized, or zero while none are posted. */
  settlesAt: number
  canFinalize: boolean
  /** The keeper is late settling it, so the UI offers the permissionless call. */
  settleOverdue: boolean
}

export interface UserClaimablePrize {
  week: number
  /** 0 is first place. */
  rank: number
  rankLabel: '1st' | '2nd' | '3rd' | '4th' | '5th'
  /** Share of the week's pool, per asset. See `prizeShareBps` in the vault. */
  sharePercent: number
  assets: {
    address: Address
    symbol: string
    amount: number
    /** Undefined when the asset has no USD price — rendered as "—". */
    usd: number | undefined
  }[]
  totalUsd: number
}

export interface CompetitionState {
  deployed: boolean
  isLoading: boolean
  battles: BattleView[]
  currentWeek: WeekView | null
  pastWeeks: WeekView[]
  vaultAddress?: Address
  chainId: number
  firstLeagueWeek: number
  currentWeekNum: number
  totalPrizePoolUsd: number
  /** Percent of each asset paid per place, first place first, as the deployed vault pays it. */
  prizeShares: readonly number[]
  bootstrapPools: LeaguePoolEntry[]
  userClaimable: UserClaimablePrize[]
  claimPrize: (week: number, rank: number, assets: Address[]) => Promise<`0x${string}` | undefined>
  finalizeBattle: (battleId: number) => Promise<`0x${string}` | undefined>
  finalizeWeek: (week: number) => Promise<`0x${string}` | undefined>
  isPendingTx: boolean
  refetch: () => void
}

// Raw tuple shapes returned by wagmi for the vault reads.
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

type WeekResultTuple = {
  /** address[5], zero for places nobody took. */
  winners: readonly Address[]
  proposedAt: bigint
  finalizedAt: bigint
  closed: boolean
  datasetHash: `0x${string}`
  resultHash: `0x${string}`
}

const shortAddr = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

function winnerSideFor(outcome: number): 'A' | 'B' | null {
  if (outcome === 1 || outcome === 5) return 'A'
  if (outcome === 2 || outcome === 4) return 'B'
  return null
}

function statusFor(
  now: number,
  startTime: number,
  endTime: number,
  outcome: number,
  finalized: boolean,
  proposedAt: number,
): BattleStatus {
  // A cancelled booking is finalized as void without a result ever being posted, usually before its start.
  if (finalized) return outcome === 6 ? (proposedAt === 0 ? 'canceled' : 'void') : 'finalized'
  if (now < startTime) return 'upcoming'
  if (now < endTime) return 'live'
  return outcome === 0 ? 'awaiting-result' : 'challenge'
}

function statusRank(status: BattleStatus): number {
  switch (status) {
    case 'live':
      return 0
    case 'upcoming':
      return 1
    case 'awaiting-result':
    case 'challenge':
      return 2
    default:
      return 3
  }
}

/**
 * Trader League split as the deployed vault pays it: percent per paid place, first place first. Vaults
 * deployed before the five-place league pay fewer places, so the list stops at the first rank the vault
 * rejects or pays nothing for. Falls back to PRIZE_SHARE_PERCENT until the read lands.
 */
export function usePrizeShares(): readonly number[] {
  const chainId = resolveTargetChainId(useChainId())
  const vault = qualyraDeployment(chainId)?.competitionVault

  const { data } = useReadContracts({
    contracts: Array.from({ length: MAX_PRIZE_PLACES }, (_, rank) => ({
      address: vault,
      chainId,
      abi: qualyraCompetitionVaultAbi,
      functionName: 'prizeShareBps' as const,
      args: [BigInt(rank)] as const,
    })),
    // A pure function of the deployed bytecode, so one read per session is enough.
    query: { enabled: isDeployed(vault), staleTime: Infinity },
  })

  return useMemo(() => {
    const shares: number[] = []
    for (const read of data ?? []) {
      if (read.status !== 'success') break
      const bps = Number(read.result as bigint)
      if (bps === 0) break
      shares.push(bps / 100)
    }
    return shares.length > 0 ? shares : PRIZE_SHARE_PERCENT
  }, [data])
}

export function useCompetition(): CompetitionState {
  const chainId = resolveTargetChainId(useChainId())
  const { address, isConnected } = useAccount()
  const { toast } = useToast()
  const { writeContractAsync } = useWriteContract()

  const [isPendingTx, setIsPendingTx] = useState(false)
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000))
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const vault = qualyraDeployment(chainId)?.competitionVault
  const enabled = isDeployed(vault)
  const prizeShares = usePrizeShares()

  const { assets } = usePairAssets()
  const { projects } = useAllProjects()
  const parked = useParkedFees(chainId, projects)
  const { refetch: refetchParked } = parked

  // 1. Base read: battleCount, currentWeek, firstLeagueWeek + bootstrapPool per asset
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

  // 2. Build the id and week lists deterministically.
  const battleIds = useMemo(
    () => Array.from({ length: battleCount }, (_, i) => i + 1),
    [battleCount],
  )

  const weekList = useMemo(() => {
    if (currentWeekNum <= 0) return [] as number[]
    const floor = Math.max(firstLeagueWeek, 1)
    return [currentWeekNum, currentWeekNum - 1, currentWeekNum - 2].filter(
      w => w > 0 && (firstLeagueWeek === 0 || w >= floor),
    )
  }, [currentWeekNum, firstLeagueWeek])

  // 3. Battles read: getBattle(id) for each id.
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

  // 4. League read: weekEndsAt(week) + getWeekResult(week) per week, then weekPool(week, asset)
  const leagueQuery = useReadContracts({
    contracts: [
      ...weekList.flatMap(week => [
        {
          address: vault,
          chainId,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'weekEndsAt' as const,
          args: [BigInt(week)] as const,
        },
        {
          address: vault,
          chainId,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'getWeekResult' as const,
          args: [BigInt(week)] as const,
        },
      ]),
      ...weekList.flatMap(week =>
        assets.map(asset => ({
          address: vault,
          chainId,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'weekPool' as const,
          args: [BigInt(week), asset.address] as const,
        })),
      ),
    ],
    query: {
      enabled: enabled && weekList.length > 0 && assets.length > 0,
    },
  })

  // 5. Prizes the connected wallet can claim: claimableOf(week, rank, asset) for every finalized week it
  //    placed in. The vault returns zero once a prize is paid or the claim window has closed.
  const claimSlots = useMemo(() => {
    if (!leagueQuery.data || !address) return []
    const slots: { week: number; rank: number; asset: (typeof assets)[number] }[] = []
    weekList.forEach((week, wi) => {
      const resRaw = leagueQuery.data[wi * 2 + 1]
      if (resRaw?.status !== 'success') return
      const r = resRaw.result as unknown as WeekResultTuple
      if (!r || r.finalizedAt === 0n || r.closed) return
      const rank = r.winners.findIndex(w => w && w.toLowerCase() === address.toLowerCase())
      if (rank === -1) return
      assets.forEach(asset => slots.push({ week, rank, asset }))
    })
    return slots
  }, [weekList, leagueQuery.data, address, assets])

  const claimsQuery = useReadContracts({
    contracts: claimSlots.map(slot => ({
      address: vault,
      chainId,
      abi: qualyraCompetitionVaultAbi,
      functionName: 'claimableOf' as const,
      args: [BigInt(slot.week), BigInt(slot.rank), slot.asset.address] as const,
    })),
    query: { enabled: enabled && isConnected && claimSlots.length > 0 },
  })

  // Refetch all queries
  const refetchAll = useCallback(() => {
    baseQuery.refetch()
    battlesQuery.refetch()
    leagueQuery.refetch()
    claimsQuery.refetch()
    refetchParked()
  }, [baseQuery, battlesQuery, leagueQuery, claimsQuery, refetchParked])

  // Write Action 1: Claim Trader League Prize
  const claimPrize = useCallback(
    async (week: number, rank: number, assetsToClaim: Address[]) => {
      if (!address || !isConnected) {
        toast.error('Wallet Not Connected', 'Please connect your wallet first.')
        return
      }
      if (!isDeployed(vault)) {
        toast.error('Network Error', 'Competition vault is not deployed on this network.')
        return
      }
      try {
        setIsPendingTx(true)
        const fees = await feeOverrides(chainId)
        const hash = await writeContractAsync({
          address: vault!,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'claim',
          args: [BigInt(week), BigInt(rank), assetsToClaim],
          ...fees,
        })
        toast.info('Claim Submitted', `Transaction ${hash.slice(0, 10)}… is processing.`)
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
        if (receipt.status === 'reverted') {
          toast.error('Transaction Reverted', 'The claim transaction was reverted by the chain.')
          return
        }
        toast.success('Prize Claimed Successfully!', `Trader League reward for Week #${week} claimed!`)
        openTxReceipt({ txHash: hash, actionTitle: `Claim Week #${week} Reward` })
        refetchAll()
        return hash
      } catch (err) {
        const { title, detail } = describeTxError(err)
        toast.error(title, detail)
      } finally {
        setIsPendingTx(false)
      }
    },
    [address, isConnected, chainId, vault, writeContractAsync, toast, refetchAll, setIsPendingTx],
  )

  // Write Action 2: Finalize Battle (Sweeps hook fees and buys back + burns winning token)
  const finalizeBattle = useCallback(
    async (battleId: number) => {
      if (!address || !isConnected) {
        toast.error('Wallet Not Connected', 'Please connect your wallet first.')
        return
      }
      if (!isDeployed(vault)) {
        toast.error('Network Error', 'Competition vault is not deployed on this network.')
        return
      }
      try {
        setIsPendingTx(true)
        const fees = await feeOverrides(chainId)
        const hash = await writeContractAsync({
          address: vault!,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'finalizeBattle',
          args: [BigInt(battleId)],
          ...fees,
        })
        toast.info('Finalizing Battle', `Transaction ${hash.slice(0, 10)}… is processing.`)
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
        if (receipt.status === 'reverted') {
          toast.error('Transaction Reverted', 'The finalize transaction was reverted.')
          return
        }
        toast.success('Battle Finalized!', `Pot has been swept to buyback and burn the winning token!`)
        openTxReceipt({ txHash: hash, actionTitle: `Finalize Battle #${battleId}` })
        refetchAll()
        return hash
      } catch (err) {
        const { title, detail } = describeTxError(err)
        toast.error(title, detail)
      } finally {
        setIsPendingTx(false)
      }
    },
    [address, isConnected, chainId, vault, writeContractAsync, toast, refetchAll, setIsPendingTx],
  )

  // Write Action 3: Finalize Week (Opens prize claims for winners)
  const finalizeWeek = useCallback(
    async (week: number) => {
      if (!address || !isConnected) {
        toast.error('Wallet Not Connected', 'Please connect your wallet first.')
        return
      }
      if (!isDeployed(vault)) {
        toast.error('Network Error', 'Competition vault is not deployed on this network.')
        return
      }
      try {
        setIsPendingTx(true)
        const fees = await feeOverrides(chainId)
        const hash = await writeContractAsync({
          address: vault!,
          abi: qualyraCompetitionVaultAbi,
          functionName: 'finalizeWeek',
          args: [BigInt(week)],
          ...fees,
        })
        toast.info('Finalizing Week', `Transaction ${hash.slice(0, 10)}… is processing.`)
        const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
        if (receipt.status === 'reverted') {
          toast.error('Transaction Reverted', 'The finalize transaction was reverted.')
          return
        }
        toast.success('Week Finalized!', `Rewards are now open for claiming for Week #${week}!`)
        openTxReceipt({ txHash: hash, actionTitle: `Finalize Week #${week}` })
        refetchAll()
        return hash
      } catch (err) {
        const { title, detail } = describeTxError(err)
        toast.error(title, detail)
      } finally {
        setIsPendingTx(false)
      }
    },
    [address, isConnected, chainId, vault, writeContractAsync, toast, refetchAll, setIsPendingTx],
  )

  return useMemo<CompetitionState>(() => {
    if (!enabled) {
      return {
        deployed: false,
        isLoading: false,
        battles: [],
        currentWeek: null,
        pastWeeks: [],
        vaultAddress: undefined,
        chainId,
        firstLeagueWeek: 0,
        currentWeekNum: 0,
        totalPrizePoolUsd: 0,
        prizeShares,
        bootstrapPools: [],
        userClaimable: [],
        claimPrize,
        finalizeBattle,
        finalizeWeek,
        isPendingTx: false,
        refetch: refetchAll,
      }
    }

    const isLoading =
      baseQuery.isLoading || battlesQuery.isLoading || leagueQuery.isLoading

    const now = nowSec

    // Lowercase-address → asset metadata (symbol, decimals).
    const assetByAddress = new Map<string, { symbol: string; decimals: number }>()
    assets.forEach(a =>
      assetByAddress.set(a.address.toLowerCase(), { symbol: a.symbol, decimals: a.decimals }),
    )

    const assetSymbolFor = (asset: Address): string => {
      if (asset === NATIVE_PAIR_ASSET) return 'ETH'
      return assetByAddress.get(asset.toLowerCase())?.symbol ?? shortAddr(asset)
    }
    const assetDecimalsFor = (asset: Address): number => {
      if (asset === NATIVE_PAIR_ASSET) return 18
      return assetByAddress.get(asset.toLowerCase())?.decimals ?? 18
    }

    // Lowercase-address → project metadata.
    const projectByAddress = new Map<string, (typeof projects)[number]>()
    projects.forEach(p => {
      if (p.address) projectByAddress.set(p.address.toLowerCase(), p)
    })

    const tokenInfoFor = (tokenAddress: Address): BattleTokenInfo => {
      const project = projectByAddress.get(tokenAddress.toLowerCase())
      if (!project) {
        const short = shortAddr(tokenAddress)
        return { address: tokenAddress, tick: short, name: short }
      }
      return {
        address: tokenAddress,
        tick: project.tick,
        name: project.name,
        logoUrl: project.logoUrl,
        rwa: project.rwa,
        price: project.price,
        id: project.id,
      }
    }

    // A sweep funds the week in progress (the first league week if it hasn't begun), or the bootstrap pool before
    // the league starts, so that is where the league slice the pool hook still holds is counted.
    const sweepWeek = firstLeagueWeek === 0 ? 0 : Math.max(currentWeekNum, firstLeagueWeek)
    const parkedLeague = (week: number, asset: Address): bigint =>
      week === sweepWeek ? (parked.league.get(asset.toLowerCase()) ?? 0n) : 0n

    // ---- Bootstrap Pools ----
    const bootstrapPools: LeaguePoolEntry[] = []
    let totalBootstrapUsd = 0
    assets.forEach((asset, i) => {
      const raw = baseQuery.data?.[3 + i]
      const amtRaw = (raw?.status === 'success' ? (raw.result as bigint) : 0n) + parkedLeague(0, asset.address)
      if (amtRaw > 0n) {
        const amount = Number(formatUnits(amtRaw, asset.decimals))
        const usd = quoteToUsd(amount, asset.symbol)
        totalBootstrapUsd += usd ?? 0 // the total sums the PRICED part; an unpriced asset shows "—" at the row
        bootstrapPools.push({
          asset: asset.address,
          symbol: asset.symbol,
          amount,
          usd,
        })
      }
    })

    // ---- Battles ----
    const battles: BattleView[] = []
    battleIds.forEach((id, i) => {
      const entry = battlesQuery.data?.[i]
      if (entry?.status !== 'success') return
      const b = entry.result as unknown as BattleTuple

      const bothZero =
        b.tokenA.toLowerCase() === ZERO_ADDRESS && b.tokenB.toLowerCase() === ZERO_ADDRESS
      const startTime = Number(b.startTime)
      if (bothZero || startTime === 0) return

      const endTime = startTime + BATTLE_DURATION
      const proposedAt = Number(b.proposedAt)
      const outcome = Number(b.outcome)
      const decimals = assetDecimalsFor(b.asset)
      // Fees tagged to an open battle that the pool hook still holds; finalizing sweeps them into the pot.
      const inHook = b.finalized ? 0n : (parked.battlePots.get(id) ?? 0n)
      const potNumber = Number(formatUnits(b.pot + inHook, decimals))
      const assetSymbol = assetSymbolFor(b.asset)
      const status = statusFor(now, startTime, endTime, outcome, b.finalized, proposedAt)

      const settlesAt = proposedAt > 0 ? proposedAt + BATTLE_CHALLENGE_PERIOD : 0
      const canFinalize = outcome !== 0 && !b.finalized && proposedAt > 0 && now >= settlesAt

      battles.push({
        id,
        asset: b.asset,
        assetSymbol,
        startTime,
        endTime,
        pot: potNumber,
        potUsd: quoteToUsd(potNumber, assetSymbol),
        outcome,
        finalized: b.finalized,
        status,
        winnerSide: winnerSideFor(outcome),
        tokenA: tokenInfoFor(b.tokenA),
        tokenB: tokenInfoFor(b.tokenB),
        unswept: Number(formatUnits(inHook, decimals)),
        proposedAt,
        settlesAt,
        canFinalize,
        settleOverdue: canFinalize && now >= settlesAt + SETTLE_GRACE,
      })
    })

    battles.sort((a, b) => {
      const ra = statusRank(a.status)
      const rb = statusRank(b.status)
      if (ra !== rb) return ra - rb
      if (ra === 1) return a.startTime - b.startTime
      if (ra === 3) return b.startTime - a.startTime
      return b.startTime - a.startTime
    })

    // ---- League weeks ----
    const perWeekPairs = weekList.length * 2
    const readLeague = <T,>(index: number): T | undefined => {
      const r = leagueQuery.data?.[index]
      return r && r.status === 'success' ? (r.result as unknown as T) : undefined
    }

    const weekViews: WeekView[] = weekList.map((week, wi) => {
      const endsAtRaw = readLeague<bigint>(wi * 2)
      const resultRaw = readLeague<WeekResultTuple>(wi * 2 + 1)

      const endsAt = endsAtRaw !== undefined ? Number(endsAtRaw) : weekEndsAt(week)
      const closed = resultRaw?.closed ?? false
      const proposedAt = resultRaw ? Number(resultRaw.proposedAt) : 0
      const finalizedAt = resultRaw ? Number(resultRaw.finalizedAt) : 0

      const pools: LeaguePoolEntry[] = []
      let totalUsd = 0
      assets.forEach((asset, ai) => {
        const poolIndex = perWeekPairs + wi * assets.length + ai
        const potRaw = (readLeague<bigint>(poolIndex) ?? 0n) + parkedLeague(week, asset.address)
        if (potRaw === 0n) return
        const amount = Number(formatUnits(potRaw, asset.decimals))
        if (amount <= 0) return
        const usd = quoteToUsd(amount, asset.symbol)
        totalUsd += usd ?? 0
        pools.push({ asset: asset.address, symbol: asset.symbol, amount, usd })
      })

      const winners: Address[] = []
      if (resultRaw) {
        resultRaw.winners.forEach(w => {
          if (w && w.toLowerCase() !== ZERO_ADDRESS) winners.push(w)
        })
      }

      const settlesAt = proposedAt > 0 ? proposedAt + LEAGUE_CHALLENGE_PERIOD : 0
      const canFinalize = proposedAt > 0 && finalizedAt === 0 && !closed && now >= settlesAt

      return {
        week,
        endsAt,
        closed,
        proposedAt,
        finalizedAt,
        pools,
        totalUsd,
        winners,
        settlesAt,
        canFinalize,
        settleOverdue: canFinalize && now >= settlesAt + SETTLE_GRACE,
      }
    })

    // If firstLeagueWeek === 0, the currentWeek uses bootstrapPools!
    let currentWeekView = weekViews.find(w => w.week === currentWeekNum) ?? null
    let totalPrizePoolUsd = 0

    if (firstLeagueWeek === 0 && currentWeekNum > 0) {
      currentWeekView = {
        week: currentWeekNum,
        endsAt: currentWeekView?.endsAt || weekEndsAt(currentWeekNum),
        closed: false,
        proposedAt: 0,
        finalizedAt: 0,
        pools: bootstrapPools,
        totalUsd: totalBootstrapUsd,
        winners: [],
        settlesAt: 0,
        canFinalize: false,
        settleOverdue: false,
      }
      totalPrizePoolUsd = totalBootstrapUsd
    } else if (currentWeekView) {
      totalPrizePoolUsd = currentWeekView.totalUsd
    }

    const pastWeeks = weekViews.filter(w => w.week !== currentWeekNum)

    // ---- Prizes the connected wallet can claim ----
    const userClaimable: UserClaimablePrize[] = []
    if (address && isConnected) {
      const byWeek = new Map<number, UserClaimablePrize>()
      claimSlots.forEach((slot, i) => {
        const raw = claimsQuery.data?.[i]
        if (raw?.status !== 'success') return
        const amount = Number(formatUnits(raw.result as bigint, slot.asset.decimals))
        if (amount <= 0) return
        let prize = byWeek.get(slot.week)
        if (!prize) {
          prize = {
            week: slot.week,
            rank: slot.rank,
            rankLabel: RANK_LABELS[slot.rank],
            sharePercent: prizeShares[slot.rank] ?? 0,
            assets: [],
            totalUsd: 0,
          }
          byWeek.set(slot.week, prize)
        }
        const usd = quoteToUsd(amount, slot.asset.symbol)
        prize.assets.push({ address: slot.asset.address, symbol: slot.asset.symbol, amount, usd })
        prize.totalUsd += usd ?? 0
      })
      userClaimable.push(...byWeek.values())
    }

    return {
      deployed: true,
      isLoading,
      battles,
      currentWeek: currentWeekView,
      pastWeeks,
      vaultAddress: vault,
      chainId,
      firstLeagueWeek,
      currentWeekNum,
      totalPrizePoolUsd,
      prizeShares,
      bootstrapPools,
      userClaimable,
      claimPrize,
      finalizeBattle,
      finalizeWeek,
      isPendingTx,
      refetch: refetchAll,
    }
  }, [
    enabled,
    chainId,
    vault,
    assets,
    projects,
    battleIds,
    weekList,
    currentWeekNum,
    firstLeagueWeek,
    nowSec,
    address,
    isConnected,
    isPendingTx,
    claimPrize,
    finalizeBattle,
    finalizeWeek,
    refetchAll,
    baseQuery.isLoading,
    baseQuery.data,
    battlesQuery.isLoading,
    battlesQuery.data,
    leagueQuery.isLoading,
    leagueQuery.data,
    claimSlots,
    claimsQuery.data,
    prizeShares,
    parked,
  ])
}

export { WEEK, BATTLE_DURATION, BATTLE_CHALLENGE_PERIOD, LEAGUE_CHALLENGE_PERIOD }

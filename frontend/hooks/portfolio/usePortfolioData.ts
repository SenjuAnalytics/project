'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAccount, useBalance, useChainId, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { formatUnits } from 'viem'
import { waitForTransactionReceipt } from '@wagmi/core'
import { wagmiConfig } from '@/lib/wagmi'
import { useToast } from '@/components/ui/Toast'
import { ALL_INITIAL_PROJECTS, RWA_PROJECTS, type Project } from '@/lib/data'
import { useQualyraTokens, useQualyraPositions } from '@/lib/useQualyraTokens'
import { useLivePrices, mergeProjectsWithLivePrices } from '@/lib/useLivePrices'
import { 
  getUserPositions, 
  getTradeFills, 
  getStoredProjects, 
  type UserPosition, 
  type TradeFill,
} from '@/lib/storage'
import { 
  qualyraDeployment, 
  qualyraFeeVaultAbi, 
  qualyraCompetitionVaultAbi, 
  isDeployed, 
  ROBINHOOD_PAIR_ASSETS, 
  NATIVE_PAIR_ASSET, 
  type Address 
} from '@/lib/contracts'
import { feeOverrides, describeTxError } from '@/lib/gas'
import { useParkedFees } from '@/hooks/useParkedFees'
import { openTxReceipt } from '@/components/shared/TxReceiptModal'
import { type PortfolioTabType } from '@/components/portfolio/PortfolioNavTabs'

/** Creator fees of one token, in whole units of its pair asset. */
export interface CreatorFeeInfo {
  /** What a withdrawal pays right now, the fees the pool hook still holds included. */
  raw: bigint
  formatted: number
  /** Part of `formatted` still in the pool hook. The withdrawal sweeps it first. */
  unswept: number
  /** Earned during a battle that is over but not settled yet. Credited when the battle settles. */
  atSettlement: number
}

const erc20Abi = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function usePortfolioData() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: balanceData } = useBalance({ address })
  const { toast } = useToast()
  const { writeContractAsync } = useWriteContract()

  const feeVaultAddress = qualyraDeployment(chainId)?.feeVault
  const competitionVaultAddress = qualyraDeployment(chainId)?.competitionVault

  // Real USDG balance on Robinhood Chain
  const { data: usdgBalanceData } = useReadContract({
    address: ROBINHOOD_PAIR_ASSETS.usdg,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && isConnected,
      refetchInterval: 15000,
    },
  })
  const usdgNumber = isConnected && usdgBalanceData !== undefined ? Number(formatUnits(usdgBalanceData as bigint, 6)) : 0

  // Real competition vault current week
  const { data: currentWeekData } = useReadContract({
    address: competitionVaultAddress,
    abi: qualyraCompetitionVaultAbi,
    functionName: 'currentWeek',
    query: {
      enabled: isDeployed(competitionVaultAddress),
    },
  })
  const currentWeekNumber = currentWeekData ? Number(currentWeekData) : 1

  const [activeTab, setActiveTab] = useState<PortfolioTabType>('positions')
  const [positions, setPositions] = useState<UserPosition[]>([])
  const [fills, setFills] = useState<TradeFill[]>([])
  const [projects, setProjects] = useState<Project[]>(ALL_INITIAL_PROJECTS)
  const { projects: chainProjects, isLive: chainLive } = useQualyraTokens()
  // Holdings come straight from onchain balanceOf across all Qualyra tokens
  const { positions: chainPositions } = useQualyraPositions(chainProjects)

  const { prices: livePrices } = useLivePrices(25000)

  useEffect(() => {
    const syncData = () => {
      try {
        if (chainLive) {
          setPositions(chainPositions)
        } else if (isConnected && typeof getUserPositions === 'function') {
          setPositions(getUserPositions())
        } else {
          setPositions([])
        }
        if (typeof getTradeFills === 'function') {
          setFills(getTradeFills())
        }
        if (chainLive) {
          setProjects([...chainProjects, ...RWA_PROJECTS])
        } else {
          const stored = getStoredProjects()
          const base = stored.length > 0 ? stored : ALL_INITIAL_PROJECTS
          setProjects(base)
        }
      } catch (err) {
        console.error('Failed to sync data in portfolio page:', err)
      }
    }

    syncData()

    window.addEventListener('qualyra:trade-executed', syncData)
    window.addEventListener('qualyra:projects-updated', syncData)
    window.addEventListener('storage', syncData)
    return () => {
      window.removeEventListener('qualyra:trade-executed', syncData)
      window.removeEventListener('qualyra:projects-updated', syncData)
      window.removeEventListener('storage', syncData)
    }
  }, [chainLive, chainProjects, chainPositions, isConnected])

  const mergedProjects = useMemo(() => {
    return livePrices && Object.keys(livePrices).length > 0
      ? mergeProjectsWithLivePrices(projects, livePrices)
      : projects
  }, [projects, livePrices])

  // Dynamic onchain values (using 100% real onchain numbers when connected)
  const liveEthPrice = livePrices?.['eth']?.price || 2402.0
  const ethNumber = isConnected && balanceData ? parseFloat(balanceData.formatted) : 0
  const ethValueUsd = ethNumber * liveEthPrice
  const posValueUsd = positions.reduce((acc, p) => {
    const matchProj = mergedProjects.find(proj => proj.id.toLowerCase() === p.id.toLowerCase())
    const quoteAsset = p.quoteAsset || matchProj?.quoteAsset || 'ETH'
    const rawPrice = p.price || matchProj?.price || 0
    const priceUsd = quoteAsset === 'USDG' ? rawPrice : rawPrice * liveEthPrice
    return acc + (p.balance || 0) * priceUsd
  }, 0)
  const totalNetWorth = isConnected ? usdgNumber + ethValueUsd + posValueUsd : 0

  // Creator's Launched Tokens (Only tokens genuinely created by the connected wallet)
  const creatorProjects = useMemo(() => {
    if (!address) return []
    const addr = address.toLowerCase()
    return mergedProjects.filter(p => {
      if (p.creatorAddress && p.creatorAddress.toLowerCase() === addr) return true
      if (p.creator && p.creator.toLowerCase() === addr) return true
      return false
    })
  }, [mergedProjects, address])

  // What the pool hook still holds for those tokens. A withdrawal sweeps it before paying out.
  const parked = useParkedFees(chainId, creatorProjects)
  const { refetch: refetchParked } = parked

  // Read real creator fee balances from QualyraFeeVault for each created token
  const feeBalancesQuery = useReadContracts({
    contracts: creatorProjects.map(p => ({
      address: feeVaultAddress,
      abi: qualyraFeeVaultAbi,
      functionName: 'creatorBalance' as const,
      args: [
        ((p.address || p.id) as Address),
        ((p.quoteAssetAddress || NATIVE_PAIR_ASSET) as Address),
      ] as const,
    })),
    query: {
      enabled: isConnected && isDeployed(feeVaultAddress) && creatorProjects.length > 0,
      refetchInterval: 12000,
    },
  })

  const creatorFeeMap = useMemo(() => {
    const map: Record<string, CreatorFeeInfo> = {}
    if (!feeBalancesQuery.data) return map
    creatorProjects.forEach((p, idx) => {
      const res = feeBalancesQuery.data?.[idx]
      const inVault = res?.status === 'success' ? (res.result as bigint) : 0n
      const held = parked.tokens.get((p.address || p.id).toLowerCase())
      const inHook = held?.creator ?? 0n
      const decimals = p.quoteAsset === 'USDG' ? 6 : 18
      map[p.id.toLowerCase()] = {
        raw: inVault + inHook,
        formatted: Number(formatUnits(inVault + inHook, decimals)),
        unswept: Number(formatUnits(inHook, decimals)),
        atSettlement: Number(formatUnits(held?.creatorAtSettlement ?? 0n, decimals)),
      }
    })
    return map
  }, [creatorProjects, feeBalancesQuery.data, parked.tokens])

  const totalClaimableFeesUsd = useMemo(() => {
    return creatorProjects.reduce((sum, p) => {
      const info = creatorFeeMap[p.id.toLowerCase()]
      if (!info || info.formatted <= 0) return sum
      if (p.quoteAsset === 'USDG') return sum + info.formatted
      return sum + info.formatted * liveEthPrice
    }, 0)
  }, [creatorProjects, creatorFeeMap, liveEthPrice])

  // Real onchain fee claiming state & handler
  const [claimingToken, setClaimingToken] = useState<string | null>(null)

  const handleClaimFees = useCallback(async (tokenAddress: string, quoteAssetAddress: string, quoteSymbol: string) => {
    if (!address || !isConnected) {
      toast.error('Wallet Not Connected', 'Please connect your wallet first.')
      return
    }
    if (!isDeployed(feeVaultAddress)) {
      toast.error('Network Error', 'Fee vault contract is not deployed on this network.')
      return
    }

    try {
      setClaimingToken(tokenAddress)
      const fees = await feeOverrides(chainId)
      const hash = await writeContractAsync({
        address: feeVaultAddress!,
        abi: qualyraFeeVaultAbi,
        functionName: 'withdrawCreatorFees',
        args: [tokenAddress as Address, quoteAssetAddress as Address],
        ...fees,
      })

      toast.info('Claim Submitted', `Transaction ${hash.slice(0, 10)}… is processing.`)
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
      if (receipt.status === 'reverted') {
        toast.error('Transaction Reverted', 'The chain rejected the fee claim.')
        return
      }

      toast.success('Fee Claimed Successfully', `Creator fees in ${quoteSymbol} claimed to your wallet!`)
      openTxReceipt({ txHash: hash, actionTitle: `Claim Creator Fees (${quoteSymbol})` })
      feeBalancesQuery.refetch()
      refetchParked()
    } catch (err) {
      const { title, detail } = describeTxError(err)
      toast.error(title, detail)
    } finally {
      setClaimingToken(null)
    }
  }, [address, isConnected, chainId, feeVaultAddress, writeContractAsync, toast, feeBalancesQuery, refetchParked])

  return {
    address,
    isConnected,
    chainId,
    activeTab,
    setActiveTab,
    positions,
    fills,
    projects: mergedProjects,
    usdgNumber,
    currentWeekNumber,
    liveEthPrice,
    ethNumber,
    ethValueUsd,
    posValueUsd,
    totalNetWorth,
    creatorProjects,
    creatorFeeMap,
    totalClaimableFeesUsd,
    claimingToken,
    handleClaimFees,
  }
}

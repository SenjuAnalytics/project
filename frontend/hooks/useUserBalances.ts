'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useBalance, useChainId } from 'wagmi'
import { getWalletBalances, INITIAL_WALLET_BALANCES, type WalletBalances } from '@/lib/storage'
import { robinhoodChain, robinhoodChainTestnet } from '@/lib/wagmi'

export interface UserBalancesState {
  balances: WalletBalances
  onchainEth: number | null
  effectiveEthBalance: number
  isLoadingOnchain: boolean
  formattedEthBalance: string
  refreshBalances: () => void
}

/**
 * Single source of truth for wallet balances across the entire dApp.
 * Seamlessly integrates live on-chain ETH (on supported Robinhood chains)
 * and simulated quote balances (USDG, NVDA, mock ETH) with automatic cross-tab synchronization.
 */
export function useUserBalances(): UserBalancesState {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { data: balanceData, isLoading: isLoadingOnchain, refetch: refetchOnchain } = useBalance({ address })

  const isSupportedChain = chainId === robinhoodChain.id || chainId === robinhoodChainTestnet.id

  const [balances, setBalances] = useState<WalletBalances>(() => {
    if (typeof window !== 'undefined') {
      try {
        return getWalletBalances()
      } catch {}
    }
    return INITIAL_WALLET_BALANCES
  })

  const refreshBalances = useCallback(() => {
    try {
      setBalances(getWalletBalances())
      if (isConnected && refetchOnchain) {
        refetchOnchain()
      }
    } catch (err) {
      console.error('[useUserBalances] Failed to refresh balances:', err)
    }
  }, [isConnected, refetchOnchain])

  useEffect(() => {
    if (isConnected && refetchOnchain) {
      refetchOnchain()
    }

    const handleUpdate = () => refreshBalances()
    window.addEventListener('qualyra:balances-updated', handleUpdate)
    window.addEventListener('qualyra:trade-executed', handleUpdate)
    window.addEventListener('storage', handleUpdate)

    return () => {
      window.removeEventListener('qualyra:balances-updated', handleUpdate)
      window.removeEventListener('qualyra:trade-executed', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [isConnected, refetchOnchain, refreshBalances])

  const onchainEth =
    isConnected && isSupportedChain && balanceData ? parseFloat(balanceData.formatted) : null

  const effectiveEthBalance = onchainEth !== null ? onchainEth : balances.eth

  const formattedEthBalance = `${effectiveEthBalance.toFixed(4)} ETH`

  return {
    balances,
    onchainEth,
    effectiveEthBalance,
    isLoadingOnchain,
    formattedEthBalance,
    refreshBalances,
  }
}

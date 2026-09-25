'use client'

import { useCallback } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { robinhoodChain, robinhoodChainTestnet } from '@/lib/wagmi'

export interface NetworkSwitchState {
  chainId: number
  isConnected: boolean
  isSupportedChain: boolean
  isWrongChain: boolean
  isSwitchingChain: boolean
  explorerBase: string
  switchToChain: (targetId?: number) => Promise<void>
  switchToRobinhoodChain: () => Promise<void>
}

/**
 * Single source of truth for network checking and switching across the entire dApp.
 * Handles EIP-3085 wallet_addEthereumChain automatically if the chain is unrecognized.
 */
export function useNetworkSwitch(): NetworkSwitchState {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync, isPending: isSwitchingChain } = useSwitchChain()

  const isSupportedChain = chainId === robinhoodChain.id || chainId === robinhoodChainTestnet.id
  const isWrongChain = isConnected && !isSupportedChain

  const explorerBase =
    chainId === robinhoodChainTestnet.id
      ? (robinhoodChainTestnet.blockExplorers?.default.url || 'https://explorer.testnet.chain.robinhood.com')
      : (robinhoodChain.blockExplorers?.default.url || 'https://robinhoodchain.blockscout.com')

  const switchToChain = useCallback(
    async (targetId: number = robinhoodChain.id) => {
      try {
        if (switchChainAsync) {
          await switchChainAsync({ chainId: targetId })
        }
      } catch (err: unknown) {
        const errCode = (err as { code?: number })?.code
        const isUnrecognized =
          errCode === 4902 ||
          String(err).includes('4902') ||
          String(err).toLowerCase().includes('unrecognized')

        const eth = typeof window !== 'undefined' ? (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum : undefined
        if (isUnrecognized && eth) {
          try {
            const isTestnet = targetId === robinhoodChainTestnet.id
            const targetChain = isTestnet ? robinhoodChainTestnet : robinhoodChain
            const hexChainId = `0x${targetId.toString(16)}`

            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [
                {
                  chainId: hexChainId,
                  chainName: targetChain.name,
                  nativeCurrency: targetChain.nativeCurrency,
                  rpcUrls: targetChain.rpcUrls.default.http,
                  blockExplorerUrls: [targetChain.blockExplorers?.default.url],
                },
              ],
            })
          } catch (addErr) {
            console.error('[useNetworkSwitch] Failed to add chain via EIP-3085:', addErr)
          }
        } else {
          console.error('[useNetworkSwitch] Failed to switch network:', err)
        }
      }
    },
    [switchChainAsync],
  )

  const switchToRobinhoodChain = useCallback(() => switchToChain(robinhoodChain.id), [switchToChain])

  return {
    chainId,
    isConnected,
    isSupportedChain,
    isWrongChain,
    isSwitchingChain,
    explorerBase,
    switchToChain,
    switchToRobinhoodChain,
  }
}

'use client'

import React, { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { AlertTriangle, ArrowRight, X, Check } from 'lucide-react'

export function NetworkAlertBanner() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChainAsync, isPending } = useSwitchChain()
  const [dismissed, setDismissed] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [success, setSuccess] = useState(false)

  // Robinhood Chain Mainnet (4663) & Testnet (46630)
  const isSupported = chainId === 4663 || chainId === 46630

  if (!isConnected || isSupported || dismissed) {
    return null
  }

  const handleAddChain = async () => {
    const eth = typeof window !== 'undefined' ? (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum : undefined
    if (eth) {
      try {
        setIsAdding(true)
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: '0xb626', // 46630 in hex
              chainName: 'Robinhood Chain Testnet',
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
              rpcUrls: [
                typeof window !== 'undefined'
                  ? `${window.location.origin}/api/rpc?chainId=46630`
                  : 'https://rpc.testnet.chain.robinhood.com',
              ],
              blockExplorerUrls: ['https://explorer.testnet.chain.robinhood.com'],
            },
          ],
        })
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      } catch (addErr) {
        console.error('Failed to add Robinhood Chain Testnet to wallet:', addErr)
      } finally {
        setIsAdding(false)
      }
    }
  }

  const handleSwitch = async () => {
    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: 46630 })
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
      }
    } catch (err: unknown) {
      const errorObj = err as { code?: number; message?: string }
      // 4902 indicates chain not yet configured in wallet, trigger EIP-3085 add
      if (errorObj?.code === 4902 || String(err).includes('4902') || String(err).toLowerCase().includes('unrecognized')) {
        await handleAddChain()
      } else {
        console.error('Failed to switch chain:', err)
      }
    }
  }

  return (
    <div
      style={{
        background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.16) 0%, rgba(239, 68, 68, 0.14) 100%)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.35)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '12.5px',
        color: 'var(--tx)',
        position: 'relative',
        zIndex: 60,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'rgba(245, 158, 11, 0.25)',
            color: '#F59E0B',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={14} strokeWidth={2.4} />
        </div>
        <div>
          <span style={{ fontWeight: 700, color: '#F59E0B', marginRight: '6px' }}>
            Unsupported Network:
          </span>
          <span style={{ color: 'var(--mt)' }}>
            Connected to Chain ID <b className="mono">{chainId || 'Unknown'}</b>. Switch to{' '}
            <b style={{ color: 'var(--tx)' }}>Robinhood Chain Testnet (ID: 46630)</b> for live smart contract interaction and balance synchronization.
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={handleSwitch}
          disabled={isPending || isAdding}
          style={{
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            color: '#000000',
            border: 'none',
            borderRadius: '6px',
            padding: '5px 12px',
            fontSize: '11.5px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: '0 2px 6px rgba(245, 158, 11, 0.3)',
            transition: 'opacity 0.15s ease',
          }}
        >
          {success ? (
            <>
              <Check size={12} strokeWidth={2.8} />
              <span>Switched</span>
            </>
          ) : (
            <>
              <span>{isPending || isAdding ? 'Connecting...' : 'Switch to Robinhood Testnet'}</span>
              <ArrowRight size={12} strokeWidth={2.5} />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleAddChain}
          disabled={isAdding}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            color: 'var(--tx)',
            border: '1px solid var(--line2)',
            borderRadius: '6px',
            padding: '5px 10px',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          title="Add Robinhood Chain parameters to MetaMask / Rabby via EIP-3085"
        >
          {isAdding ? 'Adding RPC...' : 'Add to Wallet (EIP-3085)'}
        </button>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--dim)',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            marginLeft: '4px',
          }}
          title="Dismiss banner"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

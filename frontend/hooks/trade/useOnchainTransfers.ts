'use client'

import { useEffect, useState } from 'react'
import type { TokenTransferItem } from '@/lib/trade/types'

const TRANSFERS_POLL_MS = 10000

/**
 * Recent transfers for a pair, from the Robinhood Chain event stream via /api/transfers.
 * Polls every ten seconds while `enabled` is true and stops as soon as it is not.
 */
export function useOnchainTransfers(pairId: string, enabled: boolean, chainId?: number) {
  const [onchainTransfers, setOnchainTransfers] = useState<TokenTransferItem[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState<boolean>(false)

  useEffect(() => {
    let isCancelled = false
    const loadTransfers = async () => {
      try {
        setLoadingTransfers(true)
        const qs = new URLSearchParams({ pair: pairId })
        if (chainId) qs.set('chainId', String(chainId))
        const res = await fetch(`/api/transfers?${qs.toString()}`)
        if (!res.ok) return
        const data = await res.json()
        if (!isCancelled && data.success && Array.isArray(data.transfers)) {
          setOnchainTransfers(data.transfers)
        }
      } catch (err) {
        console.warn('[Transfers Fetch Error]:', err)
      } finally {
        if (!isCancelled) setLoadingTransfers(false)
      }
    }

    if (enabled && pairId) {
      loadTransfers()
      const timer = setInterval(loadTransfers, TRANSFERS_POLL_MS)
      return () => {
        isCancelled = true
        clearInterval(timer)
      }
    }
    return () => { isCancelled = true }
  }, [enabled, pairId, chainId])

  return { onchainTransfers, loadingTransfers }
}

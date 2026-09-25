'use client'

import { useEffect, useState } from 'react'
import type { TokenHolderItem } from '@/lib/trade/types'

/**
 * Top holders for a pair, from Blockscout & onchain fallback via /api/holders.
 * Only fetches while `enabled` is true, or on pair change.
 */
export function useOnchainHolders(pairId: string, enabled: boolean = true, chainId?: number) {
  const [onchainHolders, setOnchainHolders] = useState<TokenHolderItem[]>([])
  const [totalHoldersCount, setTotalHoldersCount] = useState<number>(0)
  const [loadingHolders, setLoadingHolders] = useState<boolean>(false)

  useEffect(() => {
    let isCancelled = false
    const loadHolders = async () => {
      try {
        setLoadingHolders(true)
        const qs = new URLSearchParams({ pair: pairId })
        if (chainId) qs.set('chainId', String(chainId))
        const res = await fetch(`/api/holders?${qs.toString()}`)
        if (!res.ok) return
        const data = await res.json()
        if (!isCancelled && data.success && Array.isArray(data.holders)) {
          setOnchainHolders(data.holders)
          setTotalHoldersCount(data.totalHolders || data.holders.length)
        }
      } catch (err) {
        console.warn('[Holders Fetch Error]:', err)
      } finally {
        if (!isCancelled) setLoadingHolders(false)
      }
    }

    if (enabled && pairId) {
      loadHolders()
    }
    return () => { isCancelled = true }
  }, [enabled, pairId, chainId])

  return { onchainHolders, totalHoldersCount, loadingHolders }
}

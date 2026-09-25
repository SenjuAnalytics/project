'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useBlockNumber } from 'wagmi'
import type { LivePriceItem } from '@/app/api/prices/route'
import type { Project } from '@/lib/data'

/**
 * A block seen no more often than this triggers a price read.
 *
 * `/api/prices` aggregates every market in one call, so a refetch per block would hammer it on a fast
 * chain for numbers that have not moved. Coalescing to one read per window keeps the screen live —
 * a trade lands within a block or two — without turning every block into a request.
 */
const MIN_REFRESH_MS = 4000


export type { LivePriceItem }

export function mergeProjectsWithLivePrices(
  projects: Project[],
  livePrices: Record<string, LivePriceItem>
): Project[] {
  if (!livePrices || Object.keys(livePrices).length === 0) return projects

  // Referential stability matters here: this runs on every price poll (every few seconds), and the
  // result feeds React state. Returning a fresh array/object every time — even when no number moved —
  // makes the whole trade page and its chart re-render on each idle poll, which reads as a flicker.
  // So we only allocate a new object for a row whose values actually changed, and a new array only if
  // at least one row changed; otherwise we hand back the exact same references and React does nothing.
  let changed = false
  const next = projects.map(p => {
    // A Qualyra token is identified by its address, and its price comes from its own curve or pool. Never
    // let an external feed near it: a launch is free to use a symbol that already means something else.
    if (/^0x[0-9a-fA-F]{40}$/.test(p.id)) return p

    const key = p.id.toLowerCase()
    const tickKey = p.tick.toLowerCase()
    const cleanTickKey = tickKey.replace(/^r/, '')
    const live = livePrices[key] || livePrices[tickKey] || livePrices[cleanTickKey]
    if (!live) return p

    const merged = {
      ...p,
      price: live.price,
      chg: live.chg24,
      vol24: live.vol24 || p.vol24,
      mcap: live.mcap || p.mcap,
      liquidity: live.liquidity || p.liquidity,
      pooledBase: live.pooledBase !== undefined ? live.pooledBase : p.pooledBase,
      pooledQuote: live.pooledQuote !== undefined ? live.pooledQuote : p.pooledQuote,
      pooledQuoteSymbol: live.pooledQuoteSymbol || p.pooledQuoteSymbol,
      hi: Math.max(p.hi || live.price, live.price),
      lo: Math.min(p.lo || live.price, live.price),
    }

    // Nothing moved for this row — keep the existing object so its identity is stable.
    if (
      merged.price === p.price &&
      merged.chg === p.chg &&
      merged.vol24 === p.vol24 &&
      merged.mcap === p.mcap &&
      merged.liquidity === p.liquidity &&
      merged.pooledBase === p.pooledBase &&
      merged.pooledQuote === p.pooledQuote &&
      merged.pooledQuoteSymbol === p.pooledQuoteSymbol &&
      merged.hi === p.hi &&
      merged.lo === p.lo
    ) {
      return p
    }

    changed = true
    return merged
  })

  return changed ? next : projects
}

export function useLivePrices(pollingIntervalMs = 25000) {
  const [prices, setPrices] = useState<Record<string, LivePriceItem>>({})
  const [priceTrends, setPriceTrends] = useState<Record<string, 'up' | 'down' | null>>({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number>(0)
  const prevPricesRef = useRef<Record<string, number>>({})
  // Consecutive failures. A background poll that misses once is not worth a console entry: in dev the
  // first fetch regularly lands before the route has compiled, which looked like a broken app but
  // corrects itself on the next tick. Only a run of failures means something is actually wrong.
  const failuresRef = useRef(0)

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch('/api/prices')
      if (!res.ok) return
      failuresRef.current = 0
      const data = await res.json()

      if (data.success && data.prices) {
        const newPrices: Record<string, LivePriceItem> = data.prices
        const newTrends: Record<string, 'up' | 'down' | null> = {}

        for (const [id, item] of Object.entries(newPrices)) {
          const prev = prevPricesRef.current[id]
          // Only flash the up/down tint on a move big enough to be a real tick. Sub-tick jitter from
          // rounding or aggregation would otherwise blink the colour every idle poll even when the price
          // is effectively flat. A 0.05% threshold keeps genuine moves lit without the noise.
          if (prev !== undefined && prev > 0) {
            const delta = Math.abs(item.price - prev) / prev
            if (delta > 0.0005) {
              newTrends[id] = item.price > prev ? 'up' : 'down'
            }
          }
          prevPricesRef.current[id] = item.price
        }

        setPrices(newPrices)
        setPriceTrends(newTrends)
        setLastUpdated(data.timestamp || Date.now())

        // Reset trends animation after 3 seconds
        if (Object.keys(newTrends).length > 0) {
          setTimeout(() => {
            setPriceTrends({})
          }, 3000)
        }
      }
    } catch (err) {
      failuresRef.current += 1
      if (failuresRef.current === 3) {
        console.warn('[useLivePrices] Price sync has failed three times in a row:', err)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const load = async () => {
      if (!isCancelled) {
        await fetchPrices()
      }
    }
    void load()
    const timer = setInterval(load, pollingIntervalMs)
    return () => {
      isCancelled = true
      clearInterval(timer)
    }
  }, [fetchPrices, pollingIntervalMs])

  // Live updates, driven by the chain rather than the clock.
  //
  // A price only moves when a trade lands, and a trade always lands in a block. With a WebSocket
  // configured, `watch` is pushed each new head — so reading prices on a fresh block is how a fill reaches
  // the screen in a second or two instead of waiting for the next poll. Without a socket this simply falls
  // back to the poll above. The block is thrown away; it is only a signal that something may have changed.
  const { data: blockNumber } = useBlockNumber({ watch: true })
  const lastRefreshRef = useRef(0)
  useEffect(() => {
    if (blockNumber === undefined) return
    const now = Date.now()
    // Coalesce bursts: one read per window, no matter how fast blocks arrive.
    if (now - lastRefreshRef.current < MIN_REFRESH_MS) return
    lastRefreshRef.current = now
    fetchPrices()
  }, [blockNumber, fetchPrices])

  const mergeProjects = useCallback(
    (projs: Project[]) => mergeProjectsWithLivePrices(projs, prices),
    [prices]
  )

  return {
    prices,
    priceTrends,
    loading,
    lastUpdated,
    refresh: fetchPrices,
    mergeProjects,
  }
}


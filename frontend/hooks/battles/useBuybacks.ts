'use client'

// What each battle's pot has bought and burned so far, from the burner's events. The vault only knows the
// pot; the spending happens in tranches afterwards and is only visible here.

import { useCallback, useEffect, useState } from 'react'
import { useChainId, useWatchContractEvent } from 'wagmi'
import { getPublicClient } from '@wagmi/core'
import { formatUnits, type Address } from 'viem'

import { wagmiConfig } from '@/lib/wagmi'
import { qualyraBuybackBurnerAbi, qualyraDeployment, isDeployed, resolveTargetChainId } from '@/lib/contracts'
import { startBlock } from '@/lib/useTokenTrades'

export type BuybackBurn = {
  token: Address
  /** Tokens burned, in whole units. */
  burned: number
  tranches: number
}

/** Scanned instead when the RPC refuses the range from the deploy block. */
const RECENT_BLOCKS = 350_000n

/** Battle id to one entry per token bought back. A draw or a void has two. */
export function useBuybacks(): Map<number, BuybackBurn[]> {
  const chainId = resolveTargetChainId(useChainId())
  const burner = qualyraDeployment(chainId)?.buybackBurner
  const enabled = isDeployed(burner)

  const [burns, setBurns] = useState<Map<number, BuybackBurn[]>>(() => new Map())
  const [nonce, setNonce] = useState(0)
  const refresh = useCallback(() => setNonce(n => n + 1), [])

  useWatchContractEvent({
    address: burner,
    chainId,
    abi: qualyraBuybackBurnerAbi,
    eventName: 'BuybackExecuted',
    enabled,
    onLogs: refresh,
  })

  useEffect(() => {
    if (!enabled || !burner) return
    let cancelled = false

    ;(async () => {
      try {
        const client = getPublicClient(wagmiConfig, { chainId: chainId as (typeof wagmiConfig)['chains'][number]['id'] })
        if (!client) return
        const latest = await client.getBlockNumber()
        const read = (fromBlock: bigint) =>
          client.getContractEvents({
            address: burner,
            abi: qualyraBuybackBurnerAbi,
            eventName: 'BuybackExecuted',
            fromBlock,
            toBlock: latest,
          })

        let logs: Awaited<ReturnType<typeof read>>
        try {
          logs = await read(startBlock())
        } catch {
          logs = await read(latest > RECENT_BLOCKS ? latest - RECENT_BLOCKS : 0n)
        }

        const next = new Map<number, BuybackBurn[]>()
        for (const log of logs) {
          const { battleId, token, burned } = log.args
          if (battleId === undefined || !token || burned === undefined) continue
          const id = Number(battleId)
          const list = next.get(id) ?? []
          let entry = list.find(e => e.token.toLowerCase() === token.toLowerCase())
          if (!entry) {
            entry = { token, burned: 0, tranches: 0 }
            list.push(entry)
          }
          entry.burned += Number(formatUnits(burned, 18))
          entry.tranches += 1
          next.set(id, list)
        }
        if (!cancelled) setBurns(next)
      } catch {
        // Keep the last good read; the next event or visit tries again.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, burner, chainId, nonce])

  return burns
}

'use client'

// Recent platform activity for the ticker, read from the chain.
//
// Launches come from the factory's registry, fills from the bonding curves, graduations from the factory,
// battles from the competition vault and burns from the buyback burner. Nothing is generated: a quiet
// chain gives a short list and an empty one hides the ticker. Swaps in graduated pools aren't listed yet.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChainId, useReadContract, useReadContracts, useWatchContractEvent } from 'wagmi'
import { getPublicClient } from '@wagmi/core'
import { erc20Abi, formatUnits, type Address } from 'viem'

import { wagmiConfig } from './wagmi'
import {
  qualyraBondingCurveAbi,
  qualyraBuybackBurnerAbi,
  qualyraCompetitionVaultAbi,
  qualyraFactoryAbi,
  qualyraDeployment,
  isDeployed,
  resolveTargetChainId,
  NATIVE_PAIR_ASSET,
} from './contracts'
import { formatCryptoAmount, formatTokenAmount } from './formatters'
import { usePairAssets } from './usePairAssets'
import { startBlock } from './useTokenTrades'

export type ActivityKind = 'launch' | 'buy' | 'sell' | 'graduate' | 'battle' | 'burn'

export type ActivityItem = {
  /** Tx hash and log index, or the token address for a launch. */
  id: string
  kind: ActivityKind
  title: string
  detail?: string
  link: string
  /** Unix seconds. */
  timestamp: number
}

type Quote = { symbol: string; decimals: number }
type TokenInfo = { token: Address; symbol: string; quote?: Quote }

/** The ticker loops whatever it has, so a short list is enough. */
const FEED_SIZE = 20

/** Scanned instead when the RPC refuses the range from the deploy block. Roughly a day of blocks. */
const RECENT_BLOCKS = 350_000n

/** Only matters if the socket drops; the watchers below normally trigger the reload. */
const FALLBACK_MS = 60_000

/** A launch with a first buy fires several events at once. One reload covers them. */
const DEBOUNCE_MS = 1_500

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 })
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
const tradeLink = (token: string) => `/trade?pair=${token.toLowerCase()}`

function tokenAmount(raw: bigint): string {
  const n = Number(formatUnits(raw, 18))
  return n >= 1000 ? compact.format(n) : formatTokenAmount(n)
}

function quoteAmount(raw: bigint, quote?: Quote): string | undefined {
  return quote ? formatCryptoAmount(Number(formatUnits(raw, quote.decimals)), quote.symbol) : undefined
}

/** Mirrors QualyraCompetitionVault.Outcome. */
function outcomeText(outcome: number, a: string, b: string): string {
  switch (outcome) {
    case 1: return `$${a} won`
    case 2: return `$${b} won`
    case 3: return 'draw'
    case 4: return `$${a} disqualified`
    case 5: return `$${b} disqualified`
    case 6: return 'void'
    default: return 'finalized'
  }
}

export function useActivityFeed(): { items: ActivityItem[]; isLoading: boolean } {
  const chainId = resolveTargetChainId(useChainId())
  const deployment = qualyraDeployment(chainId)
  const factory = deployment?.factory
  const vault = deployment?.competitionVault
  const burner = deployment?.buybackBurner
  const live = isDeployed(factory)
  const hasVault = isDeployed(vault)
  const hasBurner = isDeployed(burner)
  const { assets: pairAssets } = usePairAssets()

  // Registry: same reads as useQualyraTokens, so react-query shares them, minus the price polling.
  const { data: countData, refetch: refetchCount } = useReadContract({
    address: factory,
    chainId,
    abi: qualyraFactoryAbi,
    functionName: 'tokenCount',
    query: { enabled: live },
  })
  const count = countData === undefined ? 0 : Number(countData)

  const addressQuery = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: factory,
      chainId,
      abi: qualyraFactoryAbi,
      functionName: 'tokenAt' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: live && count > 0 },
  })

  const tokenList = useMemo(
    () =>
      (addressQuery.data ?? [])
        .map(r => (r.status === 'success' ? (r.result as Address) : undefined))
        .filter((a): a is Address => !!a),
    [addressQuery.data],
  )

  const detailQuery = useReadContracts({
    contracts: tokenList.flatMap(token => [
      { address: factory, chainId, abi: qualyraFactoryAbi, functionName: 'getLaunch' as const, args: [token] as const },
      { address: token, chainId, abi: erc20Abi, functionName: 'symbol' as const },
    ]),
    query: { enabled: tokenList.length > 0 },
  })

  const registry = useMemo(() => {
    const quoteOf = (asset: Address): Quote | undefined => {
      if (asset === NATIVE_PAIR_ASSET) return { symbol: 'ETH', decimals: 18 }
      const listed = pairAssets.find(p => p.address.toLowerCase() === asset.toLowerCase())
      return listed ? { symbol: listed.symbol, decimals: listed.decimals } : undefined
    }

    const byToken = new Map<string, TokenInfo>()
    const byCurve = new Map<string, TokenInfo>()
    const launches: ActivityItem[] = []

    tokenList.forEach((token, i) => {
      const launch = detailQuery.data?.[i * 2]
      const symbolResult = detailQuery.data?.[i * 2 + 1]
      if (launch?.status !== 'success') return
      const { curve, quoteAsset, launchedAt } = launch.result as {
        curve: Address
        quoteAsset: Address
        launchedAt: bigint
      }
      const info: TokenInfo = {
        token,
        symbol: symbolResult?.status === 'success' ? String(symbolResult.result) : short(token),
        quote: quoteOf(quoteAsset),
      }
      byToken.set(token.toLowerCase(), info)
      byCurve.set(curve.toLowerCase(), info)
      launches.push({
        id: `launch-${token}`,
        kind: 'launch',
        title: `$${info.symbol} launched`,
        detail: info.quote ? `${info.quote.symbol} pair` : undefined,
        link: tradeLink(token),
        timestamp: Number(launchedAt),
      })
    })

    const curves = [...byCurve.keys()] as Address[]
    return { byToken, byCurve, curves, launches }
  }, [tokenList, detailQuery.data, pairAssets])

  const [items, setItems] = useState<ActivityItem[]>([])
  const [isLoading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scheduleReload = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setNonce(n => n + 1), DEBOUNCE_MS)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    const id = setInterval(() => setNonce(n => n + 1), FALLBACK_MS)
    return () => clearInterval(id)
  }, [])

  const onFactoryLogs = useCallback(() => {
    refetchCount()
    scheduleReload()
  }, [refetchCount, scheduleReload])

  useWatchContractEvent({ address: factory, chainId, abi: qualyraFactoryAbi, enabled: live, onLogs: onFactoryLogs })
  useWatchContractEvent({
    address: registry.curves,
    chainId,
    abi: qualyraBondingCurveAbi,
    enabled: registry.curves.length > 0,
    onLogs: scheduleReload,
  })
  useWatchContractEvent({ address: vault, chainId, abi: qualyraCompetitionVaultAbi, enabled: hasVault, onLogs: scheduleReload })
  useWatchContractEvent({ address: burner, chainId, abi: qualyraBuybackBurnerAbi, enabled: hasBurner, onLogs: scheduleReload })

  useEffect(() => {
    if (!live || !factory) return
    let cancelled = false

    ;(async () => {
      try {
        const client = getPublicClient(wagmiConfig, { chainId: chainId as 4663 | 46630 })
        if (!client) return
        const latest = await client.getBlockNumber()
        const { byToken, byCurve, curves, launches } = registry

        const scan = (fromBlock: bigint) => {
          const range = { fromBlock, toBlock: latest }
          return Promise.all([
            curves.length > 0
              ? client.getContractEvents({ address: curves, abi: qualyraBondingCurveAbi, eventName: 'Bought', ...range })
              : Promise.resolve([]),
            curves.length > 0
              ? client.getContractEvents({ address: curves, abi: qualyraBondingCurveAbi, eventName: 'Sold', ...range })
              : Promise.resolve([]),
            client.getContractEvents({ address: factory, abi: qualyraFactoryAbi, eventName: 'TokenGraduated', ...range }),
            hasVault && vault
              ? client.getContractEvents({ address: vault, abi: qualyraCompetitionVaultAbi, eventName: 'BattleScheduled', ...range })
              : Promise.resolve([]),
            hasVault && vault
              ? client.getContractEvents({ address: vault, abi: qualyraCompetitionVaultAbi, eventName: 'BattleFinalized', ...range })
              : Promise.resolve([]),
            hasBurner && burner
              ? client.getContractEvents({ address: burner, abi: qualyraBuybackBurnerAbi, eventName: 'BuybackExecuted', ...range })
              : Promise.resolve([]),
          ])
        }

        let logs: Awaited<ReturnType<typeof scan>>
        try {
          logs = await scan(startBlock())
        } catch {
          // Most RPCs cap the range of a log query. The recent window is enough for a ticker.
          logs = await scan(latest > RECENT_BLOCKS ? latest - RECENT_BLOCKS : 0n)
        }
        const [bought, sold, graduated, scheduled, finalized, burns] = logs

        const battles = new Map<string, { a: string; b: string; quote?: Quote }>()
        for (const log of scheduled) {
          const { battleId, tokenA, tokenB } = log.args
          if (battleId === undefined || !tokenA || !tokenB) continue
          const a = byToken.get(tokenA.toLowerCase())
          const b = byToken.get(tokenB.toLowerCase())
          battles.set(battleId.toString(), {
            a: a?.symbol ?? short(tokenA),
            b: b?.symbol ?? short(tokenB),
            quote: a?.quote,
          })
        }

        type Pending = {
          id: string
          blockNumber: bigint
          logIndex: number
          build: (timestamp: number) => ActivityItem | null
        }
        const pending: Pending[] = []
        const at = (log: { transactionHash: `0x${string}` | null; logIndex: number | null; blockNumber: bigint | null }) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          blockNumber: log.blockNumber ?? 0n,
          logIndex: log.logIndex ?? 0,
        })

        for (const log of bought) {
          const info = byCurve.get(log.address.toLowerCase())
          const { recipient, amountIn, tokensOut } = log.args
          if (!info || !recipient || amountIn === undefined || tokensOut === undefined) continue
          pending.push({
            ...at(log),
            build: timestamp => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              kind: 'buy',
              title: `${short(recipient)} bought ${tokenAmount(tokensOut)} $${info.symbol}`,
              detail: quoteAmount(amountIn, info.quote),
              link: tradeLink(info.token),
              timestamp,
            }),
          })
        }

        for (const log of sold) {
          const info = byCurve.get(log.address.toLowerCase())
          const { recipient, tokensIn, amountOut } = log.args
          if (!info || !recipient || tokensIn === undefined || amountOut === undefined) continue
          pending.push({
            ...at(log),
            build: timestamp => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              kind: 'sell',
              title: `${short(recipient)} sold ${tokenAmount(tokensIn)} $${info.symbol}`,
              detail: quoteAmount(amountOut, info.quote),
              link: tradeLink(info.token),
              timestamp,
            }),
          })
        }

        for (const log of graduated) {
          const { token } = log.args
          if (!token) continue
          const symbol = byToken.get(token.toLowerCase())?.symbol ?? short(token)
          pending.push({
            ...at(log),
            build: timestamp => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              kind: 'graduate',
              title: `$${symbol} graduated`,
              detail: 'liquidity locked',
              link: tradeLink(token),
              timestamp,
            }),
          })
        }

        for (const log of scheduled) {
          const { battleId } = log.args
          const battle = battleId === undefined ? undefined : battles.get(battleId.toString())
          if (battleId === undefined || !battle) continue
          pending.push({
            ...at(log),
            build: timestamp => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              kind: 'battle',
              title: `Battle #${battleId}: $${battle.a} vs $${battle.b}`,
              detail: 'scheduled',
              link: '/battles',
              timestamp,
            }),
          })
        }

        for (const log of finalized) {
          const { battleId, outcome, pot } = log.args
          if (battleId === undefined || outcome === undefined) continue
          const battle = battles.get(battleId.toString())
          pending.push({
            ...at(log),
            build: timestamp => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              kind: 'battle',
              title: battle
                ? `Battle #${battleId}: ${outcomeText(outcome, battle.a, battle.b)}`
                : `Battle #${battleId} finalized`,
              detail: pot !== undefined && battle?.quote ? `pot ${quoteAmount(pot, battle.quote)}` : undefined,
              link: '/battles',
              timestamp,
            }),
          })
        }

        for (const log of burns) {
          const { battleId, token, burned } = log.args
          if (!token || burned === undefined) continue
          const symbol = byToken.get(token.toLowerCase())?.symbol ?? short(token)
          pending.push({
            ...at(log),
            build: timestamp => ({
              id: `${log.transactionHash}-${log.logIndex}`,
              kind: 'burn',
              title: `Burned ${tokenAmount(burned)} $${symbol}`,
              detail: battleId === undefined ? 'buyback' : `buyback, battle #${battleId}`,
              link: tradeLink(token),
              timestamp,
            }),
          })
        }

        // Newest first. Only the ones that can make the cut need a block timestamp.
        pending.sort((x, y) =>
          x.blockNumber === y.blockNumber ? y.logIndex - x.logIndex : x.blockNumber > y.blockNumber ? -1 : 1,
        )
        const newest = pending.slice(0, FEED_SIZE)
        const blockTimes = new Map<bigint, number>()
        await Promise.all(
          [...new Set(newest.map(p => p.blockNumber))].map(async blockNumber => {
            try {
              const block = await client.getBlock({ blockNumber })
              blockTimes.set(blockNumber, Number(block.timestamp))
            } catch {
              // Left out below rather than shown with a made-up time.
            }
          }),
        )

        const fromLogs = newest
          .map(p => {
            const timestamp = blockTimes.get(p.blockNumber)
            return timestamp === undefined ? null : p.build(timestamp)
          })
          .filter((item): item is ActivityItem => item !== null)

        // Logs first so that, at equal times, a launch's first buy sorts ahead of the launch itself.
        const merged = [...fromLogs, ...launches].sort((x, y) => y.timestamp - x.timestamp).slice(0, FEED_SIZE)
        if (!cancelled) setItems(merged)
      } catch {
        // Keep what is on screen. The next event or the fallback timer tries again.
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [live, factory, vault, burner, hasVault, hasBurner, chainId, registry, nonce])

  return { items: live ? items : [], isLoading: live && isLoading }
}

'use client'

// Trade history and price for one token, read from chain events.
//
// A token's life spans two venues, so the history does too. Before graduation every fill is a `Bought` or
// `Sold` on its bonding curve, which carries the amounts and the fees. After graduation the fills are `Swap`
// events on the Uniswap v4 PoolManager for that pool, which carry the price directly as sqrtPriceX96.
//
// Both are read with getLogs. No indexer, and no invented numbers: an empty history means the token has not
// traded yet, which is exactly what a fresh launch looks like.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChainId, useReadContract, useWatchContractEvent } from 'wagmi'
import { getPublicClient } from '@wagmi/core'
import { encodeAbiParameters, formatUnits, keccak256, parseAbiItem, type Address } from 'viem'

import { wagmiConfig } from './wagmi'
import { qualyraBondingCurveAbi, qualyraHookAbi, qualyraDeployment, isDeployed, resolveTargetChainId, NATIVE_PAIR_ASSET, NOT_DEPLOYED } from './contracts'

export type TokenTrade = {
  side: 'BUY' | 'SELL'
  /** Price of one whole token, in the pair asset. */
  price: number
  /** Tokens moved. */
  amount: number
  /** Pair asset moved. */
  quoteAmount: number
  timestamp: number
  txHash: `0x${string}`
  trader: Address
  /** Where this trade occurred: bonding curve or Uniswap v4 pool. */
  source?: 'curve' | 'pool'
}

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }

/** What one wallet holds in a token and what it paid on average. */
export type CostBasis = { amount: number; entry: number }

/**
 * Average cost basis for one wallet, from its own fills in order.
 *
 * Average-cost rather than FIFO: a sale reduces the position and the money tied up in it in the same
 * proportion, leaving the average price of what remains unchanged. That is the number a chart's entry
 * line should carry — where the holding sits relative to the candles — and it is the convention every
 * exchange shows as "avg entry".
 *
 * Prices here are the ones the candles are drawn from, so the line lands where the fills appear rather
 * than a fee's distance above them.
 */
export function costBasisFor(trades: TokenTrade[], wallet?: Address): CostBasis {
  if (!wallet) return { amount: 0, entry: 0 }
  const owner = wallet.toLowerCase()

  let amount = 0
  let spent = 0

  for (const trade of trades) {
    if (trade.trader.toLowerCase() !== owner) continue
    if (trade.side === 'BUY') {
      amount += trade.amount
      spent += trade.quoteAmount
    } else {
      if (amount <= 0) continue
      // Sell out what is held at the average price, so the average of the remainder does not drift.
      const sold = Math.min(trade.amount, amount)
      spent -= (spent / amount) * sold
      amount -= sold
    }
  }

  // Dust left by floating point after selling out is not a position.
  if (amount <= 1e-9 || spent <= 0) return { amount: 0, entry: 0 }
  return { amount, entry: spent / amount }
}

const BOUGHT = parseAbiItem(
  'event Bought(address indexed payer, address indexed recipient, uint256 amountIn, uint256 tokensOut, uint256 tradeFee, uint256 creatorTax, uint256 snipeTax, uint256 quoteReserve)',
)
const SOLD = parseAbiItem(
  'event Sold(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 amountOut, uint256 tradeFee, uint256 creatorTax, uint256 quoteReserve)',
)
const POOL_SWAP = parseAbiItem(
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
)
const GRADUATED = parseAbiItem(
  'event Graduated(uint256 quoteAmount, uint256 tokenAmount)',
)

/** First block worth scanning for Qualyra logs. Set it to the factory's deploy block. */
export const startBlock = (): bigint => {
  const raw = process.env.NEXT_PUBLIC_QUALYRA_START_BLOCK
  try {
    return raw ? BigInt(raw) : 121578223n
  } catch {
    return 121578223n
  }
}

const abs = (v: bigint): bigint => (v < 0n ? -v : v)

/** Uniswap v4 pool id: the hash of the encoded pool key. */
function poolIdOf(key: {
  currency0: Address
  currency1: Address
  fee: number
  tickSpacing: number
  hooks: Address
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  )
}

/**
 * Converts a v4 sqrtPriceX96 into the price of one whole token in the pair asset.
 * sqrtPriceX96 encodes amount1 per amount0 in raw units, so the token side and the decimals both matter.
 */
function priceFromSqrt(sqrtPriceX96: bigint, tokenIsCurrency0: boolean, quoteDecimals: number): number {
  const sqrt = Number(sqrtPriceX96) / 2 ** 96
  const raw = sqrt * sqrt // amount1 per amount0, raw units
  if (!Number.isFinite(raw) || raw === 0) return 0
  // Tokens are always 18 decimals; the pair asset may not be.
  const token1PerToken0 = tokenIsCurrency0 ? raw : 1 / raw
  const decimalShift = tokenIsCurrency0 ? 18 - quoteDecimals : quoteDecimals - 18
  return token1PerToken0 * 10 ** decimalShift
}

export type TokenTradeHistory = {
  trades: TokenTrade[]
  candles: Candle[]
  /** Last traded price, or 0 when the token has never traded. */
  lastPrice: number
  /** Pair asset moved in the last 24 hours. */
  volume24h: number
  /** Price change over the last 24 hours, in percent. */
  change24h: number
  isLoading: boolean
  refresh: () => void
  /** Timestamp in seconds when the token graduated and migrated, or null if still bonding. */
  graduatedTimestamp?: number | null
}

const EMPTY: Omit<TokenTradeHistory, 'refresh'> = {
  trades: [],
  candles: [],
  lastPrice: 0,
  volume24h: 0,
  change24h: 0,
  isLoading: false,
  graduatedTimestamp: null,
}

export function useTokenTrades(
  token: Address | undefined,
  curve: Address | undefined,
  graduated: boolean,
  quoteDecimals: number,
  bucketSeconds = 300,
  /**
   * Safety net only. The socket is what makes a fill appear; this is how long the interface may stay
   * wrong if that socket has quietly died, so it is deliberately slack rather than a polling interval.
   */
  fallbackMs = 90000,
): TokenTradeHistory {
  const connectedChainId = useChainId()
  const chainId = resolveTargetChainId(connectedChainId)
  const hook = qualyraDeployment(chainId)?.hook
  const [trades, setTrades] = useState<TokenTrade[]>([])
  const [graduatedTimestamp, setGraduatedTimestamp] = useState<number | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [nonce, setNonce] = useState(0)

  const { data: poolKey } = useReadContract({
    address: hook,
    chainId,
    abi: qualyraHookAbi,
    functionName: 'poolKeyOf',
    args: [token as Address],
    query: { enabled: graduated && isDeployed(hook) && !!token },
  })

  const refresh = useCallback(() => setNonce(n => n + 1), [setNonce])

  // Fills, as they happen.
  //
  // `getLogs` answers what has already happened and then says nothing more, so on its own the chart
  // freezes at whatever the market looked like when the page opened. These two subscriptions are what
  // make a trade appear: the node pushes the event and the history is read again immediately.
  useWatchContractEvent({
    address: curve,
    chainId,
    abi: qualyraBondingCurveAbi,
    eventName: 'Bought',
    enabled: !!curve && !graduated,
    onLogs: refresh,
  })
  useWatchContractEvent({
    address: curve,
    chainId,
    abi: qualyraBondingCurveAbi,
    eventName: 'Sold',
    enabled: !!curve && !graduated,
    onLogs: refresh,
  })

  // A pool has no contract of its own to watch, so graduated tokens fall back to asking periodically.
  // Everything else leans on the subscriptions above and only uses this if the socket has dropped.
  useEffect(() => {
    if (!fallbackMs || !token) return
    const timer = setInterval(refresh, graduated ? 20000 : fallbackMs)
    return () => clearInterval(timer)
  }, [fallbackMs, token, graduated, refresh])

  const [prevTokenKey, setPrevTokenKey] = useState('')
  const currentTokenKey = `${token || ''}_${curve || ''}_${graduated}`
  if (currentTokenKey !== prevTokenKey) {
    setPrevTokenKey(currentTokenKey)
    setTrades([])
    setGraduatedTimestamp(null)
    if (token) {
      setLoading(true)
    } else {
      setLoading(false)
    }
  }

  const hasTradesRef = useRef(false)
  useEffect(() => {
    hasTradesRef.current = trades.length > 0
  }, [trades.length])

  useEffect(() => {
    if (!token || (!curve && !graduated)) {
      return
    }
    let cancelled = false
    const loadingTimer = setTimeout(() => {
      if (!cancelled && !hasTradesRef.current) setLoading(true)
    }, 0)

    ;(async () => {
      try {
        const client = getPublicClient(wagmiConfig, { chainId: chainId as 4663 | 46630 })
        if (!client) return

        const fromBlock = startBlock()
        const collected: TokenTrade[] = []

        // Timestamps come per block, and several fills often share one.
        const blockTimes = new Map<bigint, number>()
        const timeOf = async (blockNumber: bigint): Promise<number> => {
          const known = blockTimes.get(blockNumber)
          if (known !== undefined) return known
          try {
            const block = await client.getBlock({ blockNumber })
            const seconds = Number(block.timestamp)
            blockTimes.set(blockNumber, seconds)
            return seconds
          } catch {
            return Math.floor(Date.now() / 1000)
          }
        }

        let detectedGradTimestamp: number | null = null

        if (curve) {
          const [bought, sold, gradLogs] = await Promise.all([
            client.getLogs({ address: curve, event: BOUGHT, fromBlock, toBlock: 'latest' }),
            client.getLogs({ address: curve, event: SOLD, fromBlock, toBlock: 'latest' }),
            graduated
              ? client.getLogs({ address: curve, event: GRADUATED, fromBlock, toBlock: 'latest' }).catch(() => [])
              : Promise.resolve([]),
          ])

          // Pre-fetch block timestamps in parallel for all unique block numbers
          const uniqueBlocks = [...new Set([...bought, ...sold, ...(gradLogs || [])].map(l => l.blockNumber))]
          await Promise.all(
            uniqueBlocks.map(async (bn) => {
              if (!blockTimes.has(bn)) {
                try {
                  const block = await client.getBlock({ blockNumber: bn })
                  blockTimes.set(bn, Number(block.timestamp))
                } catch {}
              }
            })
          )

          if (gradLogs && gradLogs.length > 0) {
            detectedGradTimestamp = await timeOf(gradLogs[0].blockNumber)
          }

          for (const log of bought) {
            const a = log.args as {
              payer?: Address
              amountIn?: bigint
              tokensOut?: bigint
              tradeFee?: bigint
              creatorTax?: bigint
              snipeTax?: bigint
            }
            if (!a.tokensOut || a.tokensOut === 0n || !a.amountIn) continue
            // Price the curve actually moved at: what reached the curve, not what the buyer paid in total.
            const net = a.amountIn - (a.tradeFee ?? 0n) - (a.creatorTax ?? 0n) - (a.snipeTax ?? 0n)
            const quoteAmount = Number(formatUnits(net, quoteDecimals))
            const amount = Number(formatUnits(a.tokensOut, 18))
            collected.push({
              side: 'BUY',
              price: amount > 0 ? quoteAmount / amount : 0,
              amount,
              quoteAmount,
              timestamp: await timeOf(log.blockNumber),
              txHash: log.transactionHash,
              trader: a.payer ?? NATIVE_PAIR_ASSET,
              source: 'curve',
            })
          }

          for (const log of sold) {
            const a = log.args as {
              seller?: Address
              tokensIn?: bigint
              amountOut?: bigint
              tradeFee?: bigint
              creatorTax?: bigint
            }
            if (!a.tokensIn || a.tokensIn === 0n || a.amountOut === undefined) continue
            const gross = a.amountOut + (a.tradeFee ?? 0n) + (a.creatorTax ?? 0n)
            const quoteAmount = Number(formatUnits(gross, quoteDecimals))
            const amount = Number(formatUnits(a.tokensIn, 18))
            collected.push({
              side: 'SELL',
              price: amount > 0 ? quoteAmount / amount : 0,
              amount,
              quoteAmount,
              timestamp: await timeOf(log.blockNumber),
              txHash: log.transactionHash,
              trader: a.seller ?? NATIVE_PAIR_ASSET,
              source: 'curve',
            })
          }
        }

        if (graduated && poolKey) {
          try {
            const key = poolKey as unknown as {
              currency0: Address
              currency1: Address
              fee: number
              tickSpacing: number
              hooks: Address
            }
            const tokenIsCurrency0 = key.currency0.toLowerCase() === token.toLowerCase()
            const deployment = qualyraDeployment(chainId)
            const poolManager = deployment?.poolManager
            const swaps = await client.getLogs({
              ...(poolManager && poolManager !== NOT_DEPLOYED ? { address: poolManager } : {}),
              event: POOL_SWAP,
              args: { id: poolIdOf(key) },
              fromBlock,
              toBlock: 'latest',
            })

            const swapBlocks = [...new Set(swaps.map(l => l.blockNumber))]
            await Promise.all(
              swapBlocks.map(async (bn) => {
                if (!blockTimes.has(bn)) {
                  try {
                    const block = await client.getBlock({ blockNumber: bn })
                    blockTimes.set(bn, Number(block.timestamp))
                  } catch {}
                }
              })
            )

            for (const log of swaps) {
              const a = log.args as { sender?: Address; amount0?: bigint; amount1?: bigint; sqrtPriceX96?: bigint }
              if (a.sqrtPriceX96 === undefined || a.amount0 === undefined || a.amount1 === undefined) continue
              const tokenDelta = tokenIsCurrency0 ? a.amount0 : a.amount1
              const quoteDelta = tokenIsCurrency0 ? a.amount1 : a.amount0
              const amount = Number(formatUnits(abs(tokenDelta), 18))
              const quoteAmount = Number(formatUnits(abs(quoteDelta), quoteDecimals))
              collected.push({
                // A v4 Swap event signs amounts from the swapper's side: a negative token delta means the
                // trader sent tokens in (a sell), a positive one means they received tokens (a buy).
                side: tokenDelta < 0n ? 'SELL' : 'BUY',
                price: priceFromSqrt(a.sqrtPriceX96, tokenIsCurrency0, quoteDecimals),
                amount,
                quoteAmount,
                timestamp: await timeOf(log.blockNumber),
                txHash: log.transactionHash,
                trader: a.sender ?? NATIVE_PAIR_ASSET,
                source: 'pool',
              })
            }
          } catch (poolErr) {
            console.warn('[useTokenTrades] Pool swap logs query failed, retaining curve trades:', poolErr)
          }
        }

        if (cancelled) return
        collected.sort((x, y) => x.timestamp - y.timestamp)

        if (!detectedGradTimestamp && graduated) {
          const curveTrades = collected.filter(t => t.source === 'curve')
          if (curveTrades.length > 0) {
            detectedGradTimestamp = curveTrades[curveTrades.length - 1].timestamp
          } else if (collected.length > 0) {
            detectedGradTimestamp = collected[0].timestamp
          }
        }
        setGraduatedTimestamp(detectedGradTimestamp)

        // Replacing the array with an identical one re-renders everything downstream and, in the chart,
        // used to throw the viewport away. Only publish when the fills actually differ.
        setTrades(prev => {
          if (prev.length === collected.length) {
            if (prev.length === 0) return prev
            const a = prev[prev.length - 1]
            const b = collected[collected.length - 1]
            // Same count and the same final fill (identity, price and time) means nothing moved this
            // poll. Keep the previous array so its reference is stable and the chart/price don't redraw.
            if (a.txHash === b.txHash && a.price === b.price && a.timestamp === b.timestamp) {
              return prev
            }
          }
          return collected
        })
      } catch {
        // Most RPCs cap the getLogs range. An empty history is honest; it is not a fabricated one.
        if (!cancelled && !hasTradesRef.current) setTrades([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(loadingTimer)
    }
  }, [chainId, token, curve, graduated, poolKey, quoteDecimals, nonce])

  // Derive candles and the price/volume stats from the fills ALONE. Keeping this separate from
  // isLoading/refresh is what stops the flicker: those two flip on every background poll, and if they
  // were in this dependency list the candle array would be rebuilt with a fresh reference each poll,
  // making the chart call setData() and redraw even when no trade happened. Now the array identity only
  // changes when the fills themselves change.
  const derived = useMemo(() => {
    if (trades.length === 0) {
      return { candles: EMPTY.candles, lastPrice: 0, volume24h: 0, change24h: 0 }
    }

    const candles: Candle[] = []
    for (const trade of trades) {
      const bucket = Math.floor(trade.timestamp / bucketSeconds) * bucketSeconds
      const last = candles[candles.length - 1]
      if (last && last.time === bucket) {
        last.high = Math.max(last.high, trade.price)
        last.low = Math.min(last.low, trade.price)
        last.close = trade.price
        last.volume += trade.quoteAmount
      } else {
        if (last && bucket > last.time + bucketSeconds) {
          for (let t = last.time + bucketSeconds; t < bucket; t += bucketSeconds) {
            candles.push({
              time: t,
              open: last.close,
              high: last.close,
              low: last.close,
              close: last.close,
              volume: 0,
            })
          }
        }
        // Seed high/low from the open (previous candle's close) as well as this fill's price, so a bar
        // that gaps up or down from the prior close can never report high < open or low > open — an
        // invalid OHLC bar that made the chart draw impossible candles.
        const openPrice = last ? last.close : trade.price
        candles.push({
          time: bucket,
          open: openPrice,
          high: Math.max(openPrice, trade.price),
          low: Math.min(openPrice, trade.price),
          close: trade.price,
          volume: trade.quoteAmount,
        })
      }
    }

    const latestTimestamp = trades[trades.length - 1].timestamp
    const cutoff = latestTimestamp - 24 * 60 * 60
    const recent = trades.filter(t => t.timestamp >= cutoff)
    const volume24h = recent.reduce((sum, t) => sum + t.quoteAmount, 0)
    const lastPrice = trades[trades.length - 1].price
    const openPrice = recent.length > 0 ? recent[0].price : trades[0].price
    const change24h = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0

    return { candles, lastPrice, volume24h, change24h }
  }, [trades, bucketSeconds])

  return useMemo(
    () => ({ trades, ...derived, isLoading, refresh, graduatedTimestamp }),
    [trades, derived, isLoading, refresh, graduatedTimestamp],
  )
}

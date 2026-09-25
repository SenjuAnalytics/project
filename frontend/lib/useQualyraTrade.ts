'use client'

// Trading a Qualyra token on chain.
//
// A token has two markets in its life and this hook hides the difference. Before graduation it trades on its
// own bonding curve, which quotes and settles itself. After graduation it trades in a Uniswap v4 pool, which
// needs a router because the PoolManager cannot be called from a wallet directly.
//
// Nothing here falls back to simulated data. When a token has no curve on this chain the hook reports that and
// the caller decides what to show.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useChainId, useReadContract, useReadContracts, useWriteContract } from 'wagmi'
import { keepPreviousData } from '@tanstack/react-query'
import { erc20Abi, maxUint256, parseUnits } from 'viem'
import { readContract, simulateContract, waitForTransactionReceipt } from '@wagmi/core'

import { wagmiConfig } from './wagmi'
import { feeOverrides } from './gas'

import {
  qualyraBondingCurveAbi,
  qualyraFactoryAbi,
  qualyraSwapRouterAbi,
  qualyraDeployment,
  isDeployed,
  resolveTargetChainId,
  NATIVE_PAIR_ASSET,
  type Address,
} from './contracts'

/** Curve phases, as QualyraBondingCurve reports them. */
export enum CurvePhase {
  Trading = 0,
  Completed = 1,
  Graduated = 2,
  /** Stuck for 7 days after completing, so holders can redeem their share of the raise. */
  Refunding = 3,
}

export type TradeSide = 'BUY' | 'SELL'

export type TokenMarket = {
  token?: Address
  curve?: Address
  quoteAsset?: Address
  quoteDecimals: number
  phase?: CurvePhase
  /** True once the token trades in the pool rather than on the curve. */
  graduated: boolean
  /** False when this token is not a Qualyra token on the connected chain. */
  onChain: boolean
  isLoading: boolean
}

/** Breakdown of a quote, all amounts in base units. */
export type TradeQuote = {
  amountOut: bigint
  tradeFee: bigint
  creatorTax: bigint
  snipeTax: bigint
  /** Pair asset handed back when a buy overshoots the graduation target. */
  refund: bigint
}

/** A quote, plus whether a newer one is still on its way. */
export type CurveQuote = TradeQuote & { pending: boolean }

const DEADLINE_SECONDS = 20n * 60n

/** A curve's phase changes when somebody else trades, so it is read again on a timer. */
const MARKET_POLL_MS = 12000

/** How long to let typing settle before asking the curve. Every keystroke would otherwise be a round trip. */
const QUOTE_DEBOUNCE_MS = 220

/** Holds a value still until it stops changing. The first value passes through immediately. */
function useSettled<T>(value: T, delay = QUOTE_DEBOUNCE_MS): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    if (Object.is(settled, value)) return
    const timer = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay, settled])
  return settled
}

/** Resolves which market a token trades on, and the pair asset behind it. */
export function useTokenMarket(token?: Address): TokenMarket {
  const connectedChainId = useChainId()
  const chainId = resolveTargetChainId(connectedChainId)
  const factory = qualyraDeployment(chainId)?.factory
  const enabled = isDeployed(factory) && !!token

  const base = useReadContracts({
    contracts: [
      { address: factory, chainId, abi: qualyraFactoryAbi, functionName: 'curveOf', args: [token!] },
      { address: factory, chainId, abi: qualyraFactoryAbi, functionName: 'isGraduated', args: [token!] },
    ],
    query: { enabled },
  })

  const curve =
    base.data?.[0]?.status === 'success' ? (base.data[0].result as Address) : undefined
  const hasCurve = !!curve && curve !== NATIVE_PAIR_ASSET
  const graduated = base.data?.[1]?.status === 'success' ? Boolean(base.data[1].result) : false

  const curveState = useReadContracts({
    contracts: [
      { address: curve, chainId, abi: qualyraBondingCurveAbi, functionName: 'phase' },
      { address: curve, chainId, abi: qualyraBondingCurveAbi, functionName: 'quoteAsset' },
    ],
    query: { enabled: hasCurve, refetchInterval: MARKET_POLL_MS },
  })

  const quoteAsset =
    curveState.data?.[1]?.status === 'success' ? (curveState.data[1].result as Address) : undefined
  const isNative = quoteAsset === NATIVE_PAIR_ASSET

  const decimalsQuery = useReadContract({
    address: quoteAsset,
    chainId,
    abi: erc20Abi,
    functionName: 'decimals',
    query: { enabled: !!quoteAsset && !isNative },
  })

  return useMemo(
    () => ({
      token,
      curve: hasCurve ? curve : undefined,
      quoteAsset,
      quoteDecimals: isNative ? 18 : (decimalsQuery.data ?? 18),
      phase:
        curveState.data?.[0]?.status === 'success'
          ? (Number(curveState.data[0].result) as CurvePhase)
          : undefined,
      graduated,
      onChain: hasCurve,
      isLoading: base.isLoading || curveState.isLoading || decimalsQuery.isLoading,
    }),
    [
      token,
      curve,
      hasCurve,
      quoteAsset,
      isNative,
      decimalsQuery.data,
      decimalsQuery.isLoading,
      curveState.data,
      curveState.isLoading,
      graduated,
      base.isLoading,
    ],
  )
}

/**
 * Quotes a trade on the curve. Returns undefined once the token has graduated — the pool has no quoter here,
 * so the caller should price a graduated token from the pool state instead.
 */
export function useCurveQuote(market: TokenMarket, side: TradeSide, amount: string): CurveQuote | undefined {
  const connectedChainId = useChainId()
  const chainId = resolveTargetChainId(connectedChainId)
  const { address } = useAccount()
  const decimals = side === 'BUY' ? market.quoteDecimals : 18
  const settledAmount = useSettled(amount)
  let parsed = 0n
  try {
    parsed = settledAmount ? parseUnits(settledAmount, decimals) : 0n
  } catch {
    parsed = 0n
  }

  const enabled = !!market.curve && !market.graduated && parsed > 0n

  const buyQuote = useReadContract({
    address: market.curve,
    chainId,
    abi: qualyraBondingCurveAbi,
    functionName: 'quoteBuy',
    args: [parsed, address ?? NATIVE_PAIR_ASSET],
    // Keeping the previous answer while the next one loads stops the panel from blinking through zero,
    // which reads as "you get nothing" rather than "still calculating".
    query: { enabled: enabled && side === 'BUY', placeholderData: keepPreviousData },
  })

  const sellQuote = useReadContract({
    address: market.curve,
    chainId,
    abi: qualyraBondingCurveAbi,
    functionName: 'quoteSell',
    args: [parsed],
    query: { enabled: enabled && side === 'SELL', placeholderData: keepPreviousData },
  })

  const active = side === 'BUY' ? buyQuote : sellQuote
  // Pending covers both halves of the wait: the debounce, and the read it fires.
  const pending = (enabled && active.isFetching) || settledAmount !== amount

  return useMemo(() => {
    if (side === 'BUY') {
      const q = buyQuote.data as
        | { tokensOut: bigint; tradeFee: bigint; creatorTax: bigint; snipeTax: bigint; refund: bigint }
        | undefined
      if (!q) return undefined
      return {
        amountOut: q.tokensOut,
        tradeFee: q.tradeFee,
        creatorTax: q.creatorTax,
        snipeTax: q.snipeTax,
        refund: q.refund,
        pending,
      }
    }
    const q = sellQuote.data as
      | { amountOut: bigint; tradeFee: bigint; creatorTax: bigint }
      | undefined
    if (!q) return undefined
    return {
      amountOut: q.amountOut,
      tradeFee: q.tradeFee,
      creatorTax: q.creatorTax,
      snipeTax: 0n,
      refund: 0n,
      pending,
    }
  }, [side, buyQuote.data, sellQuote.data, pending])
}

export type TradeActions = {
  buy: (amountIn: bigint, minOut: bigint) => Promise<`0x${string}`>
  sell: (tokenAmount: bigint, minOut: bigint) => Promise<`0x${string}`>
  /** True when the platform has no swap router on this chain, so graduated tokens cannot be traded here. */
  swapUnavailable: boolean
  isPending: boolean
}

/** Buy and sell calls for whichever market the token is currently on. */
export function useTradeActions(market: TokenMarket): TradeActions {
  const connectedChainId = useChainId()
  const chainId = resolveTargetChainId(connectedChainId)
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useWriteContract()
  const swapRouter = qualyraDeployment(chainId)?.swapRouter

  const deadline = useCallback(() => BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_SECONDS, [])

  /**
   * Approves `spender` for `amount` when the current allowance is short, and waits for it to land before the
   * trade goes out. Native ETH never reaches this.
   */
  const ensureAllowance = useCallback(
    async (erc20: Address, spender: Address, amount: bigint) => {
      if (!address) throw new Error('Connect a wallet first.')
      const current = (await readContract(wagmiConfig, {
        address: erc20,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, spender],
      })) as bigint
      if (current >= amount) return

      const hash = await writeContractAsync({
        address: erc20,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, maxUint256],
        ...(await feeOverrides(chainId)),
      })
      await waitForTransactionReceipt(wagmiConfig, { hash })
    },
    [address, chainId, writeContractAsync],
  )

  const buy = useCallback(
    async (amountIn: bigint, minOut: bigint) => {
      if (!address) throw new Error('Connect a wallet first.')
      const native = market.quoteAsset === NATIVE_PAIR_ASSET
      const spender = market.graduated ? swapRouter : market.curve
      if (!native && spender) await ensureAllowance(market.quoteAsset!, spender, amountIn)
      const fees = await feeOverrides(chainId)

      if (market.graduated) {
        if (!isDeployed(swapRouter)) throw new Error('No swap router on this chain.')
        return writeContractAsync({
          address: swapRouter!,
          abi: qualyraSwapRouterAbi,
          functionName: 'swapExactIn',
          args: [market.token!, true, amountIn, minOut, address, deadline()],
          value: native ? amountIn : 0n,
          ...fees,
        })
      }

      if (!market.curve) throw new Error('This token has no curve on this chain.')
      return writeContractAsync({
        address: market.curve,
        abi: qualyraBondingCurveAbi,
        functionName: 'buy',
        args: [amountIn, minOut, address, deadline()],
        value: native ? amountIn : 0n,
        ...fees,
      })
    },
    [address, chainId, market, swapRouter, writeContractAsync, deadline, ensureAllowance],
  )

  const sell = useCallback(
    async (tokenAmount: bigint, minOut: bigint) => {
      if (!address) throw new Error('Connect a wallet first.')
      const spender = market.graduated ? swapRouter : market.curve
      if (spender) await ensureAllowance(market.token!, spender, tokenAmount)
      const fees = await feeOverrides(chainId)

      if (market.graduated) {
        if (!isDeployed(swapRouter)) throw new Error('No swap router on this chain.')
        return writeContractAsync({
          address: swapRouter!,
          abi: qualyraSwapRouterAbi,
          functionName: 'swapExactIn',
          args: [market.token!, false, tokenAmount, minOut, address, deadline()],
          ...fees,
        })
      }

      if (!market.curve) throw new Error('This token has no curve on this chain.')
      return writeContractAsync({
        address: market.curve,
        abi: qualyraBondingCurveAbi,
        functionName: 'sell',
        args: [tokenAmount, minOut, address, deadline()],
        ...fees,
      })
    },
    [address, chainId, market, swapRouter, writeContractAsync, deadline, ensureAllowance],
  )

  return {
    buy,
    sell,
    swapUnavailable: market.graduated && !isDeployed(swapRouter),
    isPending,
  }
}

/** The contract that pulls the input for a trade, so the UI knows what to approve. */
export function spenderFor(market: TokenMarket, chainId: number): Address | undefined {
  if (market.graduated) return qualyraDeployment(chainId)?.swapRouter
  return market.curve
}

/** What a graduated-token swap would return right now, priced by the pool rather than a spot line. */
export type PoolQuote = {
  /** Pair asset out for a sell, or tokens out for a buy — base units. */
  amountOut: bigint
  /** Price impact against the pool's spot price, in percent (>= 0). */
  impactPct: number
  /** A newer quote is still on its way. */
  pending: boolean
}

/**
 * Quotes a swap on a graduated token's Uniswap v4 pool.
 *
 * The pool has no on-chain quoter wired into the frontend, so the honest way to price a swap of any size —
 * fees and curve slippage included — is to dry-run the exact router call the trade would make. `simulateContract`
 * does that with an `eth_call`: it returns the real `amountOut` without sending anything or needing gas.
 *
 * A tiny reference swap (one whole token) gives the pool's near-spot rate, and comparing the actual rate of the
 * requested size against it is the true price impact — the same number the pool will clear at, not a linear
 * estimate that ignores depth.
 */
export function usePoolSwapQuote(market: TokenMarket, side: TradeSide, amount: string): PoolQuote | undefined {
  const connectedChainId = useChainId()
  const chainId = resolveTargetChainId(connectedChainId)
  const { address } = useAccount()
  const swapRouter = qualyraDeployment(chainId)?.swapRouter

  // BUY spends the pair asset (its decimals); SELL spends the token (18).
  const decimals = side === 'BUY' ? market.quoteDecimals : 18
  const settledAmount = useSettled(amount)

  let parsed = 0n
  try {
    parsed = settledAmount ? parseUnits(settledAmount, decimals) : 0n
  } catch {
    parsed = 0n
  }

  const enabled =
    market.graduated && isDeployed(swapRouter) && !!market.token && parsed > 0n

  const [quote, setQuote] = useState<PoolQuote | undefined>(undefined)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!enabled || !swapRouter || !market.token) {
      return
    }

    let cancelled = false
    const pendingTimer = setTimeout(() => {
      if (!cancelled) setPending(true)
    }, 0)

    const buyingToken = side === 'BUY'
    const recipient = address ?? swapRouter
    const deadline = maxUint256

    // A dry-run of `swapExactIn` at `amountIn`. minOut = 0 so the read never trips slippage; it only measures.
    // `swapExactIn` is payable: a BUY pays native ETH, so the dry-run must forward `amountIn` as msg.value or
    // the router reverts (UnexpectedValue/InsufficientBalance) and the quote never lands. A SELL spends the
    // token itself, so it sends no value.
    const dryRun = (amountIn: bigint) =>
      simulateContract(wagmiConfig, {
        address: swapRouter,
        chainId: chainId as 4663 | 46630,
        abi: qualyraSwapRouterAbi,
        functionName: 'swapExactIn',
        args: [market.token!, buyingToken, amountIn, 0n, recipient, deadline],
        account: recipient,
        value: buyingToken ? amountIn : 0n,
      }).then(res => res.result as bigint)

    // One whole token of input marks the pool's near-spot rate to measure impact against.
    const unitIn = parseUnits('1', decimals)

    Promise.all([dryRun(parsed), parsed === unitIn ? Promise.resolve(null) : dryRun(unitIn)])
      .then(([amountOut, unitOut]) => {
        if (cancelled) return
        // Rate = output per unit of input. Spot comes from the reference swap; the requested size's own rate
        // is what it actually clears at. Impact is how far the latter sits below the former.
        const size = Number(parsed)
        const effectiveRate = size > 0 ? Number(amountOut) / size : 0
        const unitSize = Number(unitIn)
        const spotRate =
          unitOut === null ? effectiveRate : unitSize > 0 ? Number(unitOut) / unitSize : effectiveRate
        const impactPct =
          spotRate > 0 ? Math.max(0, +(((spotRate - effectiveRate) / spotRate) * 100).toFixed(2)) : 0
        setQuote({ amountOut, impactPct, pending: false })
        setPending(false)
      })
      .catch(() => {
        // A failed dry-run (e.g. an amount larger than the wallet holds) is not a quote; leave the last one.
        if (cancelled) return
        setPending(false)
      })

    return () => {
      cancelled = true
      clearTimeout(pendingTimer)
    }
  }, [enabled, swapRouter, market.token, side, address, parsed, decimals, chainId])

  if (!enabled) return undefined
  return quote ? { ...quote, pending } : { amountOut: 0n, impactPct: 0, pending: true }
}

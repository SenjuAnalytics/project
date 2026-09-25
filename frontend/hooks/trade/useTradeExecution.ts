'use client'

import { useMemo } from 'react'
import { parseUnits, formatUnits } from 'viem'
import { waitForTransactionReceipt } from '@wagmi/core'
import { wagmiConfig } from '@/lib/wagmi'
import { describeTxError } from '@/lib/gas'
import { px7, formatPrice, formatTokenAmount, nowTime, cleanPriceNum } from '@/lib/utils'
import { executeTrade, saveOpenOrder, saveTrollboxMessage, type WalletBalances } from '@/lib/storage'
import { useCurveQuote, usePoolSwapQuote, type useTokenMarket, type useTradeActions } from '@/lib/useQualyraTrade'
import type { Project } from '@/lib/data'
import type { LivePriceItem } from '@/lib/useLivePrices'

interface UseTradeExecutionParams {
  curProject: Project
  market: ReturnType<typeof useTokenMarket>
  onChainTrade: ReturnType<typeof useTradeActions>
  orderType: 'MARKET' | 'LIMIT' | 'BRIDGE'
  orderSide: 'BUY' | 'SELL'
  bAmt: number
  sAmt: number
  limitPrice: number
  slippage: number
  balances: WalletBalances
  effectiveEthBalance: number
  currentHolding: number
  tokenBalanceRaw?: bigint
  quote: string
  quoteUsdPrice: number
  isRwa: boolean
  isRwaStock: boolean
  liveTrading: boolean
  chainHistory: { lastPrice: number; refresh: () => void }
  livePrices: Record<string, LivePriceItem | undefined>
  tpPct: number
  slPct: number
  customTpPrice: string
  customSlPrice: string
  tpSlInputMode: 'percent' | 'price'
  attachTpSl: boolean
  address?: string
  isCreator?: boolean
  toast: {
    info: (title: string, desc?: string) => void
    success: (title: string, desc?: string) => void
    error: (title: string, desc?: string) => void
  }
  queryClient: { invalidateQueries: () => Promise<void> }
}

export function useTradeExecution({
  curProject,
  market,
  onChainTrade,
  orderType,
  orderSide,
  bAmt,
  sAmt,
  limitPrice,
  slippage,
  balances,
  effectiveEthBalance,
  currentHolding,
  tokenBalanceRaw,
  quote,
  quoteUsdPrice,
  isRwa,
  isRwaStock,
  liveTrading,
  chainHistory,
  livePrices,
  tpPct,
  slPct,
  customTpPrice,
  customSlPrice,
  tpSlInputMode,
  attachTpSl,
  address,
  isCreator,
  toast,
  queryClient,
}: UseTradeExecutionParams) {
  // TP/SL calculations
  const calculatedTpPrice = useMemo(() => {
    const base = orderType === 'LIMIT' && limitPrice > 0 ? limitPrice : curProject.price
    if (!base) return 0
    if (tpSlInputMode === 'price' && customTpPrice) {
      const p = parseFloat(customTpPrice)
      return !isNaN(p) && p > 0 ? cleanPriceNum(p) : 0
    }
    return cleanPriceNum(base * (1 + tpPct / 100))
  }, [tpSlInputMode, customTpPrice, orderType, limitPrice, curProject.price, tpPct])

  const calculatedSlPrice = useMemo(() => {
    const base = orderType === 'LIMIT' && limitPrice > 0 ? limitPrice : curProject.price
    if (!base) return 0
    if (tpSlInputMode === 'price' && customSlPrice) {
      const p = parseFloat(customSlPrice)
      return !isNaN(p) && p > 0 ? cleanPriceNum(p) : 0
    }
    return cleanPriceNum(base * (1 - slPct / 100))
  }, [tpSlInputMode, customSlPrice, orderType, limitPrice, curProject.price, slPct])

  const effectiveTpPct = useMemo(() => {
    const base = orderType === 'LIMIT' && limitPrice > 0 ? limitPrice : curProject.price
    if (!base || !calculatedTpPrice) return tpPct
    return +(((calculatedTpPrice - base) / base) * 100).toFixed(1)
  }, [calculatedTpPrice, orderType, limitPrice, curProject.price, tpPct])

  const effectiveSlPct = useMemo(() => {
    const base = orderType === 'LIMIT' && limitPrice > 0 ? limitPrice : curProject.price
    if (!base || !calculatedSlPrice) return slPct
    return +(((base - calculatedSlPrice) / base) * 100).toFixed(1)
  }, [calculatedSlPrice, orderType, limitPrice, curProject.price, slPct])

  const effectivePrice = orderType === 'LIMIT' && limitPrice > 0 ? limitPrice : curProject.price

  // Quoting hooks
  const curveBuyQuote = useCurveQuote(market, 'BUY', bAmt > 0 ? String(bAmt) : '')
  const curveSellQuote = useCurveQuote(market, 'SELL', sAmt > 0 ? String(sAmt) : '')
  const poolBuyQuote = usePoolSwapQuote(market, 'BUY', bAmt > 0 ? String(bAmt) : '')
  const poolSellQuote = usePoolSwapQuote(market, 'SELL', sAmt > 0 ? String(sAmt) : '')

  const receiveEstBuy = useMemo(() => {
    if (bAmt <= 0) return 0
    if (liveTrading) {
      if (!market.graduated) return curveBuyQuote ? Number(formatUnits(curveBuyQuote.amountOut, 18)) : 0
      if (poolBuyQuote && poolBuyQuote.amountOut > 0n) return Number(formatUnits(poolBuyQuote.amountOut, 18))
      return chainHistory.lastPrice > 0 ? bAmt / chainHistory.lastPrice : 0
    }
    if (!effectivePrice) return 0
    if (quote === 'ETH') {
      return Math.floor((bAmt * 3200) / effectivePrice)
    } else if (quote === 'NVDA') {
      const nvdaRate = livePrices['nvda']?.price || 213.21
      return Math.floor((bAmt * nvdaRate) / effectivePrice)
    }
    if (isRwa) {
      return +(bAmt / effectivePrice).toFixed(4)
    }
    return Math.floor(bAmt / effectivePrice)
  }, [
    bAmt,
    effectivePrice,
    isRwa,
    quote,
    livePrices,
    liveTrading,
    market.graduated,
    curveBuyQuote,
    poolBuyQuote,
    chainHistory.lastPrice,
  ])

  const receiveEstSell = useMemo(() => {
    if (sAmt <= 0) return 0
    if (liveTrading) {
      if (!market.graduated) return curveSellQuote ? Number(formatUnits(curveSellQuote.amountOut, market.quoteDecimals)) : 0
      if (poolSellQuote && poolSellQuote.amountOut > 0n) return Number(formatUnits(poolSellQuote.amountOut, market.quoteDecimals))
      return chainHistory.lastPrice > 0 ? sAmt * chainHistory.lastPrice : 0
    }
    if (!effectivePrice) return 0
    if (quote === 'ETH') {
      return +((sAmt * effectivePrice) / 3200).toFixed(5)
    } else if (quote === 'NVDA') {
      const nvdaRate = livePrices['nvda']?.price || 213.21
      return +((sAmt * effectivePrice) / nvdaRate).toFixed(4)
    }
    return +(sAmt * effectivePrice).toFixed(2)
  }, [
    sAmt,
    effectivePrice,
    quote,
    livePrices,
    liveTrading,
    market.graduated,
    market.quoteDecimals,
    curveSellQuote,
    poolSellQuote,
    chainHistory.lastPrice,
  ])

  // PnL & Risk Projections in USD
  const entryValueUsdg = useMemo(() => {
    if (orderSide === 'BUY') {
      return bAmt * quoteUsdPrice
    } else {
      return sAmt * effectivePrice
    }
  }, [orderSide, bAmt, sAmt, effectivePrice, quoteUsdPrice])

  const projectedTpGainUsdg = useMemo(() => {
    return +((entryValueUsdg * effectiveTpPct) / 100).toFixed(2)
  }, [entryValueUsdg, effectiveTpPct])

  const projectedSlLossUsdg = useMemo(() => {
    return +((entryValueUsdg * effectiveSlPct) / 100).toFixed(2)
  }, [entryValueUsdg, effectiveSlPct])

  const riskRewardRatio = useMemo(() => {
    if (effectiveSlPct <= 0) return '∞'
    return +(effectiveTpPct / effectiveSlPct).toFixed(2)
  }, [effectiveTpPct, effectiveSlPct])

  // Slippage floors
  const minReceivedBuy = useMemo(() => {
    if (receiveEstBuy <= 0) return 0
    return +(receiveEstBuy * (1 - slippage / 100)).toFixed(4)
  }, [receiveEstBuy, slippage])

  const minReceivedSell = useMemo(() => {
    if (receiveEstSell <= 0) return 0
    return +(receiveEstSell * (1 - slippage / 100)).toFixed(6)
  }, [receiveEstSell, slippage])

  const quotePending = useMemo(() => {
    if (!liveTrading) return false
    return orderSide === 'BUY'
      ? bAmt > 0 && (!curveBuyQuote || curveBuyQuote.pending)
      : sAmt > 0 && (!curveSellQuote || curveSellQuote.pending)
  }, [liveTrading, orderSide, bAmt, sAmt, curveBuyQuote, curveSellQuote])

  const tokenLabel = (n: number) => `${formatTokenAmount(n, isRwa && quote === 'USDG')} $${curProject.tick}`
  const quoteLabel = (n: number) => (quote === 'USDG' ? `$${formatPrice(n)} USDG` : `${formatPrice(n)} ${quote}`)

  const dynamicPriceImpact = useMemo(() => {
    const spot = curProject.price
    const size = orderSide === 'BUY' ? bAmt : sAmt
    if (size <= 0) {
      return 0
    }
    if (liveTrading && !market.graduated && spot > 0) {
      const unit = market.quoteDecimals

      if (orderSide === 'BUY' && curveBuyQuote && curveBuyQuote.amountOut > 0n) {
        const tokensOut = Number(formatUnits(curveBuyQuote.amountOut, 18))
        const deducted = Number(
          formatUnits(
            curveBuyQuote.tradeFee + curveBuyQuote.creatorTax + curveBuyQuote.snipeTax + curveBuyQuote.refund,
            unit,
          ),
        )
        const reachingCurve = bAmt - deducted
        if (tokensOut > 0 && reachingCurve > 0) {
          return Math.max(0, +(((reachingCurve / tokensOut) / spot - 1) * 100).toFixed(2))
        }
      } else if (orderSide === 'SELL' && curveSellQuote && curveSellQuote.amountOut > 0n) {
        const gross = Number(
          formatUnits(curveSellQuote.amountOut + curveSellQuote.tradeFee + curveSellQuote.creatorTax, unit),
        )
        if (gross > 0) {
          return Math.max(0, +((1 - (gross / sAmt) / spot) * 100).toFixed(2))
        }
      }
    }
    if (liveTrading && market.graduated) {
      const poolQuote = orderSide === 'BUY' ? poolBuyQuote : poolSellQuote
      if (poolQuote && poolQuote.amountOut > 0n) {
        return poolQuote.impactPct
      }
    }
    if (!entryValueUsdg || entryValueUsdg <= 0) return 0.02
    const poolLiq = curProject.liquidity || (curProject.mcap ? curProject.mcap * 0.25 : 120000)
    return Math.min(15, Math.max(0.02, +((entryValueUsdg / poolLiq) * 100).toFixed(2)))
  }, [
    entryValueUsdg,
    curProject.liquidity,
    curProject.mcap,
    curProject.price,
    liveTrading,
    market.graduated,
    market.quoteDecimals,
    orderSide,
    bAmt,
    sAmt,
    curveBuyQuote,
    curveSellQuote,
    poolBuyQuote,
    poolSellQuote,
  ])

  const amountString = (value: number, decimals: number): string => {
    if (!Number.isFinite(value) || value <= 0) return '0'
    const places = Math.min(Math.max(Math.trunc(decimals), 0), 20)
    if (value >= 1e21) return BigInt(Math.trunc(value)).toString()
    const text = value.toFixed(places)
    return (text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text) || '0'
  }

  const submitOnChain = async (side: 'BUY' | 'SELL') => {
    try {
      let hash: `0x${string}`
      if (side === 'BUY') {
        const amountIn = parseUnits(amountString(bAmt, market.quoteDecimals), market.quoteDecimals)
        const minOut = parseUnits(amountString(minReceivedBuy, 18), 18)
        hash = await onChainTrade.buy(amountIn, minOut)
      } else {
        const requested = parseUnits(amountString(sAmt, 18), 18)
        const owned = tokenBalanceRaw as bigint | undefined
        const tokenAmount = owned !== undefined && requested > owned ? owned : requested
        const minOut = parseUnits(amountString(minReceivedSell, market.quoteDecimals), market.quoteDecimals)
        hash = await onChainTrade.sell(tokenAmount, minOut)
      }

      toast.info(`${side === 'BUY' ? 'Buy' : 'Sell'} sent`, `Transaction ${hash.slice(0, 10)}… is on its way.`)
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
      if (receipt.status === 'reverted') {
        toast.error('Transaction reverted', 'The chain rejected it. Nothing was traded.')
        return
      }

      await queryClient.invalidateQueries()
      chainHistory.refresh()
      toast.success(`${side === 'BUY' ? 'Buy' : 'Sell'} filled`, `Block ${receipt.blockNumber}.`)
    } catch (err) {
      const { title, detail } = describeTxError(err)
      toast.error(title, detail)
    }
  }

  const availableQuoteBalance =
    quote === 'ETH' ? effectiveEthBalance : quote === 'NVDA' ? balances.nvda ?? 25.0 : balances.usdg

  const formattedQuoteBalance =
    quote === 'ETH'
      ? `${effectiveEthBalance.toFixed(4)} ETH`
      : quote === 'NVDA'
      ? `${(balances.nvda ?? 25.0).toFixed(2)} NVDA`
      : `${Math.floor(balances.usdg).toLocaleString('en-US')} USDG`

  const handleBuy = () => {
    if (bAmt <= 0) {
      toast.error('Invalid Amount', 'Please enter an amount to buy.')
      return
    }
    if (receiveEstBuy <= 0) {
      toast.error('Invalid Amount', 'Calculated receive amount must be greater than 0.')
      return
    }
    if (liveTrading) {
      void submitOnChain('BUY')
      return
    }
    if (bAmt > availableQuoteBalance) {
      toast.error('Insufficient Balance', `You only have ${formattedQuoteBalance} available.`)
      return
    }

    const fill = executeTrade({
      projectId: curProject.id,
      side: 'BUY',
      amount: receiveEstBuy,
      price: curProject.price,
      quoteAmount: bAmt,
      fee: isRwaStock ? +(bAmt * 0.001).toFixed(4) : +(bAmt * 0.01).toFixed(4),
      project: curProject,
    })

    if (attachTpSl) {
      if (calculatedTpPrice && calculatedTpPrice > curProject.price) {
        saveOpenOrder({
          id: `tp-${Date.now()}-${Math.floor(Date.now() % 10000)}`,
          pairId: curProject.id.toLowerCase(),
          tick: curProject.tick,
          side: 'SELL',
          type: 'TP',
          limitPrice: calculatedTpPrice,
          amount: receiveEstBuy,
          totalQuote: +(receiveEstBuy * calculatedTpPrice).toFixed(2),
          quoteAsset: quote,
          status: 'OPEN',
          createdAt: Date.now(),
          time: nowTime(),
          triggerCondition: 'GTE',
          parentOrderId: fill.id,
        })
      }
      if (calculatedSlPrice && calculatedSlPrice < curProject.price) {
        saveOpenOrder({
          id: `sl-${Date.now()}-${Math.floor(Date.now() % 10000)}`,
          pairId: curProject.id.toLowerCase(),
          tick: curProject.tick,
          side: 'SELL',
          type: 'SL',
          limitPrice: calculatedSlPrice,
          amount: receiveEstBuy,
          totalQuote: +(receiveEstBuy * calculatedSlPrice).toFixed(2),
          quoteAsset: quote,
          status: 'OPEN',
          createdAt: Date.now(),
          time: nowTime(),
          triggerCondition: 'LTE',
          parentOrderId: fill.id,
        })
      }
    }

    const userSender = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Guest'
    const userSenderShort = address ? `You (${address.slice(0, 6)}...${address.slice(-4)})` : 'Guest Trader'

    saveTrollboxMessage(curProject.id, {
      id: `trade-buy-${Date.now()}`,
      pairId: curProject.id.toLowerCase(),
      sender: userSender,
      senderShort: userSenderShort,
      role: isCreator ? 'creator' : 'whale',
      text: `🟢 SWAP BUY: ${receiveEstBuy.toLocaleString('en-US')} $${curProject.tick} for ${bAmt} ${quote}! 🚀${attachTpSl ? ` (TP: $${px7(calculatedTpPrice)}, SL: $${px7(calculatedSlPrice)})` : ''}`,
      time: nowTime().slice(0, 5),
      isTradeAlert: true,
      isUser: true,
      holding: (currentHolding || 0) + receiveEstBuy,
    })

    toast.success(
      'Buy Order Executed! 🚀',
      `Swapped ${quote === 'USDG' ? `$${bAmt}` : bAmt} ${quote} for ~${receiveEstBuy.toLocaleString('en-US')} $${curProject.tick}. Added to your Portfolio!`
    )
  }

  const handleSell = () => {
    if (sAmt <= 0) {
      toast.error('Invalid Amount', 'Please enter an amount to sell.')
      return
    }

    if (liveTrading) {
      void submitOnChain('SELL')
      return
    }
    if (currentHolding <= 0) {
      toast.error('No Balance', `You do not hold any $${curProject.tick} to sell. Buy some first!`)
      return
    }
    if (sAmt > currentHolding) {
      toast.error('Insufficient Balance', `You only hold ${currentHolding.toLocaleString('en-US')} $${curProject.tick}.`)
      return
    }

    executeTrade({
      projectId: curProject.id,
      side: 'SELL',
      amount: sAmt,
      price: curProject.price,
      quoteAmount: receiveEstSell,
      fee: isRwaStock ? +(receiveEstSell * 0.001).toFixed(4) : +(receiveEstSell * 0.01).toFixed(4),
      project: curProject,
    })

    const userSenderSell = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Guest'
    const userSenderShortSell = address ? `You (${address.slice(0, 6)}...${address.slice(-4)})` : 'Guest Trader'

    saveTrollboxMessage(curProject.id, {
      id: `trade-sell-${Date.now()}`,
      pairId: curProject.id.toLowerCase(),
      sender: userSenderSell,
      senderShort: userSenderShortSell,
      role: isCreator ? 'creator' : 'holder',
      text: `🔴 SWAP SELL: ${sAmt.toLocaleString('en-US')} $${curProject.tick} for ~${receiveEstSell} ${quote} 📉`,
      time: nowTime().slice(0, 5),
      isTradeAlert: true,
      isUser: true,
      holding: Math.max(0, (currentHolding || 0) - sAmt),
    })

    toast.success(
      'Sell Order Executed! ✅',
      `Sold ${sAmt.toLocaleString('en-US')} $${curProject.tick} for ~${quote === 'USDG' ? '$' : ''}${receiveEstSell} ${quote}. Updated in Portfolio!`
    )
  }

  const handleLimitSubmit = () => {
    if (!limitPrice || limitPrice <= 0) {
      toast.error('Invalid Limit Price', 'Please enter a valid target limit price.')
      return
    }
    if (orderSide === 'BUY') {
      if (bAmt <= 0) {
        toast.error('Invalid Amount', 'Please enter an amount to buy.')
        return
      }
      if (bAmt > availableQuoteBalance) {
        toast.error('Insufficient Balance', `You only have ${formattedQuoteBalance} available.`)
        return
      }
      saveOpenOrder({
        id: `lim-${Date.now()}-${Math.floor(Date.now() % 10000)}`,
        pairId: curProject.id.toLowerCase(),
        tick: curProject.tick,
        side: 'BUY',
        type: 'LIMIT',
        limitPrice,
        amount: receiveEstBuy,
        totalQuote: bAmt,
        quoteAsset: quote,
        status: 'OPEN',
        createdAt: Date.now(),
        time: nowTime(),
        triggerCondition: limitPrice >= curProject.price ? 'GTE' : 'LTE',
        tpPrice: attachTpSl && calculatedTpPrice > 0 ? calculatedTpPrice : undefined,
        slPrice: attachTpSl && calculatedSlPrice > 0 ? calculatedSlPrice : undefined,
      })

      saveTrollboxMessage(curProject.id, {
        id: `order-placed-${Date.now()}`,
        pairId: curProject.id.toLowerCase(),
        sender: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '0x7a39...9F02',
        senderShort: address ? `You (${address.slice(0, 6)}...${address.slice(-4)})` : 'You (0x7a...9F02)',
        role: isCreator ? 'creator' : 'trader',
        text: `🎯 LIMIT BUY PLACED: ${receiveEstBuy.toLocaleString('en-US')} $${curProject.tick} target @ $${px7(limitPrice)}${attachTpSl ? ` (TP: $${px7(calculatedTpPrice)}, SL: $${px7(calculatedSlPrice)})` : ''}`,
        time: nowTime().slice(0, 5),
        isTradeAlert: true,
        isUser: true,
      })

      toast.success(
        'Limit Order Placed! 🎯',
        `Limit Buy for ${receiveEstBuy.toLocaleString('en-US')} $${curProject.tick} set at $${px7(limitPrice)}. Visual target line added to chart.`
      )
    } else {
      if (currentHolding <= 0) {
        toast.error('No Balance', `You do not hold any $${curProject.tick} to sell. Buy some first!`)
        return
      }
      if (sAmt <= 0) {
        toast.error('Invalid Amount', 'Please enter an amount to sell.')
        return
      }
      if (sAmt > currentHolding) {
        toast.error('Exceeds Balance', `You can only sell up to ${currentHolding} $${curProject.tick}.`)
        return
      }
      saveOpenOrder({
        id: `lim-${Date.now()}-${Math.floor(Date.now() % 10000)}`,
        pairId: curProject.id.toLowerCase(),
        tick: curProject.tick,
        side: 'SELL',
        type: 'LIMIT',
        limitPrice,
        amount: sAmt,
        totalQuote: +(sAmt * limitPrice).toFixed(4),
        quoteAsset: quote,
        status: 'OPEN',
        createdAt: Date.now(),
        time: nowTime(),
        triggerCondition: limitPrice <= curProject.price ? 'LTE' : 'GTE',
        tpPrice: attachTpSl && calculatedTpPrice > 0 ? calculatedTpPrice : undefined,
        slPrice: attachTpSl && calculatedSlPrice > 0 ? calculatedSlPrice : undefined,
      })

      saveTrollboxMessage(curProject.id, {
        id: `order-placed-${Date.now()}`,
        pairId: curProject.id.toLowerCase(),
        sender: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '0x7a39...9F02',
        senderShort: address ? `You (${address.slice(0, 6)}...${address.slice(-4)})` : 'You (0x7a...9F02)',
        role: isCreator ? 'creator' : 'holder',
        text: `🎯 LIMIT SELL PLACED: ${sAmt.toLocaleString('en-US')} $${curProject.tick} target @ $${px7(limitPrice)}`,
        time: nowTime().slice(0, 5),
        isTradeAlert: true,
        isUser: true,
      })

      toast.success(
        'Limit Order Placed! 🎯',
        `Limit Sell for ${sAmt.toLocaleString('en-US')} $${curProject.tick} set at $${px7(limitPrice)}. Visual target line added to chart.`
      )
    }
  }

  return {
    calculatedTpPrice,
    calculatedSlPrice,
    effectiveTpPct,
    effectiveSlPct,
    effectivePrice,
    curveBuyQuote,
    curveSellQuote,
    poolBuyQuote,
    poolSellQuote,
    receiveEstBuy,
    receiveEstSell,
    entryValueUsdg,
    projectedTpGainUsdg,
    projectedSlLossUsdg,
    riskRewardRatio,
    minReceivedBuy,
    minReceivedSell,
    quotePending,
    tokenLabel,
    quoteLabel,
    dynamicPriceImpact,
    formattedQuoteBalance,
    availableQuoteBalance,
    handleBuy,
    handleSell,
    handleLimitSubmit,
  }
}

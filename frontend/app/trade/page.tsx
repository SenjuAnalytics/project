'use client'

import { useState, useMemo, useEffect, use } from 'react'
import { useTheme } from '@/components/ui/ThemeProvider'
import { useToast } from '@/components/ui/Toast'
import { useAccount, useReadContract } from 'wagmi'
import type { Project } from '@/lib/data'
import { 
  getUserPositions, 
  type UserPosition, 
  getOpenOrders, 
  type LimitOrder 
} from '@/lib/storage'
import { erc20Abi, zeroAddress as ZERO_ADDRESS, formatUnits, type Address } from 'viem'
import { useTokenMarket, useTradeActions } from '@/lib/useQualyraTrade'
import { NATIVE_PAIR_ASSET } from '@/lib/contracts'
import { quoteToUsd } from '@/lib/pricing'
import { useTokenTrades, costBasisFor } from '@/lib/useTokenTrades'
import { useQueryClient } from '@tanstack/react-query'
import { cleanPriceNum } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { SentimentBar } from '@/components/trade/SentimentBar'
import { SharePnlModal } from '@/components/trade/SharePnlModal'
import { BondingCurveCard } from '@/components/trade/BondingCurveCard'
import { PairListDrawer } from '@/components/trade/PairListDrawer'
import { PairHeader } from '@/components/trade/PairHeader'
import { ChartSection } from '@/components/trade/ChartSection'
import { TradeTabsSection } from '@/components/trade/TradeTabsSection'
import { OrderExecutionCard } from '@/components/trade/OrderExecutionCard'
import { SlippageModal } from '@/components/trade/SlippageModal'
import { useSlippageSettings } from '@/hooks/trade/useSlippageSettings'
import { useOnchainHolders } from '@/hooks/trade/useOnchainHolders'
import { useOnchainTransfers } from '@/hooks/trade/useOnchainTransfers'
import { useAllProjects } from '@/hooks/useAllProjects'
import { useUserBalances } from '@/hooks/useUserBalances'
import { useNetworkSwitch } from '@/hooks/useNetworkSwitch'
import { useFavorites } from '@/hooks/useFavorites'
import { useTradeExecution } from '@/hooks/trade/useTradeExecution'
import type { TradeItem } from '@/lib/trade/types'

export default function TradePage({ searchParams }: { searchParams?: Promise<{ pair?: string; tab?: string }> }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const resolvedParams = searchParams ? use(searchParams) : undefined
  const initialPairId = (resolvedParams?.pair || 'pons').toLowerCase()
  // Limit and Bridge are not live yet, so every entry point opens Swap.
  const initialTab = 'MARKET' as const

  // Unified All Projects & Live Prices Hook (Single source of truth)
  const { projects, livePrices, priceTrends, setAuthoritativeFields } = useAllProjects()
  const [curPairId, setCurPairId] = useState<string>(initialPairId)
  const [leftOpen, setLeftOpen] = useState<boolean>(true)
  const [rightOpen, setRightOpen] = useState<boolean>(true)

  // Sync curPairId when searchParams pair changes
  const [prevParamPair, setPrevParamPair] = useState(resolvedParams?.pair)
  if (resolvedParams?.pair && resolvedParams.pair !== prevParamPair) {
    setPrevParamPair(resolvedParams.pair)
    setCurPairId(resolvedParams.pair.toLowerCase())
  }

  const [userPositions, setUserPositions] = useState<UserPosition[]>([])

  useEffect(() => {
    const syncPositions = () => {
      try {
        if (typeof getUserPositions === 'function') {
          setUserPositions(getUserPositions())
        }
      } catch (err) {
        console.error('Failed to sync user positions in trade page:', err)
      }
    }
    syncPositions()

    window.addEventListener('qualyra:trade-executed', syncPositions)
    window.addEventListener('qualyra:projects-updated', syncPositions)
    window.addEventListener('storage', syncPositions)
    return () => {
      window.removeEventListener('qualyra:trade-executed', syncPositions)
      window.removeEventListener('qualyra:projects-updated', syncPositions)
      window.removeEventListener('storage', syncPositions)
    }
  }, [])

  // Unified Balances & Network Switch Hooks
  const { balances, onchainEth, effectiveEthBalance } = useUserBalances()
  const { address } = useAccount()
  const {
    chainId,
    isWrongChain,
    isSwitchingChain,
    explorerBase,
    switchToRobinhoodChain: handleSwitchToRobinhoodChain,
  } = useNetworkSwitch()

  // Unified Favorites Hook
  const { favs, toggleFav } = useFavorites()

  // Mobile navigation tabs for screens <= 1180px
  const [mobileView, setMobileView] = useState<'chart' | 'trades' | 'markets'>('chart')
  const [pairFilter, setPairFilter] = useState<'all' | 'bonding' | 'graduated' | 'rwa' | 'mine' | 'fav'>('all')
  const [pairSearch, setPairSearch] = useState('')
  
  const [bAmt, setBAmt] = useState<number>(() => {
    return initialPairId === 'pons' || initialPairId === 'ai' ? 0.1 : 100
  })
  const [sAmt, setSAmt] = useState<number>(10)
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY')
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'BRIDGE'>(initialTab)
  const [limitPrice, setLimitPrice] = useState<number>(0)
  const [attachTpSl, setAttachTpSl] = useState<boolean>(false)
  const [tpPct, setTpPct] = useState<number>(25)
  const [slPct, setSlPct] = useState<number>(10)
  const [openOrders, setOpenOrders] = useState<LimitOrder[]>([])
  const [bTab, setBTab] = useState<'pos' | 'orders' | 'trades' | 'trollbox' | 'shield' | 'act' | 'hold'>('pos')
  const [chartTf, setChartTf] = useState<'1m' | '15m' | '1H' | '4H' | '1D'>('15m')
  const [chartMode, setChartMode] = useState<'candle' | 'line'>('candle')

  // Slippage tolerance, persisted per browser.
  const {
    slippage,
    customSlippage,
    setCustomSlippage,
    showSlippageModal,
    setShowSlippageModal,
    handleUpdateSlippage,
  } = useSlippageSettings()

  // TP/SL input states
  const [tpSlInputMode, setTpSlInputMode] = useState<'percent' | 'price'>('percent')
  const [customTpPrice, setCustomTpPrice] = useState<string>('')
  const [customSlPrice, setCustomSlPrice] = useState<string>('')

  // Sync tab from URL searchParams or custom event
  const [prevParamTab, setPrevParamTab] = useState(resolvedParams?.tab)
  if (resolvedParams?.tab && resolvedParams.tab !== prevParamTab) {
    setPrevParamTab(resolvedParams.tab)
    setOrderType('MARKET')
  }

  useEffect(() => {
    const handleSwitch = (e: Event) => {
      const tab = (e as CustomEvent<{ tab?: string }>).detail?.tab?.toUpperCase()
      if (tab === 'MARKET') setOrderType('MARKET')
    }
    window.addEventListener('qualyra:switch-trade-tab', handleSwitch)
    return () => window.removeEventListener('qualyra:switch-trade-tab', handleSwitch)
  }, [])


  // Sync Open Orders from storage
  useEffect(() => {
    const syncOrders = () => {
      try {
        if (typeof getOpenOrders === 'function') {
          setOpenOrders(getOpenOrders())
        }
      } catch (err) {
        console.error('Failed to sync open orders:', err)
      }
    }
    syncOrders()

    window.addEventListener('qualyra:orders-updated', syncOrders)
    window.addEventListener('qualyra:order-triggered', syncOrders)
    window.addEventListener('storage', syncOrders)
    return () => {
      window.removeEventListener('qualyra:orders-updated', syncOrders)
      window.removeEventListener('qualyra:order-triggered', syncOrders)
      window.removeEventListener('storage', syncOrders)
    }
  }, [])
  
  const { resolvedTheme } = useTheme()
  const chartTheme = (resolvedTheme === 'dark' ? 'dark' : 'light') as 'light' | 'dark'
  
  const [showGrid, setShowGrid] = useState<boolean>(true)
  const [hoverOhlc, setHoverOhlc] = useState<{
    open: number
    high: number
    low: number
    close: number
    volume?: number
  } | null>(null)

  const curProject = useMemo(() => {
    const q = curPairId.toLowerCase()
    const matchFn = (p: Project) => {
      const pid = p.id.toLowerCase()
      const ptick = p.tick.toLowerCase()
      const pclean = ptick.replace(/^r/, '')
      return pid === q || ptick === q || pclean === q
    }

    return projects.find(matchFn) || projects[0]
  }, [projects, curPairId])

  // Adapt default You Pay amount depending on quote asset (ETH vs NVDA vs USDG)
  const [prevQuoteAssetKey, setPrevQuoteAssetKey] = useState<string>('')
  const currentQuoteKey = `${curProject.id}_${curProject.quoteAsset || (curProject.status === 'bonding' ? 'ETH' : 'USDG')}`
  if (prevQuoteAssetKey !== currentQuoteKey) {
    setPrevQuoteAssetKey(currentQuoteKey)
    const q = curProject.quoteAsset || (curProject.status === 'bonding' ? 'ETH' : 'USDG')
    if (q === 'ETH') {
      setBAmt(prev => (prev > 10 ? 0.1 : prev || 0.1))
    } else if (q === 'NVDA') {
      setBAmt(prev => (prev > 10 ? 1.0 : prev || 1.0))
    } else {
      setBAmt(prev => (prev <= 1 ? 100 : prev || 100))
    }
  }

  // On-chain market for this token. Falls back to the simulated book when the token is not a Qualyra
  // token on the connected chain, which is what the demo listings are.
  const market = useTokenMarket(curProject.address as Address | undefined)
  const onChainTrade = useTradeActions(market)
  const isQualyraAddress = !!(
    curProject.address &&
    curProject.address.startsWith('0x') &&
    curProject.address !== ZERO_ADDRESS &&
    curProject.address !== NATIVE_PAIR_ASSET
  )
  const isOnchainListing = /^0x[0-9a-fA-F]{40}$/.test(curProject.id)
  const isQualyraLaunch = isOnchainListing && isQualyraAddress && (curProject.status === 'bonding' || curProject.status === 'graduated')
  const liveTrading = isQualyraLaunch || market.onChain

  // Real balances, read from the wallet rather than the simulated book.
  const { data: quoteBalanceRaw } = useReadContract({
    address: market.quoteAsset,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as Address],
    query: { enabled: liveTrading && !!address && !!market.quoteAsset && market.quoteAsset !== ZERO_ADDRESS },
  })

  const { data: tokenBalanceRaw } = useReadContract({
    address: curProject.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as Address],
    query: { enabled: liveTrading && !!address && !!curProject.address },
  })

  const onChainQuoteBalance = useMemo(() => {
    if (!liveTrading) return null
    if (market.quoteAsset === ZERO_ADDRESS) return onchainEth
    if (quoteBalanceRaw === undefined) return null
    return Number(formatUnits(quoteBalanceRaw as bigint, market.quoteDecimals))
  }, [liveTrading, market.quoteAsset, market.quoteDecimals, quoteBalanceRaw, onchainEth])

  const effectiveBalances = useMemo(() => {
    if (onChainQuoteBalance !== null) {
      if (market.quoteAsset === ZERO_ADDRESS) {
        return { ...balances, eth: onChainQuoteBalance }
      }
      return { ...balances, usdg: onChainQuoteBalance }
    }
    return balances
  }, [balances, onChainQuoteBalance, market.quoteAsset])

  const onChainHolding = useMemo(() => {
    if (!liveTrading || tokenBalanceRaw === undefined) return null
    return Number(formatUnits(tokenBalanceRaw as bigint, 18))
  }, [liveTrading, tokenBalanceRaw])

  const currentPosition = useMemo(() => {
    return userPositions.find(p => p.id.toLowerCase() === curProject.id.toLowerCase()) || null
  }, [userPositions, curProject.id])


  const currentHolding = useMemo(() => {
    if (onChainHolding !== null) return onChainHolding
    return currentPosition ? currentPosition.balance : 0
  }, [currentPosition, onChainHolding])

  const isCreator = useMemo(() => {
    return curProject.creator.includes('0x7a') || curProject.creator.includes('9F02')
  }, [curProject.creator])

  // Trade history straight from chain: curve events before graduation, pool swaps after.
  const chartBucketSeconds = useMemo(() => {
    switch (chartTf) {
      case '1m': return 60
      case '1H': return 3600
      case '4H': return 14400
      case '1D': return 86400
      default: return 900
    }
  }, [chartTf])

  const chainHistory = useTokenTrades(
    curProject.address as Address | undefined,
    market.curve,
    market.graduated,
    market.quoteDecimals,
    chartBucketSeconds,
  )

  const effectiveChainHistory = useMemo(() => ({
    ...chainHistory,
    isLoading: Boolean(market.isLoading || chainHistory.isLoading),
  }), [chainHistory, market.isLoading])

  // What this wallet paid, worked out from its own fills on chain. The stored positions are the
  // simulated ones; a wallet that traded here has its history in the events instead.
  const onChainBasis = useMemo(
    () => costBasisFor(chainHistory.trades, address),
    [chainHistory.trades, address],
  )

  /** Entry price for the chart's PnL line, and the size it applies to. */
  const chartPosition = useMemo(() => {
    // Below this many tokens a position counts as closed, so floating-point dust
    // left after selling out never keeps a stale "AVG ENTRY / PnL" line on the chart.
    const DUST = 1e-6
    if (liveTrading) {
      // The on-chain token balance is authoritative: once it has loaded (not null),
      // trust it exactly — including a real zero after a full sell. Only fall back to
      // the cost-basis amount while the balance is still loading, so a sold-out
      // position is never resurrected by a not-yet-refreshed trade history.
      const held = onChainHolding ?? onChainBasis.amount
      return onChainBasis.entry > 0 && held > DUST ? { entry: onChainBasis.entry, holding: held } : null
    }
    const bal = currentPosition?.balance ?? 0
    return currentPosition && bal > DUST ? { entry: currentPosition.entry, holding: bal } : null
  }, [liveTrading, onChainBasis, onChainHolding, currentPosition])

  // Fold what the events say back into the token being shown. A graduated curve reports a spot price of
  // zero because its funds moved to the pool, so there the last fill is the price. Volume and the 24h move
  // only exist once a token has traded, so they come from here rather than from the list.
  useEffect(() => {
    if (!liveTrading || !isOnchainListing || chainHistory.isLoading) return
    const id = curProject.id
    // A graduated curve reports a spot price of zero, so the last fill is the price. If that history has
    // not landed yet (lastPrice === 0), keep whatever the token already carries rather than dropping to
    // zero — otherwise "Price (Market)" blinks to nothing between polls.
    const price = market.graduated ? chainHistory.lastPrice || curProject.price : curProject.price
    if (market.graduated) {
      setAuthoritativeFields({
        id,
        price,
        mcap: quoteToUsd(price * 1_000_000_000, curProject.quoteAsset) ?? price * 1_000_000_000,
        vol24: quoteToUsd(chainHistory.volume24h, curProject.quoteAsset) ?? chainHistory.volume24h,
        chg: chainHistory.change24h,
      })
    } else {
      setAuthoritativeFields(null)
    }
  }, [
    liveTrading,
    market.graduated,
    chainHistory.lastPrice,
    chainHistory.volume24h,
    chainHistory.change24h,
    chainHistory.isLoading,
    curProject.id,
    curProject.price,
    curProject.quoteAsset,
    setAuthoritativeFields,
  ])

  // Authentic onchain trades from Robinhood Chain DEX pools
  const [trades, setTrades] = useState<TradeItem[]>([])
  const [tradesLoading, setTradesLoading] = useState<boolean>(true)

  // Fetch authentic onchain trades from Robinhood Chain DEX pools
  useEffect(() => {
    let isCancelled = false

    const loadRealTrades = async () => {
      // On chain the events are the source; the API stays for the demo listings only.
      if (liveTrading) {
        setTrades(
          chainHistory.trades
            .slice()
            .reverse()
            .slice(0, 50)
            .map((t, i) => ({
              id: `${t.txHash}-${i}`,
              txHash: t.txHash,
              price: t.price,
              priceQuote: t.price,
              amount: t.amount,
              totalQuote: t.quoteAmount,
              time: new Date(t.timestamp * 1000).toLocaleTimeString('en-US', { hour12: false }),
              timestamp: t.timestamp,
              isBuy: t.side === 'BUY',
              trader: t.trader,
            })),
        )
        return
      }
      try {
        const res = await fetch(`/api/trades?pair=${encodeURIComponent(curProject.id)}`)
        if (!res.ok) return
        const json = await res.json()
        if (!isCancelled && json.success && Array.isArray(json.trades)) {
          type RawTrade = TradeItem & { priceUsd?: number }
          const mapped: TradeItem[] = (json.trades as RawTrade[]).map((t: RawTrade) => ({
            id: t.id,
            txHash: t.txHash,
            price: t.priceQuote !== undefined ? t.priceQuote : (t.priceUsd ?? t.price),
            priceQuote: t.priceQuote,
            amount: t.amount,
            totalQuote: t.totalQuote,
            volumeUsd: t.volumeUsd,
            time: t.time,
            isBuy: t.isBuy,
            trader: t.trader,
            blockNumber: t.blockNumber,
          }))

          setTrades(mapped.slice(0, 50))
        }
      } catch (err) {
        console.warn('[Real Trades Fetch Error]:', err)
      } finally {
        if (!isCancelled) setTradesLoading(false)
      }
    }

    queueMicrotask(() => {
      if (!isCancelled) {
        setTradesLoading(true)
        loadRealTrades()
      }
    })
    const timer = setInterval(loadRealTrades, 15000)
    return () => {
      isCancelled = true
      clearInterval(timer)
    }
  }, [curProject.id, liveTrading, chainHistory.trades, chainHistory.isLoading])

  // Real on-chain holders and transfers.
  const { onchainHolders, totalHoldersCount, loadingHolders } = useOnchainHolders(
    curProject.address || curProject.id,
    true,
    chainId,
  )
  const { onchainTransfers, loadingTransfers } = useOnchainTransfers(
    curProject.address || curProject.id,
    bTab === 'act',
    chainId,
  )

  const filteredPairs = useMemo(() => {
    const q = pairSearch.toLowerCase()
    return projects.filter(p => {
      const match = p.tick.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      if (!match) return false
      if (pairFilter === 'bonding') return p.status === 'bonding' && !p.rwa
      if (pairFilter === 'graduated') return p.status === 'graduated' && (!p.rwa || p.rwaType === 'paired')
      if (pairFilter === 'rwa') return p.rwa === true
      if (pairFilter === 'mine') {
        const isCustom = typeof window !== 'undefined' && (() => {
          try {
            const raw = localStorage.getItem('qualyra_custom_projects')
            return raw ? JSON.parse(raw).some((cp: Project) => cp.id.toLowerCase() === p.id.toLowerCase()) : false
          } catch {
            return false
          }
        })()
        return isCustom || p.creator.includes('0x7a') || p.creator.includes('9F02')
      }
      if (pairFilter === 'fav') return favs.has(p.id)
      return true
    })
  }, [pairSearch, projects, pairFilter, favs])

  const isRwa = !!curProject.rwa
  const isRwaStock = !!curProject.rwa && curProject.rwaType !== 'paired'
  const isRwaPaired = !!curProject.rwa && curProject.rwaType === 'paired'
  const quote = curProject.quoteAsset || (curProject.status === 'bonding' ? 'ETH' : 'USDG')

  // Approximate USD value of 1 unit of quote asset
  const quoteUsdPrice = useMemo(() => {
    if (quote === 'ETH') return livePrices['eth']?.price || 2402.0
    if (quote === 'NVDA') return livePrices['nvda']?.price || 212.17
    return 1.0 // USDG / USD
  }, [quote, livePrices])

  // Seed limitPrice from the current price on a pair switch, and again the moment a price exists.
  const [prevLimitPairId, setPrevLimitPairId] = useState<string>('')
  if (curProject.id !== prevLimitPairId && curProject.price) {
    setPrevLimitPairId(curProject.id)
    setLimitPrice(cleanPriceNum(curProject.price))
  }

  const pairOpenOrders = useMemo(() => {
    return openOrders.filter(o => o.pairId.toLowerCase() === curProject.id.toLowerCase())
  }, [openOrders, curProject.id])

  // Unified Trade Execution Hook (Quotes, Slippage, Fills, Onchain submit, TP/SL, Trollbox & Limit Orders)
  const {
    calculatedTpPrice,
    calculatedSlPrice,
    effectiveTpPct,
    effectiveSlPct,
    effectivePrice,
    curveBuyQuote,
    receiveEstBuy,
    receiveEstSell,
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
    handleBuy,
    handleSell,
    handleLimitSubmit,
  } = useTradeExecution({
    curProject,
    market,
    onChainTrade,
    orderType,
    orderSide,
    bAmt,
    sAmt,
    limitPrice,
    slippage,
    balances: effectiveBalances,
    effectiveEthBalance,
    currentHolding,
    tokenBalanceRaw: tokenBalanceRaw as bigint | undefined,
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
  })


  return (
    <div className="trade-page-wrap">
      {/* Mobile Top Segmented View Switcher (<= 1180px) */}
      <div className="trade-mobile-nav">
        <button
          type="button"
          className={`tmn-btn ${mobileView === 'chart' ? 'active' : ''}`}
          onClick={() => setMobileView('chart')}
        >
          <span>📈</span> Chart & Trade
        </button>
        <button
          type="button"
          className={`tmn-btn ${mobileView === 'trades' ? 'active' : ''}`}
          onClick={() => {
            setMobileView('trades')
            setBTab('trades')
          }}
        >
          <span>📊</span> Book & Activity
        </button>
        <button
          type="button"
          className={`tmn-btn ${mobileView === 'markets' ? 'active' : ''}`}
          onClick={() => setMobileView('markets')}
        >
          <span>🔍</span> Markets ({projects.length})
        </button>
      </div>

      <div className="tgrid">
        {/* ================= LEFT COLUMN: PAIR LIST (DRAWER) ================= */}
        <PairListDrawer
          leftOpen={leftOpen}
          mobileView={mobileView}
          pairSearch={pairSearch}
          setPairSearch={setPairSearch}
          pairFilter={pairFilter}
          setPairFilter={setPairFilter}
          favs={favs}
          filteredPairs={filteredPairs}
          curPairId={curPairId}
          setCurPairId={setCurPairId}
          setMobileView={setMobileView}
          toggleFav={toggleFav}
          priceTrends={priceTrends}
          setLeftOpen={setLeftOpen}
          quoteUsdPrice={quoteUsdPrice}
          livePrices={livePrices}
        />

      {/* ================= CENTER COLUMN: CHART & ORDERS ================= */}
      <div
        className={`col-c ${mobileView === 'chart' ? 'mobile-show' : 'mobile-hide'}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          height: '100%',
          maxHeight: '100%',
          minHeight: 0,
          overflow: 'hidden',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
        }}
      >
        {/* Pair Header (Fixed, non-scrolling) */}
        <PairHeader
          curProject={curProject}
          quote={quote}
          quoteUsdPrice={quoteUsdPrice}
          explorerBase={explorerBase}
          favs={favs}
          toggleFav={toggleFav}
          priceTrends={priceTrends}
          trades={trades}
          setMobileView={setMobileView}
        />

        {/* Chart Bar & Canvas (Fixed upper zone, never scrolls away) */}
        <ChartSection
          chartMode={chartMode}
          setChartMode={setChartMode}
          showGrid={showGrid}
          setShowGrid={setShowGrid}
          chartTf={chartTf}
          setChartTf={setChartTf}
          hoverOhlc={hoverOhlc}
          setHoverOhlc={setHoverOhlc}
          curProject={curProject}
          liveTrading={liveTrading}
          isOnchainListing={isOnchainListing}
          chainHistory={effectiveChainHistory}
          quote={quote}
          quoteUsdPrice={quoteUsdPrice}
          chartTheme={chartTheme}
          chartPosition={chartPosition}
          openOrders={openOrders}
          orderType={orderType}
          limitPrice={limitPrice}
          attachTpSl={attachTpSl}
          calculatedTpPrice={calculatedTpPrice}
          calculatedSlPrice={calculatedSlPrice}
        />

        {/* Bottom Tabs with clean independent scrollable table */}
        <TradeTabsSection
          bTab={bTab}
          setBTab={setBTab}
          curProject={curProject}
          currentPosition={currentPosition}
          pairOpenOrders={pairOpenOrders}
          trades={trades}
          tradesLoading={tradesLoading}
          isRwa={isRwa}
          quote={quote}
          quoteUsdPrice={quoteUsdPrice}
          explorerBase={explorerBase}
          currentHolding={currentHolding}
          isCreator={isCreator}
          loadingTransfers={loadingTransfers}
          onchainTransfers={onchainTransfers}
          loadingHolders={loadingHolders}
          onchainHolders={onchainHolders}
          totalHoldersCount={totalHoldersCount}
          market={market}
        />
      </div>

      {/* ================= RIGHT COLUMN: ORDER FORM & BONDING CURVE (DRAWER) ================= */}
      <div className={`drawer-wrap right-drawer ${rightOpen ? 'open' : 'closed'} ${mobileView === 'markets' ? 'mobile-hide' : 'mobile-show'}`}>
        {/* Sleek Side Drawer Handle Button */}
        <button
          type="button"
          onClick={() => setRightOpen(prev => !prev)}
          className="drawer-toggle-btn right"
          title={rightOpen ? 'Close Order & Curve Drawer (▶)' : 'Open Order & Curve Drawer (◀)'}
          aria-label={rightOpen ? 'Close Order Drawer' : 'Open Order Drawer'}
        >
          {rightOpen ? <ChevronRight size={9} strokeWidth={2.6} /> : <ChevronLeft size={9} strokeWidth={2.6} />}
        </button>

        <div className="drawer-inner">
          <div className="col-r">
            {/* Unified Order Form (Pro Tier-1 Trading Card) */}
            <OrderExecutionCard
              mobileView={mobileView}
              orderType={orderType}
              setOrderType={setOrderType}
              orderSide={orderSide}
              setOrderSide={setOrderSide}
              isRwaStock={isRwaStock}
              isRwaPaired={isRwaPaired}
              curProject={curProject}
              quote={quote}
              quoteUsdPrice={quoteUsdPrice}
              slippage={slippage}
              setShowSlippageModal={setShowSlippageModal}
              limitPrice={limitPrice}
              setLimitPrice={setLimitPrice}
              effectiveEthBalance={effectiveEthBalance}
              balances={effectiveBalances}
              currentHolding={currentHolding}
              onchainEth={onchainEth}
              formattedQuoteBalance={formattedQuoteBalance}
              bAmt={bAmt}
              setBAmt={setBAmt}
              sAmt={sAmt}
              setSAmt={setSAmt}
              isRwa={isRwa}
              attachTpSl={attachTpSl}
              setAttachTpSl={setAttachTpSl}
              tpSlInputMode={tpSlInputMode}
              setTpSlInputMode={setTpSlInputMode}
              customTpPrice={customTpPrice}
              setCustomTpPrice={setCustomTpPrice}
              calculatedTpPrice={calculatedTpPrice}
              customSlPrice={customSlPrice}
              setCustomSlPrice={setCustomSlPrice}
              calculatedSlPrice={calculatedSlPrice}
              effectiveTpPct={effectiveTpPct}
              tpPct={tpPct}
              setTpPct={setTpPct}
              effectiveSlPct={effectiveSlPct}
              slPct={slPct}
              setSlPct={setSlPct}
              effectivePrice={effectivePrice}
              projectedTpGainUsdg={projectedTpGainUsdg}
              projectedSlLossUsdg={projectedSlLossUsdg}
              riskRewardRatio={riskRewardRatio}
              quotePending={quotePending}
              receiveEstBuy={receiveEstBuy}
              receiveEstSell={receiveEstSell}
              tokenLabel={tokenLabel}
              quoteLabel={quoteLabel}
              liveTrading={liveTrading}
              minReceivedBuy={minReceivedBuy}
              minReceivedSell={minReceivedSell}
              curveBuyQuote={curveBuyQuote}
              dynamicPriceImpact={dynamicPriceImpact}
              isWrongChain={isWrongChain}
              chainId={chainId}
              handleSwitchToRobinhoodChain={handleSwitchToRobinhoodChain}
              isSwitchingChain={isSwitchingChain}
              market={market}
              onChainTrade={onChainTrade}
              handleLimitSubmit={handleLimitSubmit}
              handleBuy={handleBuy}
              handleSell={handleSell}
            />


            <BondingCurveCard
              curProject={curProject}
              chainLastPrice={chainHistory.lastPrice}
              explorerBase={explorerBase}
              isRwaStock={isRwaStock}
              quote={quote}
              mobileView={mobileView}
            />

            {/* Community Sentiment Card */}
            <div className={`trade-sentiment-wrap ${mobileView === 'chart' ? 'mobile-card-hidden' : ''}`}>
              <SentimentBar />
            </div>
          </div>
        </div>
      </div>
      <SharePnlModal />

      {showSlippageModal && (
        <SlippageModal
          slippage={slippage}
          customSlippage={customSlippage}
          setCustomSlippage={setCustomSlippage}
          setShowSlippageModal={setShowSlippageModal}
          handleUpdateSlippage={handleUpdateSlippage}
        />
      )}
    </div>
    </div>
  )
}

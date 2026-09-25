'use client'

import React, { Dispatch, SetStateAction, useState } from 'react'
import dynamic from 'next/dynamic'
import type { Project } from '@/lib/data'
import type { LimitOrder } from '@/lib/storage'
import type { ChainCandle } from '@/components/trade/CandleChart'
import { fmtUsd, px7 } from '@/lib/utils'

const CandleChart = dynamic(
  () => import('@/components/trade/CandleChart').then(mod => mod.CandleChart),
  { ssr: false, loading: () => <div style={{ height: '420px', background: 'var(--inset)' }} /> }
)

interface OhlcItem {
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

interface ChartSectionProps {
  chartMode: 'candle' | 'line'
  setChartMode: Dispatch<SetStateAction<'candle' | 'line'>>
  showGrid: boolean
  setShowGrid: Dispatch<SetStateAction<boolean>>
  chartTf: '1m' | '15m' | '1H' | '4H' | '1D'
  setChartTf: Dispatch<SetStateAction<'1m' | '15m' | '1H' | '4H' | '1D'>>
  hoverOhlc: OhlcItem | null
  setHoverOhlc: Dispatch<SetStateAction<OhlcItem | null>>
  curProject: Project
  liveTrading: boolean
  isOnchainListing: boolean
  chainHistory: { candles?: ChainCandle[]; isLoading?: boolean; graduatedTimestamp?: number | null }
  quote: string
  quoteUsdPrice?: number
  chartTheme: 'dark' | 'light'
  chartPosition: { entry: number; holding: number } | null
  openOrders: LimitOrder[]
  orderType: 'MARKET' | 'LIMIT' | 'BRIDGE'
  limitPrice: number
  attachTpSl: boolean
  calculatedTpPrice: number
  calculatedSlPrice: number
}

/** Upper center column section containing the chart mode/timeframe toolbar and CandleChart. */
export function ChartSection({
  chartMode,
  setChartMode,
  showGrid,
  setShowGrid,
  chartTf,
  setChartTf,
  hoverOhlc,
  setHoverOhlc,
  curProject,
  liveTrading,
  isOnchainListing,
  chainHistory,
  quote,
  quoteUsdPrice,
  chartTheme,
  chartPosition,
  openOrders,
  orderType,
  limitPrice,
  attachTpSl,
  calculatedTpPrice,
  calculatedSlPrice,
}: ChartSectionProps) {
  const [chartCurrency, setChartCurrency] = useState<'USD' | 'QUOTE'>('USD')
  const isUsdNative = quote === 'USDG' || quote === 'USD' || quote === 'USDC'
  const isUsdMode = chartCurrency === 'USD' || isUsdNative
  const effectiveQuoteUsd = (quoteUsdPrice && quoteUsdPrice > 0) ? quoteUsdPrice : (quote === 'ETH' ? 2400 : 1)
  const isChainToken = /^0x[0-9a-fA-F]{40}$/.test(curProject.id)

  // Migration ("graduation") target: the price at which a bonding-curve token
  // migrates to a DEX pool. Exact when the curve exposes it (graduationPrice),
  // else a simple progress-based estimate so the cue still shows.
  const isGraduated = !curProject.rwa && (curProject.status === 'graduated' || curProject.progress >= 100 || Boolean(curProject.poolAddress))
  const isBondingOrGraduated = !curProject.rwa && (curProject.status === 'bonding' || isGraduated)

  const migrationTargetPrice = isBondingOrGraduated && isChainToken
    ? (curProject.graduationPrice && curProject.graduationPrice > 0
        ? curProject.graduationPrice
        : (curProject.price > 0
            ? (isGraduated ? curProject.price : (curProject.progress > 0 ? curProject.price * (100 / curProject.progress) : null))
            : null))
    : null
  const migrationProgress = isGraduated ? 100 : curProject.progress

  // Fallback OHLC values in active currency
  const rawPriceUsd = isChainToken ? curProject.price * (isUsdNative ? 1 : effectiveQuoteUsd) : curProject.price
  const rawPriceQuote = isChainToken ? curProject.price : (isUsdNative ? curProject.price : curProject.price / effectiveQuoteUsd)
  const fallbackPrice = isUsdMode ? rawPriceUsd : rawPriceQuote

  const rawLoUsd = isChainToken ? curProject.lo * (isUsdNative ? 1 : effectiveQuoteUsd) : curProject.lo
  const rawLoQuote = isChainToken ? curProject.lo : (isUsdNative ? curProject.lo : curProject.lo / effectiveQuoteUsd)
  const fallbackLo = isUsdMode ? rawLoUsd : rawLoQuote

  const rawHiUsd = isChainToken ? curProject.hi * (isUsdNative ? 1 : effectiveQuoteUsd) : curProject.hi
  const rawHiQuote = isChainToken ? curProject.hi : (isUsdNative ? curProject.hi : curProject.hi / effectiveQuoteUsd)
  const fallbackHi = isUsdMode ? rawHiUsd : rawHiQuote

  const pricePrefix = isUsdMode ? '$' : ''
  const priceSuffix = isUsdMode ? '' : ` ${quote}`

  return (
    <div style={{ background: 'var(--panel)', borderBottom: '1px solid var(--line)', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="chartbar" style={{ display: 'flex', alignItems: 'center', padding: '6px 12px' }}>
        {/* Chart Mode Toggles */}
        <div style={{ display: 'flex', gap: '4px', marginRight: '16px', borderRight: '1px solid var(--line)', paddingRight: '16px' }}>
          <button
            type="button"
            className={chartMode === 'candle' ? 'active' : ''}
            onClick={() => setChartMode('candle')}
            title="Candlestick Chart"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5v4m0 6v4m6-12v2m0 6v6M6 9h6v6H6zm6-4h6v6h-6z" />
            </svg>
            Candles
          </button>
          <button
            type="button"
            className={chartMode === 'line' ? 'active' : ''}
            onClick={() => setChartMode('line')}
            title="Line Chart (Area)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 18l6-6 4 4 8-8" />
            </svg>
            Line
          </button>
          <button
            type="button"
            className={showGrid ? 'active' : ''}
            onClick={() => setShowGrid(g => !g)}
            title="Toggle Grid Lines"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            Grid
          </button>
        </div>

        {(['1m', '15m', '1H', '4H', '1D'] as const).map(tf => (
          <button
            key={tf}
            type="button"
            className={chartTf === tf ? 'active' : ''}
            onClick={() => setChartTf(tf)}
          >
            {tf}
          </button>
        ))}

        {/* Currency Toggle (USD vs Native Quote, e.g. ETH) */}
        {!isUsdNative && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'var(--panel2)',
              borderRadius: '5px',
              padding: '2px',
              border: '1px solid var(--line)',
              marginLeft: '8px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '3px',
                border: 'none',
                cursor: 'pointer',
                background: chartCurrency === 'USD' ? 'var(--brand)' : 'transparent',
                color: chartCurrency === 'USD' ? '#111311' : 'var(--dim)',
                transition: 'all 0.15s ease',
              }}
              onClick={() => setChartCurrency('USD')}
              title="Display chart prices in US Dollars ($)"
            >
              USD
            </button>
            <button
              type="button"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '3px',
                border: 'none',
                cursor: 'pointer',
                background: chartCurrency === 'QUOTE' ? 'var(--brand)' : 'transparent',
                color: chartCurrency === 'QUOTE' ? '#111311' : 'var(--dim)',
                transition: 'all 0.15s ease',
              }}
              onClick={() => setChartCurrency('QUOTE')}
              title={`Display chart prices in native ${quote}`}
            >
              {quote}
            </button>
          </div>
        )}

        <span className="ohlc" style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--dim)', display: 'flex', gap: '8px' }}>
          {hoverOhlc ? (
            <>
              <span>O <b style={{ color: 'var(--tx)' }}>{pricePrefix}{px7(hoverOhlc.open)}{priceSuffix}</b></span>
              <span>H <b style={{ color: 'var(--tx)' }}>{pricePrefix}{px7(hoverOhlc.high)}{priceSuffix}</b></span>
              <span>L <b style={{ color: 'var(--tx)' }}>{pricePrefix}{px7(hoverOhlc.low)}{priceSuffix}</b></span>
              <span>C <b style={{ color: hoverOhlc.close >= hoverOhlc.open ? 'var(--green)' : 'var(--red)' }}>{pricePrefix}{px7(hoverOhlc.close)}{priceSuffix}</b></span>
              <span>Vol <b style={{ color: 'var(--tx)' }}>{hoverOhlc.volume ? fmtUsd(hoverOhlc.volume) : fmtUsd(curProject.vol24)}</b></span>
            </>
          ) : (
            <>
              <span>O <b style={{ color: 'var(--tx)' }}>{pricePrefix}{px7(fallbackLo * 1.01)}{priceSuffix}</b></span>
              <span>H <b style={{ color: 'var(--tx)' }}>{pricePrefix}{px7(fallbackHi)}{priceSuffix}</b></span>
              <span>L <b style={{ color: 'var(--tx)' }}>{pricePrefix}{px7(fallbackLo)}{priceSuffix}</b></span>
              <span>C <b style={{ color: 'var(--green)' }}>{pricePrefix}{px7(fallbackPrice)}{priceSuffix}</b></span>
              <span>Vol <b style={{ color: 'var(--tx)' }}>{fmtUsd(curProject.vol24)}</b></span>
            </>
          )}
        </span>
      </div>

      {/* Chart Rendering */}
      <div style={{ padding: '0', background: 'var(--panel)', height: 'clamp(420px, 52vh, 560px)', position: 'relative' }}>
        <CandleChart 
          project={curProject} 
          candles={liveTrading && isOnchainListing ? chainHistory.candles : undefined}
          priceUnit={quote}
          chartCurrency={chartCurrency}
          quoteUsdPrice={effectiveQuoteUsd}
          timeframe={chartTf} 
          chartMode={chartMode}
          chartTheme={chartTheme}
          showGrid={showGrid}
          userEntryPrice={chartPosition?.entry ?? null}
          userHolding={chartPosition?.holding ?? 0}
          openOrders={openOrders}
          activeLimitPrice={orderType === 'LIMIT' && limitPrice > 0 ? limitPrice : null}
          activeTpPrice={attachTpSl && calculatedTpPrice > 0 ? calculatedTpPrice : null}
          activeSlPrice={attachTpSl && calculatedSlPrice > 0 ? calculatedSlPrice : null}
          migrationTargetPrice={migrationTargetPrice}
          migrationProgress={migrationProgress}
          isGraduated={isGraduated}
          graduatedTimestamp={chainHistory.graduatedTimestamp ?? curProject.graduatedAt ?? null}
          isLoading={liveTrading && isOnchainListing ? Boolean(chainHistory.isLoading) : false}
          onCrosshairMove={setHoverOhlc} 
        />
      </div>
    </div>
  )
}

'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  AreaSeries,
  HistogramSeries,
  ColorType,
  IChartApi,
  ISeriesApi,
  Time,
  CandlestickData,
  HistogramData,
  LineData,
  IPriceLine,
  LineStyle,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesType,
  IChartApiBase,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas'
import { Activity } from 'lucide-react'
import { Project } from '@/lib/data'
import { LimitOrder } from '@/lib/storage'
import { formatPercent, cleanPrice, formatPriceWithUnit, priceMinMove } from '@/lib/formatters'

/** One bar, as the on-chain trade history produces them. */
export type ChainCandle = { time: number; open: number; high: number; low: number; close: number; volume: number }

interface CandleChartProps {
  project: Project
  /**
   * Bars built from chain events. When present these are the chart, and the demo candle API is never
   * called — an empty array means the token has not traded yet, which is a real answer, not a gap.
   */
  candles?: ChainCandle[]
  /** What the pair is quoted in. A curve priced in ETH should not be labelled in dollars. */
  priceUnit?: string
  /** Active chart display currency ('USD' or native quote asset 'QUOTE'). */
  chartCurrency?: 'USD' | 'QUOTE'
  /** Live USD price of 1 quote unit (e.g. ~$2,400 for ETH). */
  quoteUsdPrice?: number
  timeframe: string
  chartMode?: 'candle' | 'line'
  chartTheme?: 'light' | 'dark'
  showGrid?: boolean
  userEntryPrice?: number | null
  userHolding?: number
  openOrders?: LimitOrder[]
  activeLimitPrice?: number | null
  activeTpPrice?: number | null
  activeSlPrice?: number | null
  /** Bonding-curve graduation price; draws the "migrate" target line + rocket icon. Null hides it. */
  migrationTargetPrice?: number | null
  /** Bonding-curve progress 0-100, shown in the migrate label. */
  migrationProgress?: number
  /** True when the token has graduated / migrated to DEX pool. */
  isGraduated?: boolean
  /** Timestamp in seconds when the token graduated and migrated to DEX pool. */
  graduatedTimestamp?: number | null
  /** Whether chart candles or chain events are currently loading/fetching. */
  isLoading?: boolean
  onCrosshairMove?: (bar: { open: number; high: number; low: number; close: number; volume?: number } | null) => void
}

// Mirrors the interval logic in app/api/candles/route.ts so the live-updating
// bar rolls into a new candle at the same boundary the historical data uses.
function timeframeToSeconds(tf: string): number {
  switch (tf) {
    case '1m': return 60
    case '15m': return 900
    case '1H': return 3600
    case '4H': return 14400
    case '1D': return 86400
    default: return 900
  }
}

function getPnlLineOptions(
  entryPrice: number,
  currentPrice: number,
  holding: number,
  priceUnit: string = '$',
) {
  const pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100
  const isProfit = pnlPct >= 0
  const pnlStr = formatPercent(pnlPct)
  const pnlVal = (currentPrice - entryPrice) * holding
  const pnlValStr = priceUnit === '$'
    ? `${isProfit ? '+' : ''}$${pnlVal.toFixed(2)}`
    : `${isProfit ? '+' : ''}${pnlVal.toFixed(4)} ${priceUnit}`
  const title = holding > 0
    ? `ENTRY · ${pnlStr} (${pnlValStr})`
    : 'ENTRY'

  return {
    price: entryPrice,
    color: isProfit ? '#089981' : '#DC2626',
    lineWidth: 1 as const,
    lineStyle: LineStyle.Dashed,
    axisLabelVisible: true,
    title,
    axisLabelColor: isProfit ? '#089981' : '#DC2626',
    axisLabelTextColor: '#FFFFFF',
  }
}

/**
 * Ensures a continuous, professional candlestick series across time without missing buckets.
 * Fills in the historical baseline (90-120 bars) and carry-forward intervals so the x-axis
 * displays a complete, rich timeline of dates and hours (like DexScreener/TradingView).
 */
function buildContinuousCandles(
  rawBars: ChainCandle[] | undefined,
  timeframe: string,
  basePrice: number,
): ChainCandle[] {
  const intervalSec = timeframeToSeconds(timeframe)
  const nowSec = Math.floor(Date.now() / 1000)
  const currentBucket = Math.floor(nowSec / intervalSec) * intervalSec

  let minBars = 96
  if (timeframe === '1m') minBars = 90
  else if (timeframe === '15m') minBars = 120
  else if (timeframe === '1H') minBars = 96
  else if (timeframe === '4H') minBars = 72
  else if (timeframe === '1D') minBars = 60

  const validBars = (rawBars || []).filter(
    b => b && Number.isFinite(b.time) && b.time > 0 && Number.isFinite(b.close) && b.close > 0
  )
  validBars.sort((a, b) => a.time - b.time)

  const effectiveBasePrice = basePrice > 0 ? basePrice : validBars.length > 0 ? validBars[validBars.length - 1].close : 0.0001
  const cleanEffectiveBase = cleanPrice(effectiveBasePrice)

  // Case A: Token has not traded yet (0 trades)
  // Show a clean, authentic flat baseline anchored at the listing/curve price
  if (validBars.length === 0) {
    const startBucket = currentBucket - minBars * intervalSec
    const continuous: ChainCandle[] = []
    for (let t = startBucket; t <= currentBucket; t += intervalSec) {
      continuous.push({
        time: t,
        open: cleanEffectiveBase,
        high: cleanEffectiveBase,
        low: cleanEffectiveBase,
        close: cleanEffectiveBase,
        volume: 0,
      })
    }
    return continuous
  }

  // Case B: Token has real trades on chain
  const firstTradeBucket = Math.floor(validBars[0].time / intervalSec) * intervalSec
  let startBucket = firstTradeBucket

  const MAX_BARS = 600
  if (currentBucket - startBucket > MAX_BARS * intervalSec) {
    startBucket = currentBucket - MAX_BARS * intervalSec
  }

  const realBarsByBucket = new Map<number, ChainCandle>()
  for (const b of validBars) {
    const bucket = Math.floor(b.time / intervalSec) * intervalSec
    const existing = realBarsByBucket.get(bucket)
    if (existing) {
      existing.high = Math.max(existing.high, b.high)
      existing.low = Math.min(existing.low, b.low)
      existing.close = b.close
      existing.volume += (b.volume || 0)
    } else {
      realBarsByBucket.set(bucket, {
        time: bucket,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume || 0,
      })
    }
  }

  const continuous: ChainCandle[] = []
  let prevClose = validBars[0].open > 0 ? validBars[0].open : cleanEffectiveBase

  for (let t = startBucket; t <= currentBucket; t += intervalSec) {
    if (realBarsByBucket.has(t)) {
      const real = realBarsByBucket.get(t)!
      const open = prevClose > 0 ? prevClose : real.open
      const close = real.close
      const high = Math.max(open, close, real.high)
      const low = Math.min(open, close, real.low)
      continuous.push({
        time: t,
        open: cleanPrice(open),
        high: cleanPrice(high),
        low: cleanPrice(low),
        close: cleanPrice(close),
        volume: real.volume,
      })
      prevClose = close
    } else {
      // Clean carry-forward of previous close without gaps or random walk drift
      continuous.push({
        time: t,
        open: cleanPrice(prevClose),
        high: cleanPrice(prevClose),
        low: cleanPrice(prevClose),
        close: cleanPrice(prevClose),
        volume: 0,
      })
    }
  }

  // Smoothly update the current bucket if latest spot price is available
  if (continuous.length > 0 && basePrice > 0 && !realBarsByBucket.has(currentBucket)) {
    const lastBar = continuous[continuous.length - 1]
    const cleanSpot = cleanPrice(basePrice)
    lastBar.close = cleanSpot
    lastBar.high = Math.max(lastBar.high, cleanSpot)
    lastBar.low = Math.min(lastBar.low, cleanSpot)
  }

  return continuous
}

class MigrationMarkerPrimitive implements ISeriesPrimitive<Time> {
  private _chart: IChartApiBase<Time> | null = null
  private _series: ISeriesApi<SeriesType, Time> | null = null
  private _requestUpdate: (() => void) | null = null
  private _time: Time | null = null
  private _highPrice: number | null = null

  attached(param: SeriesAttachedParameter<Time, SeriesType>) {
    this._chart = param.chart
    this._series = param.series
    this._requestUpdate = param.requestUpdate
  }

  detached() {
    this._chart = null
    this._series = null
    this._requestUpdate = null
  }

  setData(time: Time | null, highPrice: number | null) {
    if (this._time === time && this._highPrice === highPrice) return
    this._time = time
    this._highPrice = highPrice
    this._requestUpdate?.()
  }

  paneViews(): readonly IPrimitivePaneView[] {
    if (!this._time || this._highPrice === null) return []

    const time = this._time
    const highPrice = this._highPrice
    const chart = this._chart
    const series = this._series

    return [
      {
        zOrder: () => 'top' as const,
        renderer: (): IPrimitivePaneRenderer => ({
          draw: (target: CanvasRenderingTarget2D) => {
            if (!chart || !series) return
            target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
              const { context: ctx, horizontalPixelRatio: hpr, verticalPixelRatio: vpr } = scope
              const x = chart.timeScale().timeToCoordinate(time)
              if (x === null || !Number.isFinite(x)) return
              const y = series.priceToCoordinate(highPrice)
              if (y === null || !Number.isFinite(y)) return

              const cx = Math.round(x * hpr)
              const cy = Math.round((y - 14) * vpr)
              const radius = Math.round(9.5 * hpr)

              // 1. Draw circular badge (GMGN Style)
              ctx.save()
              ctx.beginPath()
              ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
              ctx.fillStyle = '#F59E0B' // GMGN Amber
              ctx.fill()
              ctx.lineWidth = Math.max(1, 1.5 * hpr)
              ctx.strokeStyle = '#FFFFFF'
              ctx.stroke()

              // 2. Draw "M" centered directly inside the circle
              ctx.fillStyle = '#111311'
              ctx.font = `bold ${Math.round(10 * hpr)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText('M', cx, cy + 0.5 * vpr)
              ctx.restore()
            })
          },
        }),
      },
    ]
  }
}

function CandleChartImpl({
  project,
  candles,
  priceUnit = '$',
  chartCurrency = 'USD',
  quoteUsdPrice,
  timeframe,
  chartMode = 'candle',
  chartTheme = 'light',
  showGrid = true,
  userEntryPrice,
  userHolding = 0,
  openOrders = [],
  activeLimitPrice,
  activeTpPrice,
  activeSlPrice,
  migrationTargetPrice,
  migrationProgress,
  isGraduated,
  graduatedTimestamp,
  isLoading = false,
  onCrosshairMove,
}: CandleChartProps) {
  const [apiLoading, setApiLoading] = useState(false)
  const [chartLoadedKey, setChartLoadedKey] = useState<string>('')

  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const mainSeriesRef = useRef<ISeriesApi<'Candlestick'> | ISeriesApi<'Area'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const priceLineRef = useRef<IPriceLine | null>(null)
  const latestCandleRef = useRef<CandlestickData<Time> | null>(null)
  /** Set by the mount effect so the data effect can re-fit the price scale without rebuilding anything. */
  const fitPriceScaleRef = useRef<((values: number[]) => void) | null>(null)
  /** Which pair and timeframe the viewport was last snapped for. */
  const viewKeyRef = useRef<string>('')

  // Map to store persistent open order lines (key = order.id)
  const orderLinesRef = useRef<Map<string, IPriceLine>>(new Map())
  const previewLimitRef = useRef<IPriceLine | null>(null)
  const previewTpRef = useRef<IPriceLine | null>(null)
  const previewSlRef = useRef<IPriceLine | null>(null)
  const migrationLineRef = useRef<IPriceLine | null>(null)
  const markerPrimitiveRef = useRef<MigrationMarkerPrimitive | null>(null)
  const allBarsRef = useRef<CandlestickData<Time>[]>([])
  const updateMigrationMarkerRef = useRef<((bars: CandlestickData<Time>[]) => void) | null>(null)

  // Dual Currency Configuration (GMGN-Style)
  const isChainToken = /^0x[0-9a-fA-F]{40}$/.test(project.id)
  const isUsdNative = priceUnit === '$' || priceUnit === 'USD' || priceUnit === 'USDG' || priceUnit === 'USDC'
  const isUsdMode = chartCurrency === 'USD' || isUsdNative
  const effectiveQuoteUsd = (quoteUsdPrice && quoteUsdPrice > 0) ? quoteUsdPrice : (priceUnit === 'ETH' ? 2400 : 1)
  // For onchain curve tokens (0x...), raw bars and spot prices are in quote asset (e.g. ETH).
  // For showcase/RWA tokens (pons, ai, nvda), raw bars from /api/candles and project.price are already in USD.
  const effectiveMultiplier = isChainToken
    ? ((isUsdMode && !isUsdNative) ? effectiveQuoteUsd : 1)
    : (isUsdMode ? 1 : (1 / effectiveQuoteUsd))
  const effectiveUnit = isUsdMode ? '$' : priceUnit

  const chartDataKey = `${project.id}|${timeframe}|${chartCurrency}`
  const isInitialLoad = chartLoadedKey !== chartDataKey
  const isDataLoading = isInitialLoad && Boolean(
    isLoading || (candles === undefined && apiLoading) || (candles !== undefined && (isLoading || candles.length === 0))
  )

  const latestPriceRef = useRef(project.price)
  const effectiveMultiplierRef = useRef(effectiveMultiplier)
  const fmtPrice = useCallback((p: number) => formatPriceWithUnit(p, effectiveUnit), [effectiveUnit])
  const fmtPriceRef = useRef(fmtPrice)

  useEffect(() => {
    latestPriceRef.current = project.price
    effectiveMultiplierRef.current = effectiveMultiplier
    fmtPriceRef.current = fmtPrice
  }, [project.price, effectiveMultiplier, fmtPrice])

  useEffect(() => {
    if (!containerRef.current) return

    const isDark = chartTheme === 'dark'
    const bgColors = {
      bg: isDark ? '#111311' : '#FAFAFA',
      text: isDark ? '#A3A8A3' : '#6E7869',
      grid: isDark ? '#2A302A' : '#F0F2EC',
      border: isDark ? '#363D36' : '#DCE0D5',
      textHigh: isDark ? '#EAEBE6' : '#161A14',
      crosshairLine: isDark ? '#535953' : '#A9B09F',
      crosshairLabelBg: isDark ? '#2A302A' : '#161A14'
    }

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bgColors.bg },
        textColor: bgColors.text,
        fontSize: 11,
      },
      localization: {
        priceFormatter: (p: number) => fmtPriceRef.current(p),
      },
      grid: {
        vertLines: { visible: showGrid, color: bgColors.grid },
        horzLines: { visible: showGrid, color: bgColors.grid },
      },
      crosshair: {
        vertLine: { color: bgColors.crosshairLine, width: 1, style: 3, labelBackgroundColor: bgColors.crosshairLabelBg },
        horzLine: { color: bgColors.crosshairLine, width: 1, style: 3, labelBackgroundColor: bgColors.crosshairLabelBg },
      },
      rightPriceScale: {
        borderColor: bgColors.border,
        textColor: bgColors.textHigh,
        autoScale: true,
        scaleMargins: { top: 0.08, bottom: 0.05 },
      },
      timeScale: {
        borderColor: bgColors.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 7,
        minBarSpacing: 2,
      },
    })
    chartRef.current = chart

    const nonNegativeAutoscale = (original: () => { priceRange: { minValue: number; maxValue: number }; margins?: unknown } | null) => {
      const res = original()
      if (res !== null) {
        res.priceRange.minValue = Math.max(0, res.priceRange.minValue)
      }
      return res
    }

    let mainSeries: ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>
    if (chartMode === 'candle') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#089981',
        downColor: '#F23645',
        borderVisible: true,
        borderUpColor: '#089981',
        borderDownColor: '#F23645',
        wickUpColor: '#089981',
        wickDownColor: '#F23645',
        autoscaleInfoProvider: nonNegativeAutoscale,
        // Replaced by fitPriceScale as soon as the bars are known; see priceMinMove.
        priceFormat: { type: 'custom', minMove: priceMinMove([(project.price || 0) * effectiveMultiplier]), formatter: (p: number) => fmtPriceRef.current(p) },
      })
    } else {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: '#AED43C',
        topColor: isDark ? 'rgba(174, 212, 60, 0.25)' : 'rgba(174, 212, 60, 0.4)',
        bottomColor: 'rgba(174, 212, 60, 0.0)',
        lineWidth: 2,
        autoscaleInfoProvider: nonNegativeAutoscale,
        // Replaced by fitPriceScale as soon as the bars are known; see priceMinMove.
        priceFormat: { type: 'custom', minMove: priceMinMove([(project.price || 0) * effectiveMultiplier]), formatter: (p: number) => fmtPriceRef.current(p) },
      })
    }
    mainSeriesRef.current = mainSeries

    const fitPriceScale = (values: number[]) => {
      mainSeries.applyOptions({
        priceFormat: { type: 'custom', minMove: priceMinMove(values), formatter: (p: number) => fmtPriceRef.current(p) },
      })
    }
    fitPriceScaleRef.current = fitPriceScale

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    })
    volumeSeriesRef.current = volumeSeries


    // Setup Entry Position Line (Real User Entry)
    const effectiveEntry = userEntryPrice && userHolding > 0 ? (userEntryPrice * effectiveMultiplier) : null
    const displayProjectPrice = (project.price || 0) * effectiveMultiplier

    if (effectiveEntry) {
      priceLineRef.current = mainSeries.createPriceLine(
        getPnlLineOptions(effectiveEntry, displayProjectPrice, userHolding, effectiveUnit)
      )
    } else {
      priceLineRef.current = null
    }

    const isGrad = Boolean(isGraduated || (migrationProgress != null && migrationProgress >= 100) || project.status === 'graduated')
    // Migration target line is ONLY shown while bonding (< 100%).
    // Once migrated, the line is removed completely and replaced by the "M" circle badge on the candle (like GMGN).
    if (!isGrad && migrationTargetPrice && migrationTargetPrice > 0 && isChainToken) {
      migrationLineRef.current = mainSeries.createPriceLine({
        price: migrationTargetPrice * effectiveMultiplier,
        color: '#D97706',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: migrationProgress != null && migrationProgress > 0
          ? `🚀 Migrate · ${Math.round(migrationProgress)}%`
          : '🚀 Migrate',
        axisLabelColor: '#D97706',
        axisLabelTextColor: '#FFFFFF',
      })
    } else {
      migrationLineRef.current = null
    }

    // Attach GMGN-style migration marker primitive
    const markerPrimitive = new MigrationMarkerPrimitive()
    mainSeries.attachPrimitive(markerPrimitive)
    markerPrimitiveRef.current = markerPrimitive

    chart.timeScale().scrollToRealTime()

    chart.subscribeCrosshairMove(param => {
      if (!param.time || !param.point) {
        onCrosshairMove?.(null)
        return
      }
      const data = param.seriesData.get(mainSeries)
      const vData = param.seriesData.get(volumeSeries) as (HistogramData<Time> | undefined)
      if (data) {
        if ('open' in data) {
          onCrosshairMove?.({ open: data.open, high: data.high, low: data.low, close: data.close, volume: vData?.value })
        } else if ('value' in data) {
          onCrosshairMove?.({ open: data.value, high: data.value, low: data.value, close: data.value, volume: vData?.value })
        }
      }
    })

    const orderLines = orderLinesRef.current
    return () => {
      if (markerPrimitiveRef.current && mainSeries) {
        try { mainSeries.detachPrimitive(markerPrimitiveRef.current) } catch {}
        markerPrimitiveRef.current = null
      }
      allBarsRef.current = []
      fitPriceScaleRef.current = null
      orderLines.clear()
      previewLimitRef.current = null
      previewTpRef.current = null
      previewSlRef.current = null
      migrationLineRef.current = null
      priceLineRef.current = null
      latestCandleRef.current = null
      viewKeyRef.current = ''
      chart.remove()
    }
    // Deliberately not depending on `candles`: bars arrive on a timer, and rebuilding the chart for
    // each batch would throw away the viewport with it. The effect below fills these series instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, chartMode, chartTheme, showGrid, onCrosshairMove])

  // Dynamically update price formatters without destroying the chart canvas
  useEffect(() => {
    const chart = chartRef.current
    const series = mainSeriesRef.current
    if (!chart || !series) return
    chart.applyOptions({
      localization: { priceFormatter: fmtPrice }
    })
    const bars = allBarsRef.current
    if (bars.length > 0) {
      series.applyOptions({
        priceFormat: { type: 'custom', minMove: priceMinMove(bars.flatMap(b => [b.open, b.high, b.low, b.close])), formatter: fmtPrice }
      })
    }
  }, [fmtPrice])

  // Bars, applied to series that already exist.
  //
  // Kept separate from the effect that builds the chart on purpose. Bars now arrive on a timer, and
  // rebuilding the chart for each batch destroyed the viewport along with it — a chart scrolled back in
  // time snapped to the latest bar a few seconds later, which is what made it look like it moved on its
  // own. Here the data is swapped into the existing series and the viewport is left alone.
  useEffect(() => {
    const series = mainSeriesRef.current
    const volume = volumeSeriesRef.current
    const chart = chartRef.current
    if (!series || !volume || !chart) return

    let cancelled = false
    const isDark = chartTheme === 'dark'
    const viewKey = `${project.id}|${timeframe}|${chartCurrency}`

    const apply = (rawBars: ChainCandle[]) => {
      if (cancelled || !Array.isArray(rawBars)) return

      // While initial on-chain / API query is still loading, if rawBars is empty ([]),
      // DO NOT paint the empty flat baseline onto the chart and DO NOT mark chart as loaded!
      // Keep showing the loading spinner overlay until either real trades arrive or the query completes.
      if (rawBars.length === 0 && (isLoading || (candles === undefined && apiLoading))) {
        return
      }

      const continuousBars = buildContinuousCandles(
        rawBars,
        timeframe,
        latestPriceRef.current || 0,
      )
      if (continuousBars.length === 0) {
        if (chartMode === 'candle') {
          ;(series as ISeriesApi<'Candlestick'>).setData([])
        } else {
          ;(series as ISeriesApi<'Area'>).setData([])
        }
        volume.setData([])
        latestCandleRef.current = null
        allBarsRef.current = []
        markerPrimitiveRef.current?.setData(null, null)
        setTimeout(() => {
          if (!cancelled) setChartLoadedKey(viewKey)
        }, 0)
        return
      }

      const mult = effectiveMultiplierRef.current
      const cData: CandlestickData<Time>[] = []
      const lData: LineData<Time>[] = []
      const vData: HistogramData<Time>[] = []

      for (const b of continuousBars) {
        const time = b.time as Time
        const open = cleanPrice(b.open * mult)
        const high = cleanPrice(b.high * mult)
        const low = cleanPrice(b.low * mult)
        const close = cleanPrice(b.close * mult)
        cData.push({ time, open, high, low, close })
        lData.push({ time, value: close })
        vData.push({
          time,
          value: b.volume || 0,
          color:
            close >= open
              ? isDark
                ? 'rgba(8, 153, 129, 0.45)'
                : 'rgba(8, 153, 129, 0.25)'
              : isDark
                ? 'rgba(242, 54, 69, 0.45)'
                : 'rgba(242, 54, 69, 0.25)',
        })
      }

      latestCandleRef.current = cData[cData.length - 1]
      allBarsRef.current = cData
      fitPriceScaleRef.current?.(cData.flatMap(b => [b.open, b.high, b.low, b.close]))

      if (chartMode === 'candle') {
        ;(series as ISeriesApi<'Candlestick'>).setData(cData)
      } else {
        ;(series as ISeriesApi<'Area'>).setData(lData)
      }
      volume.setData(vData)
      updateMigrationMarkerRef.current?.(cData)

      // Snap to the latest bar only the first time this pair and timeframe are drawn. After that the
      // viewport belongs to whoever is looking at it.
      if (viewKeyRef.current !== viewKey) {
        viewKeyRef.current = viewKey
        chart.timeScale().applyOptions({ rightOffset: 8, barSpacing: 8, minBarSpacing: 2 })
        chart.timeScale().scrollToRealTime()
      }

      setTimeout(() => {
        if (!cancelled) setChartLoadedKey(viewKey)
      }, 0)
    }

    if (candles !== undefined) {
      // On chain the events are processed through continuous candle generation
      apply(candles)
      return () => {
        cancelled = true
      }
    }

    const timer = setTimeout(() => {
      if (!cancelled) setApiLoading(true)
    }, 0)

    ;(async () => {
      try {
        const currentP = latestPriceRef.current || 0
        const res = await fetch(`/api/candles?pair=${encodeURIComponent(project.id)}&timeframe=${timeframe}&price=${currentP}`)
        if (!res.ok) {
          apply([])
          return
        }
        const json = await res.json()
        if (json?.success && Array.isArray(json.candles) && json.candles.length > 0) {
          apply(json.candles as ChainCandle[])
        } else {
          apply([])
        }
      } catch {
        apply([])
      } finally {
        if (!cancelled) setApiLoading(false)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [candles, project.id, timeframe, chartMode, chartTheme, chartCurrency, isLoading, apiLoading])

  // Update live candle and PnL Line
  useEffect(() => {
    if (!mainSeriesRef.current) return
    // Tear the PnL entry line down as soon as the position is closed (no entry or
    // holding at/below dust) — before the price guard below — so a sold-out line
    // never lingers on the chart even if price is momentarily unavailable.
    const hasPosition = !!userEntryPrice && userHolding > 0
    if (!hasPosition && priceLineRef.current) {
      try { mainSeriesRef.current.removePriceLine(priceLineRef.current) } catch {}
      priceLineRef.current = null
    }
    if (!project.price) return
    const nowSec = Math.floor(Date.now() / 1000)
    const intervalSec = timeframeToSeconds(timeframe)
    const bucketSec = Math.floor(nowSec / intervalSec) * intervalSec
    const bucketTime = bucketSec as Time
    try {
      const convertedPrice = project.price * effectiveMultiplier
      if (chartMode === 'candle') {
        const last = latestCandleRef.current
        if (last) {
          let updatedBar: CandlestickData<Time>
          if (bucketSec > (last.time as number)) {
            // Time has crossed into a new bar for this timeframe — close out
            // the previous candle and open a fresh one instead of letting one
            // candle silently absorb every future price tick forever.
            const cleanP = cleanPrice(convertedPrice)
            const cleanLastClose = cleanPrice(last.close)
            updatedBar = {
              time: bucketTime,
              open: cleanLastClose,
              high: Math.max(cleanLastClose, cleanP),
              low: Math.min(cleanLastClose, cleanP),
              close: cleanP,
            }
            volumeSeriesRef.current?.update({
              time: bucketTime,
              value: 0,
              color: cleanP >= cleanLastClose
                ? (chartTheme === 'dark' ? 'rgba(8, 153, 129, 0.45)' : 'rgba(8, 153, 129, 0.25)')
                : (chartTheme === 'dark' ? 'rgba(242, 54, 69, 0.45)' : 'rgba(242, 54, 69, 0.25)'),
            })
          } else {
            // Still inside the current bar — extend its high/low/close as before.
            const cleanP = cleanPrice(convertedPrice)
            const cleanOpen = cleanPrice(last.open)
            updatedBar = {
              time: last.time,
              open: cleanOpen,
              high: Math.max(cleanOpen, cleanPrice(last.high), cleanP),
              low: Math.min(cleanOpen, cleanPrice(last.low), cleanP),
              close: cleanP,
            }
          }
          ;(mainSeriesRef.current as ISeriesApi<'Candlestick'>).update(updatedBar)
          latestCandleRef.current = updatedBar
        }
      } else {
        (mainSeriesRef.current as ISeriesApi<'Area'>).update({
          time: bucketTime,
          value: convertedPrice,
        })
      }

      // Update or Create / Remove PnL Price Line based on user's real position
      const effectiveEntry = userEntryPrice && userHolding > 0 ? (userEntryPrice * effectiveMultiplier) : null

      if (effectiveEntry && mainSeriesRef.current) {
        const opts = getPnlLineOptions(effectiveEntry, convertedPrice, userHolding, effectiveUnit)
        if (priceLineRef.current) {
          priceLineRef.current.applyOptions(opts)
        } else {
          priceLineRef.current = mainSeriesRef.current.createPriceLine(opts)
        }
      } else if (priceLineRef.current && mainSeriesRef.current) {
        mainSeriesRef.current.removePriceLine(priceLineRef.current)
        priceLineRef.current = null
      }
    } catch {}
  }, [project.price, project.hi, project.lo, chartMode, timeframe, chartTheme, userEntryPrice, userHolding, fmtPrice, chartCurrency, effectiveMultiplier, effectiveUnit])

  // Update reactive open order price lines and form preview lines
  useEffect(() => {
    const series = mainSeriesRef.current
    if (!series) return

    // 1. Sync Open Orders for current project
    const pairOrders = openOrders.filter(
      o => o && o.status === 'OPEN' && o.pairId.toLowerCase() === project.id.toLowerCase()
    )
    const currentLineKeys = new Set<string>()

    pairOrders.forEach(order => {
      currentLineKeys.add(order.id)
      const convertedLimitPrice = order.limitPrice * effectiveMultiplier
      let color = '#F59E0B' // Amber for LIMIT
      let title = `LIMIT ${order.side} ${fmtPrice(convertedLimitPrice)}`

      if (order.type === 'TP') {
        color = '#10B981' // Green
        title = `TP ${fmtPrice(convertedLimitPrice)}`
      } else if (order.type === 'SL') {
        color = '#EF4444' // Red
        title = `SL ${fmtPrice(convertedLimitPrice)}`
      }

      const lineOpts = {
        price: convertedLimitPrice,
        color,
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title,
      }

      const existingLine = orderLinesRef.current.get(order.id)
      if (existingLine) {
        existingLine.applyOptions(lineOpts)
      } else {
        const newLine = series.createPriceLine(lineOpts)
        orderLinesRef.current.set(order.id, newLine)
      }
    })

    // Remove any order lines that were cancelled or filled
    orderLinesRef.current.forEach((line, id) => {
      if (!currentLineKeys.has(id)) {
        try {
          series.removePriceLine(line)
        } catch {}
        orderLinesRef.current.delete(id)
      }
    })

    // 2. Active Limit Price preview line (while typing in order panel)
    if (activeLimitPrice && activeLimitPrice > 0 && !pairOrders.some(o => o.limitPrice === activeLimitPrice)) {
      const convertedActiveLimit = activeLimitPrice * effectiveMultiplier
      const opts = {
        price: convertedActiveLimit,
        color: '#F59E0B',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `TARGET LIMIT ${fmtPrice(convertedActiveLimit)}`,
      }
      if (previewLimitRef.current) {
        previewLimitRef.current.applyOptions(opts)
      } else {
        previewLimitRef.current = series.createPriceLine(opts)
      }
    } else if (previewLimitRef.current) {
      try {
        series.removePriceLine(previewLimitRef.current)
      } catch {}
      previewLimitRef.current = null
    }

    // 3. Active TP Price preview line
    if (activeTpPrice && activeTpPrice > 0) {
      const convertedTp = activeTpPrice * effectiveMultiplier
      const opts = {
        price: convertedTp,
        color: '#10B981',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `TARGET TP ${fmtPrice(convertedTp)}`,
      }
      if (previewTpRef.current) {
        previewTpRef.current.applyOptions(opts)
      } else {
        previewTpRef.current = series.createPriceLine(opts)
      }
    } else if (previewTpRef.current) {
      try {
        series.removePriceLine(previewTpRef.current)
      } catch {}
      previewTpRef.current = null
    }

    // 4. Active SL Price preview line
    if (activeSlPrice && activeSlPrice > 0) {
      const convertedSl = activeSlPrice * effectiveMultiplier
      const opts = {
        price: convertedSl,
        color: '#EF4444',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `TARGET SL ${fmtPrice(convertedSl)}`,
      }
      if (previewSlRef.current) {
        previewSlRef.current.applyOptions(opts)
      } else {
        previewSlRef.current = series.createPriceLine(opts)
      }
    } else if (previewSlRef.current) {
      try {
        series.removePriceLine(previewSlRef.current)
      } catch {}
      previewSlRef.current = null
    }
  }, [openOrders, activeLimitPrice, activeTpPrice, activeSlPrice, project.id, fmtPrice, effectiveMultiplier])

  // Migration target line: ONLY shown while bonding (< 100%).
  // Once graduated / migrated, the line is removed completely and replaced by the "M" circle badge on the candle (like GMGN).
  useEffect(() => {
    const series = mainSeriesRef.current
    if (!series) return
    const isGrad = Boolean(isGraduated || (migrationProgress != null && migrationProgress >= 100) || project.status === 'graduated')

    if (!isGrad && migrationTargetPrice && migrationTargetPrice > 0) {
      const convertedTarget = migrationTargetPrice * effectiveMultiplier
      const opts = {
        price: convertedTarget,
        color: '#D97706',
        lineWidth: 1 as const,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: migrationProgress != null && migrationProgress > 0
          ? `🚀 Migrate · ${Math.round(migrationProgress)}%`
          : '🚀 Migrate',
        axisLabelColor: '#D97706',
        axisLabelTextColor: '#FFFFFF',
      }
      if (migrationLineRef.current) {
        migrationLineRef.current.applyOptions(opts)
      } else {
        migrationLineRef.current = series.createPriceLine(opts)
      }
    } else if (migrationLineRef.current) {
      try {
        series.removePriceLine(migrationLineRef.current)
      } catch {}
      migrationLineRef.current = null
    }
  }, [migrationTargetPrice, migrationProgress, isGraduated, project.status, project.id, chartMode, chartTheme, effectiveMultiplier])

  // Graduation / Migration candle marker on the chart (GMGN style "M" inside circular badge)
  const updateMigrationMarker = useCallback((bars: CandlestickData<Time>[]) => {
    const primitive = markerPrimitiveRef.current
    if (!primitive) return
    const isGrad = Boolean(isGraduated || (migrationProgress != null && migrationProgress >= 100) || project.status === 'graduated')

    if (!isGrad || isDataLoading || !bars || bars.length === 0) {
      primitive.setData(null, null)
      return
    }

    // Only draw migration marker if the chart has actual trade candles with volume/activity
    const hasRealTrades = bars.some(b => b.open !== b.close || ((b as { volume?: number }).volume ?? 0) > 0)
    if (!hasRealTrades) {
      primitive.setData(null, null)
      return
    }

    const intervalSec = timeframeToSeconds(timeframe)
    const gradTime = graduatedTimestamp ?? project.graduatedAt ?? null

    let gradBar: CandlestickData<Time> | undefined

    if (gradTime && gradTime > 0) {
      // 1. Direct bucket matching: the candle whose [time, time + intervalSec) contains gradTime
      gradBar = bars.find(b => {
        const t = Number(b.time)
        return t <= gradTime && t + intervalSec > gradTime
      })
      // 2. If not found in exact bucket (e.g. gaps or boundary alignment), find nearest bar among active trade bars
      if (!gradBar) {
        const activeBars = bars.filter(b => b.open !== b.close || ((b as { volume?: number }).volume ?? 0) > 0)
        const candidates = activeBars.length > 0 ? activeBars : bars
        gradBar = candidates.reduce((closest, curr) => {
          return Math.abs(Number(curr.time) - gradTime) < Math.abs(Number(closest.time) - gradTime)
            ? curr
            : closest
        }, candidates[0])
      }
    }

    // 3. Fallback if gradTime is not available:
    if (!gradBar) {
      const activeBars = bars.filter(b => b.open !== b.close || ((b as { volume?: number }).volume ?? 0) > 0)
      if (activeBars.length > 0) {
        // If graduationPrice is known, find the FIRST candle chronologically that reached or crossed it
        if (project.graduationPrice && project.graduationPrice > 0) {
          const targetPx = project.graduationPrice * effectiveMultiplier * 0.985
          gradBar = activeBars.find(b => b.high >= targetPx)
        }
        // Otherwise, anchor to the FIRST active trading candle (when trading started/migrated to DEX)
        // CRITICAL: NEVER use reduce(highest) which causes the icon to jump dynamically between candles as prices move!
        if (!gradBar) {
          gradBar = activeBars[0]
        }
      } else {
        gradBar = bars[0]
      }
    }

    if (gradBar) {
      primitive.setData(gradBar.time, gradBar.high)
    } else {
      primitive.setData(null, null)
    }
  }, [isGraduated, migrationProgress, project.status, project.graduationPrice, project.graduatedAt, graduatedTimestamp, timeframe, effectiveMultiplier, isDataLoading])

  useEffect(() => {
    updateMigrationMarkerRef.current = updateMigrationMarker
  }, [updateMigrationMarker])

  useEffect(() => {
    updateMigrationMarker(allBarsRef.current)
  }, [updateMigrationMarker])

  const isDark = chartTheme === 'dark'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '300px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
        }}
      />

      {/* Elegant Chart Loading Overlay */}
      {isDataLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 15,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: isDark ? 'rgba(17, 19, 17, 0.82)' : 'rgba(250, 250, 250, 0.85)',
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
            pointerEvents: 'none',
            transition: 'opacity 0.2s ease',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2.5px solid rgba(0, 200, 5, 0.15)',
                borderTopColor: 'var(--brand, #00C805)',
                animation: 'chartSpin 0.85s linear infinite',
              }}
            />
            <Activity size={18} style={{ color: 'var(--brand, #00C805)', animation: 'chartPulse 1.8s ease-in-out infinite' }} />
          </div>
          <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: isDark ? '#EAEBE6' : '#161A14',
                letterSpacing: '0.2px',
              }}
            >
              Loading chart data...
            </span>
            <span
              style={{
                fontSize: '11px',
                color: isDark ? '#7A8276' : '#8A9286',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ fontWeight: 600 }}>{project.tick}</span>
              <span>&middot;</span>
              <span>{timeframe}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The chart is expensive to re-render and the trade page around it re-renders on every price poll (even
 * when nothing moved) and on every crosshair hover. Memoizing with an explicit comparator means the chart
 * only re-runs when a prop that actually affects what's drawn changes. The `candles` array is now
 * reference-stable across idle polls (see useTokenTrades), so comparing it by reference is correct and
 * cheap; the crosshair callback is a stable state setter, so it's intentionally not compared.
 */
export const CandleChart = memo(CandleChartImpl, (prev, next) => {
  const sameOrders =
    prev.openOrders === next.openOrders ||
    ((prev.openOrders?.length ?? 0) === (next.openOrders?.length ?? 0) &&
      (prev.openOrders ?? []).every((o, i) => o.id === next.openOrders?.[i]?.id && o.limitPrice === next.openOrders?.[i]?.limitPrice))

  return (
    prev.candles === next.candles &&
    prev.isLoading === next.isLoading &&
    prev.project.id === next.project.id &&
    prev.project.price === next.project.price &&
    prev.project.hi === next.project.hi &&
    prev.project.lo === next.project.lo &&
    prev.priceUnit === next.priceUnit &&
    prev.chartCurrency === next.chartCurrency &&
    prev.quoteUsdPrice === next.quoteUsdPrice &&
    prev.timeframe === next.timeframe &&
    prev.chartMode === next.chartMode &&
    prev.chartTheme === next.chartTheme &&
    prev.showGrid === next.showGrid &&
    prev.userEntryPrice === next.userEntryPrice &&
    prev.userHolding === next.userHolding &&
    prev.activeLimitPrice === next.activeLimitPrice &&
    prev.activeTpPrice === next.activeTpPrice &&
    prev.activeSlPrice === next.activeSlPrice &&
    prev.migrationTargetPrice === next.migrationTargetPrice &&
    prev.migrationProgress === next.migrationProgress &&
    prev.isGraduated === next.isGraduated &&
    sameOrders
  )
})

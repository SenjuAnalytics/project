import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface PoolMapping {
  pool: string
  symbol: string
  name: string
  isRwa: boolean
  quote: string
}

interface GeckoTradeItem {
  attributes?: {
    kind?: string
    price_to_in_usd?: string
    price_from_in_usd?: string
    price_to_in_currency_token?: string
    price_from_in_currency_token?: string
    to_token_amount?: string
    from_token_amount?: string
    volume_in_usd?: string
    block_timestamp?: string
    tx_hash?: string
    tx_from_address?: string
    block_number?: number
  }
}

// Authentic on-chain Robinhood Chain DEX pools (Chain ID 4663)
const ONCHAIN_POOLS: Record<string, PoolMapping> = {
  pons: {
    pool: '0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA',
    symbol: 'PONS',
    name: 'Pons',
    isRwa: false,
    quote: 'ETH',
  },
  ai: {
    pool: '0xc4a21f9d6485FC5893DD4A491B320a83DAF4Da1D',
    symbol: 'AI',
    name: 'Artificial Inu',
    isRwa: true,
    quote: 'NVDA',
  },
  nvda: {
    pool: '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3',
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    isRwa: true,
    quote: 'USDG',
  },
  rnvda: {
    pool: '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3',
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    isRwa: true,
    quote: 'USDG',
  },
  aapl: {
    pool: '0xaae0d815ee56e4092a5e5c2911e676fea50b2d6d',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    isRwa: true,
    quote: 'USDG',
  },
  raapl: {
    pool: '0xaae0d815ee56e4092a5e5c2911e676fea50b2d6d',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    isRwa: true,
    quote: 'USDG',
  },
  spy: {
    pool: '0x38453c115607463ac284820ce959831042f3df4e',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    isRwa: true,
    quote: 'USDG',
  },
  rspy: {
    pool: '0x38453c115607463ac284820ce959831042f3df4e',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    isRwa: true,
    quote: 'USDG',
  },
  googl: {
    pool: '0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7',
    symbol: 'GOOGL',
    name: 'Alphabet Class A',
    isRwa: true,
    quote: 'USDG',
  },
  rgoogl: {
    pool: '0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7',
    symbol: 'GOOGL',
    name: 'Alphabet Class A',
    isRwa: true,
    quote: 'USDG',
  },
  gme: {
    pool: '0xe2b46c905e12ab8e2f864e4821a4325884c1b126',
    symbol: 'GME',
    name: 'GameStop Corp.',
    isRwa: true,
    quote: 'USDG',
  },
  rgme: {
    pool: '0xe2b46c905e12ab8e2f864e4821a4325884c1b126',
    symbol: 'GME',
    name: 'GameStop Corp.',
    isRwa: true,
    quote: 'USDG',
  },
  spcx: {
    pool: '0xc61284332117c3fb23a2a56cceffd07f7af60029',
    symbol: 'SPCX',
    name: 'Space Exploration Technologies',
    isRwa: true,
    quote: 'USDG',
  },
  rspcx: {
    pool: '0xc61284332117c3fb23a2a56cceffd07f7af60029',
    symbol: 'SPCX',
    name: 'Space Exploration Technologies',
    isRwa: true,
    quote: 'USDG',
  },
  sgov: {
    pool: '0xfab520051f96f4d2a32c22b6a3dd7fffdf231bfe',
    symbol: 'SGOV',
    name: 'iShares 0-3M Treasury Bond',
    isRwa: true,
    quote: 'USDG',
  },
  rsgov: {
    pool: '0xfab520051f96f4d2a32c22b6a3dd7fffdf231bfe',
    symbol: 'SGOV',
    name: 'iShares 0-3M Treasury Bond',
    isRwa: true,
    quote: 'USDG',
  },
}

export interface RealTrade {
  id: string
  txHash: string
  priceUsd: number
  priceQuote: number
  amount: number
  totalQuote: number
  volumeUsd: number
  time: string
  isBuy: boolean
  trader: string
  blockNumber: number
}

// In-memory cache for trades (TTL = 20s)
const tradesCache = new Map<string, { timestamp: number; trades: RealTrade[] }>()
const CACHE_TTL_MS = 20 * 1000

function formatTime(isoString?: string): string {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return isoString
    return d.toTimeString().split(' ')[0] // e.g. "17:05:53"
  } catch {
    return isoString
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const pair = (searchParams.get('pair') || 'pons').toLowerCase()

    const poolInfo = ONCHAIN_POOLS[pair]
    if (!poolInfo) {
      // Pair has no on-chain pool registered yet (e.g. fresh custom bonding curve)
      return NextResponse.json({
        success: true,
        pair,
        source: 'robinhood_chain_empty',
        trades: [],
      })
    }

    const cacheKey = `trades_${pair}`
    const cached = tradesCache.get(cacheKey)
    const now = Date.now()

    // 1. Serve cached real trades if fresh (< 20s)
    if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        pair,
        symbol: poolInfo.symbol,
        pool: poolInfo.pool,
        source: 'robinhood_chain_cache',
        count: cached.trades.length,
        trades: cached.trades,
      })
    }

    // 2. Fetch authentic on-chain trades from GeckoTerminal Robinhood Chain network
    try {
      const url = `https://api.geckoterminal.com/api/v2/networks/robinhood/pools/${poolInfo.pool}/trades`
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Qualyra-DEX/1.0 (Robinhood-Chain-L2)',
        },
        next: { revalidate: 15 },
        signal: AbortSignal.timeout(4000),
      })

      if (res.ok) {
        const json = (await res.json()) as { data?: GeckoTradeItem[] }
        const rawList: GeckoTradeItem[] = json?.data || []

        const parsedTrades: RealTrade[] = rawList.map((item: GeckoTradeItem, idx: number) => {
          const attr = item.attributes || {}
          const isBuy = attr.kind === 'buy'
          const priceUsd = isBuy ? parseFloat(attr.price_to_in_usd || '0') : parseFloat(attr.price_from_in_usd || '0')
          const priceQuote = isBuy
            ? parseFloat(attr.price_to_in_currency_token || attr.price_to_in_usd || '0')
            : parseFloat(attr.price_from_in_currency_token || attr.price_from_in_usd || '0')
          const amount = isBuy ? parseFloat(attr.to_token_amount || '0') : parseFloat(attr.from_token_amount || '0')
          const totalQuote = isBuy ? parseFloat(attr.from_token_amount || '0') : parseFloat(attr.to_token_amount || '0')
          const volumeUsd = parseFloat(attr.volume_in_usd || '0')

          // Effective price in quote currency
          const effectivePrice = poolInfo.quote === 'ETH' ? (priceQuote > 0 ? priceQuote : priceUsd) : priceUsd

          return {
            id: attr.tx_hash ? `${attr.tx_hash}-${idx}` : String(Date.now() - idx * 1000),
            txHash: attr.tx_hash || '',
            priceUsd,
            priceQuote: effectivePrice,
            amount,
            totalQuote,
            volumeUsd,
            time: formatTime(attr.block_timestamp),
            isBuy,
            trader: attr.tx_from_address || '',
            blockNumber: attr.block_number || 0,
          }
        })

        tradesCache.set(cacheKey, { timestamp: now, trades: parsedTrades })

        return NextResponse.json({
          success: true,
          pair,
          symbol: poolInfo.symbol,
          pool: poolInfo.pool,
          source: 'robinhood_chain_geckoterminal',
          count: parsedTrades.length,
          trades: parsedTrades,
        })
      }
    } catch (fetchErr: unknown) {
      console.warn(`[GeckoTerminal Trades Fetch Warning] ${pair}:`, fetchErr instanceof Error ? fetchErr.message : String(fetchErr))
    }

    // 3. Stale-while-revalidate: return previous cached real trades if rate limited
    if (cached && cached.trades.length > 0) {
      return NextResponse.json({
        success: true,
        pair,
        symbol: poolInfo.symbol,
        pool: poolInfo.pool,
        source: 'robinhood_chain_stale',
        count: cached.trades.length,
        trades: cached.trades,
      })
    }

    // 4. Return empty array if no real trades are found (NO fake simulation!)
    return NextResponse.json({
      success: true,
      pair,
      symbol: poolInfo.symbol,
      pool: poolInfo.pool,
      source: 'robinhood_chain_empty',
      trades: [],
    })
  } catch (error: unknown) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 })
  }
}

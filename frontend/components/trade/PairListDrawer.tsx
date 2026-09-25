'use client'

import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Dispatch, SetStateAction, MouseEvent } from 'react'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import type { Project } from '@/lib/data'
import type { LivePriceItem } from '@/lib/useLivePrices'
import { logoTransform } from '@/lib/ipfs'
import { tickerColor, px7 } from '@/lib/utils'

interface PairListDrawerProps {
  leftOpen: boolean
  mobileView: 'chart' | 'trades' | 'markets'
  pairSearch: string
  setPairSearch: Dispatch<SetStateAction<string>>
  pairFilter: 'all' | 'bonding' | 'graduated' | 'rwa' | 'mine' | 'fav'
  setPairFilter: Dispatch<SetStateAction<'all' | 'bonding' | 'graduated' | 'rwa' | 'mine' | 'fav'>>
  favs: Set<string>
  filteredPairs: Project[]
  curPairId: string
  setCurPairId: Dispatch<SetStateAction<string>>
  setMobileView: Dispatch<SetStateAction<'chart' | 'trades' | 'markets'>>
  toggleFav: (id: string, e: MouseEvent) => void
  priceTrends: Record<string, 'up' | 'down' | null>
  setLeftOpen: Dispatch<SetStateAction<boolean>>
  quoteUsdPrice?: number
  livePrices?: Record<string, LivePriceItem>
}

/** Left drawer of the trade page: pair filter tabs and the scrollable list of tradable pairs. */
export function PairListDrawer({
  leftOpen,
  mobileView,
  pairSearch,
  setPairSearch,
  pairFilter,
  setPairFilter,
  favs,
  filteredPairs,
  curPairId,
  setCurPairId,
  setMobileView,
  toggleFav,
  priceTrends,
  setLeftOpen,
  quoteUsdPrice,
  livePrices,
}: PairListDrawerProps) {
  return (
    <div className={`drawer-wrap left-drawer ${leftOpen ? 'open' : 'closed'} ${mobileView === 'markets' ? 'mobile-show' : 'mobile-hide'}`}>
      <div className="drawer-inner">
      <div className="col-l">
        <div className="pair-tools" style={{ padding: '8px 10px', position: 'relative' }}>
          <input
            className="inp"
            placeholder="Search pairs (e.g. SOLA, AAPL)"
            value={pairSearch}
            onChange={e => setPairSearch(e.target.value)}
            style={{ height: '32px', fontSize: '12px', paddingRight: pairSearch ? '28px' : '10px' }}
          />
          {pairSearch && (
            <button
              type="button"
              onClick={() => setPairSearch('')}
              style={{
                position: 'absolute',
                right: '18px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--dim)',
                cursor: 'pointer',
                fontSize: '13px',
                lineHeight: 1,
                padding: '2px',
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
        <div style={{ padding: '0 8px', borderBottom: '1px solid var(--line)' }}>
          <div className="ttabs" style={{ gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
            <button
              type="button"
              className={pairFilter === 'all' ? 'active' : ''}
              onClick={() => setPairFilter('all')}
              style={{ fontSize: '11px', padding: '4px 7px' }}
            >
              All
            </button>
            <button
              type="button"
              className={pairFilter === 'bonding' ? 'active' : ''}
              onClick={() => setPairFilter('bonding')}
              style={{ fontSize: '11px', padding: '4px 7px' }}
            >
              Bond
            </button>
            <button
              type="button"
              className={pairFilter === 'graduated' ? 'active' : ''}
              onClick={() => setPairFilter('graduated')}
              style={{ fontSize: '11px', padding: '4px 7px' }}
            >
              Grad
            </button>
            <button
              type="button"
              className={pairFilter === 'rwa' ? 'active' : ''}
              onClick={() => setPairFilter('rwa')}
              style={{ fontSize: '11px', padding: '4px 7px' }}
            >
              RWA
            </button>
            <button
              type="button"
              className={pairFilter === 'mine' ? 'active' : ''}
              onClick={() => setPairFilter('mine')}
              style={{ fontSize: '11px', padding: '4px 7px' }}
            >
              Mine
            </button>
            <button
              type="button"
              className={pairFilter === 'fav' ? 'active' : ''}
              onClick={() => setPairFilter('fav')}
              style={{
                fontSize: '11px',
                padding: '4px 7px',
                color: pairFilter === 'fav' ? 'var(--brand)' : favs.size > 0 ? '#F59E0B' : 'inherit',
              }}
              title="Favorites"
            >
              ★ {favs.size > 0 ? `(${favs.size})` : ''}
            </button>
          </div>
        </div>

        {/* Clean 2-Row Layout per pair to eliminate any text wrapping */}
        <div data-scroll="pairs" style={{ overflowY: 'auto', flex: 1, minHeight: 0, overscrollBehavior: 'contain' }}>
          {filteredPairs.map(p => {
            const u = p.chg >= 0
            const active = p.id.toLowerCase() === curPairId.toLowerCase()
            const quote = p.quoteAsset || (p.status === 'bonding' ? 'ETH' : 'USDG')
            const isQuoteUsd = quote === 'USDG' || quote === 'USD' || quote === 'USDC'
            const ethUsd = livePrices?.['eth']?.price || livePrices?.['ETH']?.price || (quoteUsdPrice && quoteUsdPrice > 0 ? quoteUsdPrice : 2400)
            const quoteRate = isQuoteUsd ? 1 : (quote === 'ETH' ? ethUsd : (livePrices?.[quote.toLowerCase()]?.price || livePrices?.[quote]?.price || 1))
            const isChainToken = /^0x[0-9a-fA-F]{40}$/.test(p.id)
            const priceUsd = isChainToken ? p.price * quoteRate : p.price
            return (
              <div
                key={p.id}
                onClick={() => {
                  setCurPairId(p.id)
                  setMobileView('chart')
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: '1px solid var(--line2)',
                  borderLeft: active ? '3px solid var(--brand)' : '3px solid transparent',
                  background: active ? 'var(--panel2)' : 'transparent',
                  transition: 'background .12s',
                }}
              >
                {/* Left: Star + Logo + Symbol & Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span
                    onClick={e => toggleFav(p.id, e)}
                    style={{
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: favs.has(p.id) ? 'var(--brand)' : 'var(--ft)',
                      flexShrink: 0,
                    }}
                  >
                    {favs.has(p.id) ? '★' : '☆'}
                  </span>

                  <div style={{ position: 'relative', display: 'inline-flex', width: '24px', height: '24px', flexShrink: 0 }}>
                    {p.rwa ? (
                      <RwaLogo ticker={p.tick} size={24} showChainBadge={false} />
                    ) : p.logoUrl ? (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: p.logoShape === 'circle' ? '50%' : '5px',
                          background: p.logoBg === 'white' ? '#FFFFFF' : p.logoBg === 'dark' ? '#0F1218' : 'var(--inset)',
                          border: '1px solid var(--line)',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Image
                          src={p.logoUrl}
                          alt={p.tick}
                          width={24}
                          height={24}
                          unoptimized
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: p.logoFit || 'cover',
                            transform: logoTransform(p.logoScale),
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '5px',
                          background: tickerColor(p.tick),
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {p.tick.slice(0, 2)}
                      </div>
                    )}
                    <RobinhoodBadge size={10} />
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                        {p.tick} <span style={{ color: 'var(--ft)', fontWeight: 400, fontSize: '11px' }}>/ {quote}</span>
                      </div>
                      {p.rwa && (
                        <span style={{
                          fontSize: '8.5px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: p.rwaType === 'stock'
                            ? 'rgba(59, 130, 246, 0.12)'
                            : p.rwaType === 'treasury'
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(139, 92, 246, 0.14)',
                          color: p.rwaType === 'stock'
                            ? '#60A5FA'
                            : p.rwaType === 'treasury'
                            ? '#34D399'
                            : '#A78BFA',
                          fontWeight: 700,
                          border: `1px solid ${
                            p.rwaType === 'stock'
                              ? 'rgba(59, 130, 246, 0.3)'
                              : p.rwaType === 'treasury'
                              ? 'rgba(16, 185, 129, 0.3)'
                              : 'rgba(139, 92, 246, 0.3)'
                          }`,
                          lineHeight: '13px',
                          letterSpacing: '0.2px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3.5px',
                        }}>
                          {p.rwaType === 'stock' ? (
                            <>
                              <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                                <polyline points="16 7 22 7 22 13" />
                              </svg>
                              STOCK
                            </>
                          ) : p.rwaType === 'treasury' ? (
                            <>
                              <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                              </svg>
                              TREASURY
                            </>
                          ) : (
                            <>
                              <svg width="8.5" height="8.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                              </svg>
                              RWA
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85px' }}>
                      {p.name}
                    </div>
                  </div>
                </div>

                {/* Right: Price & Percent Chip */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {(() => {
                    const trend = priceTrends[p.id.toLowerCase()] || priceTrends[p.tick.toLowerCase()] || priceTrends[p.tick.toLowerCase().replace(/^r/, '')]
                    return (
                      <div
                        className="mono"
                        style={{
                          fontWeight: 600,
                          fontSize: '12.5px',
                          color: trend === 'up' ? '#00c853' : trend === 'down' ? '#f6465d' : 'var(--tx)',
                          transition: 'color 0.35s ease',
                        }}
                      >
                        ${px7(priceUsd)}
                      </div>
                    )
                  })()}
                  <div style={{ marginTop: '2px' }}>
                    <span
                      className={`chip ${u ? 'up' : 'dn'}`}
                      style={{ fontSize: '10.5px', padding: '1px 6px', fontWeight: 600 }}
                    >
                      {u ? '+' : ''}{p.chg.toFixed(2)}%
                    </span>
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      </div>
    </div>

    {/* Sleek Side Drawer Handle Button */}
    <button
      type="button"
      onClick={() => setLeftOpen(prev => !prev)}
      className="drawer-toggle-btn left"
      title={leftOpen ? 'Close Markets Drawer (◀)' : 'Open Markets Drawer (▶)'}
      aria-label={leftOpen ? 'Close Markets Drawer' : 'Open Markets Drawer'}
    >
      {leftOpen ? <ChevronLeft size={9} strokeWidth={2.6} /> : <ChevronRight size={9} strokeWidth={2.6} />}
    </button>
  </div>
  )
}

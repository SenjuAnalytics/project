'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'
import { logoTransform } from '@/lib/ipfs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Star } from 'lucide-react'
import { Project } from '@/lib/data'
import { fmtUsd, px7, fmtPct, tickerColor } from '@/lib/utils'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { useLivePrices, mergeProjectsWithLivePrices } from '@/lib/useLivePrices'
import { useFavorites } from '@/hooks/useFavorites'

export function MarketsTable({ projects }: { projects: Project[] }) {
  const router = useRouter()
  const { prices: livePrices, priceTrends } = useLivePrices(25000)

  const [pairFilter, setPairFilter] = useState<'all' | 'bonding' | 'graduated' | 'battle' | 'fav'>('all')
  const [pairSearch, setPairSearch] = useState('')
  
  const [sortKey, setSortKey] = useState<keyof Project>('vol24')
  const [sortDir, setSortDir] = useState<-1 | 1>(-1)
  const { favs, toggleFav } = useFavorites()

  const handleSort = (k: keyof Project) => {
    if (sortKey === k) {
      setSortDir(d => d === 1 ? -1 : 1)
    } else {
      setSortKey(k)
      setSortDir(-1)
    }
  }

  const activeProjects = useMemo(() => {
    return mergeProjectsWithLivePrices(projects, livePrices)
  }, [projects, livePrices])

  const filteredProjects = useMemo(() => {
    const q = pairSearch.toLowerCase()
    const list = activeProjects.filter(p => {
      const match = p.tick.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      if (!match) return false
      if (pairFilter === 'bonding') return p.status === 'bonding'
      if (pairFilter === 'graduated') return p.status === 'graduated'
      if (pairFilter === 'battle') return p.battle > 0
      if (pairFilter === 'fav') return favs.has(p.id)
      return true
    })
    list.sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (av < bv) return -1 * sortDir
      if (av > bv) return 1 * sortDir
      return 0
    })
    return list
  }, [activeProjects, pairSearch, pairFilter, favs, sortKey, sortDir])

  return (
    <div className="sec">
      <div className="panel">
        {/* Unified Modern Toolbar */}
        <div className="markets-toolbar">
          <div className="markets-toolbar-left">
            <div className="markets-title-group">
              <h3 className="markets-title">Markets</h3>
              <span className="markets-badge">
                <span className="markets-dot" />
                {filteredProjects.length} pairs
              </span>
              <span
                className="markets-badge"
                style={{
                  background: 'rgba(0, 200, 83, 0.08)',
                  borderColor: 'rgba(0, 200, 83, 0.25)',
                  color: '#00c853',
                  gap: '5px',
                  fontWeight: 600,
                  fontSize: '11px',
                }}
                title="Real-time prices synchronized directly from Robinhood Chain DEX pools"
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#00c853',
                    boxShadow: '0 0 6px #00c853',
                  }}
                />
                Robinhood DEX Live
              </span>
            </div>


            <div className="markets-divider" />

            {/* Segmented Pill Tabs */}
            <div className="markets-tabs">
              <button
                type="button"
                className={`markets-tab-btn ${pairFilter === 'all' ? 'active' : ''}`}
                onClick={() => setPairFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`markets-tab-btn ${pairFilter === 'bonding' ? 'active' : ''}`}
                onClick={() => setPairFilter('bonding')}
              >
                Bonding
              </button>
              <button
                type="button"
                className={`markets-tab-btn ${pairFilter === 'graduated' ? 'active' : ''}`}
                onClick={() => setPairFilter('graduated')}
              >
                Graduated
              </button>
              <button
                type="button"
                className={`markets-tab-btn ${pairFilter === 'battle' ? 'active' : ''}`}
                onClick={() => setPairFilter('battle')}
              >
                In Battle
              </button>
              <button
                type="button"
                className={`markets-tab-btn ${pairFilter === 'fav' ? 'active' : ''}`}
                onClick={() => setPairFilter('fav')}
                title="Favorites"
              >
                <Star size={12} fill={pairFilter === 'fav' ? '#F59E0B' : 'none'} stroke={pairFilter === 'fav' ? '#F59E0B' : 'currentColor'} />
                <span>Favorites</span>
              </button>
            </div>
          </div>

          {/* Right Search Input */}
          <div className="markets-search-wrap">
            <Search size={14} className="markets-search-icon" />
            <input
              type="text"
              className="markets-search-inp"
              placeholder="Search markets..."
              value={pairSearch}
              onChange={e => setPairSearch(e.target.value)}
            />
            {pairSearch && (
              <button
                type="button"
                className="markets-search-clear"
                onClick={() => setPairSearch('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>Pair</th>
                <th className="sortable" onClick={() => handleSort('price')}>
                  Price {sortKey === 'price' && (sortDir === 1 ? '▲' : '▼')}
                </th>
                <th className="sortable" onClick={() => handleSort('chg')}>
                  24h Change {sortKey === 'chg' && (sortDir === 1 ? '▲' : '▼')}
                </th>
                <th>24h High / Low</th>
                <th className="sortable" onClick={() => handleSort('vol24')}>
                  Q-Volume {sortKey === 'vol24' && (sortDir === 1 ? '▲' : '▼')}
                </th>
                <th className="sortable" onClick={() => handleSort('mcap')}>
                  Mkt Cap {sortKey === 'mcap' && (sortDir === 1 ? '▲' : '▼')}
                </th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => {
                const u = p.chg >= 0
                const isFav = favs.has(p.id)

                return (
                  <tr key={p.id} onClick={() => router.push(`/trade?pair=${p.id}`)}>
                    <td onClick={e => toggleFav(p.id, e)} style={{ width: '42px', textAlign: 'center' }}>
                      <button type="button" className={`star ${isFav ? 'on' : ''}`} title={isFav ? 'Remove from favorites' : 'Add to favorites'}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav ? '#F59E0B' : 'none'} stroke={isFav ? '#F59E0B' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    </td>
                    <td>
                      <div className="pair">
                        <div style={{ position: 'relative', display: 'inline-flex', width: '32px', height: '32px', flexShrink: 0 }}>
                          {p.logoUrl ? (
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: p.logoShape === 'circle' ? '50%' : '8px',
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
                                width={32}
                                height={32}
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
                          ) : p.rwa ? (
                            <RwaLogo ticker={p.tick} size={32} showChainBadge={false} />
                          ) : (
                            <div className="coin" style={{ background: tickerColor(p.tick), width: '32px', height: '32px' }}>
                              {p.tick.slice(0, 2)}
                            </div>
                          )}
                          <RobinhoodBadge size={13} />
                        </div>
                        <div>
                          <div className="pn">
                            {p.tick} <span style={{ color: 'var(--dim)', fontWeight: 400 }}>/ {p.quoteAsset || (p.status === 'bonding' ? 'ETH' : 'USDG')}</span>
                          </div>
                          <div className="ps">
                            {p.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const trend = priceTrends[p.id.toLowerCase()] || priceTrends[p.tick.toLowerCase()] || priceTrends[p.tick.toLowerCase().replace(/^r/, '')]
                        return (
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 600,
                              color: trend === 'up' ? '#00c853' : trend === 'down' ? '#f6465d' : 'var(--mt)',
                              background: trend === 'up' ? 'rgba(0, 200, 83, 0.14)' : trend === 'down' ? 'rgba(246, 70, 93, 0.14)' : 'transparent',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              letterSpacing: '-0.01em',
                              transition: 'all 0.35s ease',
                              display: 'inline-block',
                            }}
                          >
                            ${px7(p.price, !!p.rwa)}
                          </span>
                        )
                      })()}
                    </td>
                    <td>
                      <span className={`chip ${u ? 'up' : 'dn'}`}>
                        {fmtPct(p.chg)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mt)' }}>
                        ${px7(p.hi, !!p.rwa)} / ${px7(p.lo, !!p.rwa)}
                      </span>
                    </td>

                    <td>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mt)' }}>
                        {fmtUsd(p.vol24)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--mt)' }}>
                        {fmtUsd(p.mcap)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {p.status === 'bonding' ? (
                          <span className="badge-pill bond">Bonding · {p.progress}%</span>
                        ) : (
                          <span className="badge-pill grad">🔥 Graduated</span>
                        )}
                        {p.battle > 0 && (
                          <span className="badge-pill battle">⚔️ BTL #{p.battle}</span>
                        )}
                        {p.rwa && (
                          p.rwaType === 'stock' ? (
                            <span className="badge-pill stock" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                                <polyline points="16 7 22 7 22 13" />
                              </svg>
                              Stock
                            </span>
                          ) : p.rwaType === 'treasury' ? (
                            <span className="badge-pill treasury" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                              </svg>
                              Treasury
                            </span>
                          ) : (
                            <span className="badge-pill rwa-paired" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                              </svg>
                              RWA
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <Link href={`/trade?pair=${p.id}`} className="btn btn-brand btn-sm">
                        Trade
                      </Link>
                    </td>
                  </tr>
                )
              })}
              {filteredProjects.length === 0 && (
                <tr className="empty-row">
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--ft)' }}>
                    No pairs found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

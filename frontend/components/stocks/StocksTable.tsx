'use client'

import Link from 'next/link'
import { Search, Building2, Landmark, TrendingUp, ArrowUpRight, Rocket } from 'lucide-react'
import { formatPrice } from '@/lib/formatters'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { type RwaAsset } from '@/lib/data'

export type StockTab = 'all' | 'stock' | 'etf' | 'treasury'

export type StockRow = {
  asset: RwaAsset
  /** Last trade of the underlying share, or the pool price when there is no listed share. Null until quoted. */
  price: number | null
  chg24: number | null
  /** Listed by the factory on this network, so a token can launch against it. */
  isPairAsset: boolean
}

interface StocksTableProps {
  rows: StockRow[]
  activeTab: StockTab
  setActiveTab: (tab: StockTab) => void
  search: string
  setSearch: (val: string) => void
  priceTrends: Record<string, 'up' | 'down' | 'flat' | null | undefined>
  onSelectTrade: (assetId: string) => void
}

export function StocksTable({
  rows,
  activeTab,
  setActiveTab,
  search,
  setSearch,
  priceTrends,
  onSelectTrade,
}: StocksTableProps) {
  return (
    <div className="sec">
      <div className="panel">
        <div className="markets-toolbar" style={{ padding: '16px 24px' }}>
          <div className="markets-toolbar-left">
            <div className="markets-title-group">
              <h3 className="markets-title">Stock Tokens</h3>
              <span className="markets-badge">
                <span className="markets-dot" />
                {rows.length} Tokens
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
                title="Last trade of each underlying share. Token prices on-chain can differ, most of all on weekends."
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
                Share Prices
              </span>
            </div>

            <div className="markets-divider" />

            <div className="markets-tabs">
              <button
                type="button"
                className={`markets-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All Assets
              </button>
              <button
                type="button"
                className={`markets-tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
                onClick={() => setActiveTab('stock')}
              >
                🏢 Stocks
              </button>
              <button
                type="button"
                className={`markets-tab-btn ${activeTab === 'treasury' ? 'active' : ''}`}
                onClick={() => setActiveTab('treasury')}
              >
                🏛 Treasuries
              </button>
            </div>
          </div>

          <div className="markets-search-wrap" style={{ width: '280px' }}>
            <Search size={14} className="markets-search-icon" />
            <input
              type="text"
              className="markets-search-inp"
              placeholder="Search assets by name or ticker..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="markets-search-clear"
                onClick={() => setSearch('')}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="tbl-scroll" style={{ padding: '4px 16px 14px' }}>
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '12px 14px' }}>Asset &amp; Underlying</th>
                <th style={{ textAlign: 'left', padding: '12px 14px' }}>Market Class</th>
                <th
                  style={{ textAlign: 'right', padding: '12px 14px' }}
                  title="Last trade of the underlying share, or of the token's own pool when there is no listed share. One token is worth the share price times its multiplier."
                >
                  Price
                </th>
                <th style={{ textAlign: 'right', padding: '12px 14px' }}>24h Change</th>
                <th style={{ textAlign: 'right', padding: '12px 14px' }}>Contract</th>
                <th style={{ textAlign: 'right', padding: '12px 14px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ asset: a, price, chg24, isPairAsset }) => {
                const u = (chg24 ?? 0) >= 0
                return (
                  <tr key={a.id} className="row" onClick={() => onSelectTrade(a.id)}>
                    {/* Asset & Underlying */}
                    <td style={{ padding: '14px 14px' }}>
                      <div className="pair" style={{ gap: '14px', alignItems: 'center' }}>
                        <RwaLogo ticker={a.ticker} size={40} />
                        <div>
                          <div className="pn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--tx)' }}>{a.name}</span>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                fontFamily: 'monospace',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'var(--inset)',
                                color: 'var(--mt)',
                                border: '1px solid var(--line2)',
                                letterSpacing: '0.02em',
                              }}
                            >
                              {a.token}
                            </span>
                            {isPairAsset && (
                              <span
                                style={{
                                  fontSize: '9.5px',
                                  fontWeight: 700,
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(var(--brand-rgb), 0.12)',
                                  color: 'var(--brand)',
                                  border: '1px solid rgba(var(--brand-rgb), 0.28)',
                                  letterSpacing: '0.02em',
                                  whiteSpace: 'nowrap',
                                }}
                                title="You can launch a token priced in this asset on Qualyra."
                              >
                                PAIR ASSET
                              </span>
                            )}
                          </div>
                          <div
                            className="ps"
                            style={{
                              fontSize: '12px',
                              color: 'var(--dim)',
                              marginTop: '3px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              maxWidth: '240px',
                            }}
                          >
                            <b style={{ color: 'var(--mt)', fontWeight: 600, flexShrink: 0 }}>{a.ticker}</b>
                            <span style={{ color: 'var(--ft)', flexShrink: 0 }}>·</span>
                            <span
                              style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                              title={a.desc}
                            >
                              {a.desc}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Market Class */}
                    <td style={{ padding: '14px 14px', whiteSpace: 'nowrap' }}>
                      {a.type === 'stock' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 9px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'rgba(37, 99, 235, 0.09)',
                            color: '#2563eb',
                            border: '1px solid rgba(37, 99, 235, 0.25)',
                            letterSpacing: '0.02em',
                          }}
                        >
                          <Building2 size={11} strokeWidth={2.2} /> U.S. EQUITY
                        </span>
                      ) : a.type === 'etf' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 9px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'rgba(124, 58, 237, 0.09)',
                            color: '#7c3aed',
                            border: '1px solid rgba(124, 58, 237, 0.25)',
                            letterSpacing: '0.02em',
                          }}
                        >
                          <TrendingUp size={11} strokeWidth={2.2} /> INDEX ETF
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '3px 9px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 700,
                            background: 'rgba(5, 150, 105, 0.09)',
                            color: '#059669',
                            border: '1px solid rgba(5, 150, 105, 0.25)',
                            letterSpacing: '0.02em',
                          }}
                        >
                          <Landmark size={11} strokeWidth={2.2} /> U.S. TREASURY
                        </span>
                      )}
                    </td>

                    {/* Price */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '14px 14px' }}>
                      {price === null ? (
                        <span style={{ fontSize: '14px', color: 'var(--dim)' }}>—</span>
                      ) : (() => {
                        const trend = priceTrends[a.id.toLowerCase()] || priceTrends[a.ticker.toLowerCase()]
                        return (
                          <span
                            style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: trend === 'up' ? '#00c853' : trend === 'down' ? '#f6465d' : 'var(--tx)',
                              background: trend === 'up' ? 'rgba(0, 200, 83, 0.14)' : trend === 'down' ? 'rgba(246, 70, 93, 0.14)' : 'transparent',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              transition: 'all 0.35s ease',
                              display: 'inline-block',
                            }}
                          >
                            ${formatPrice(price, true)}
                          </span>
                        )
                      })()}
                    </td>

                    {/* 24h Change */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '14px 14px' }}>
                      {chg24 === null ? (
                        <span style={{ fontSize: '13px', color: 'var(--dim)' }}>—</span>
                      ) : (
                        <span
                          className={`chip ${u ? 'up' : 'dn'}`}
                          style={{
                            fontWeight: 700,
                            fontSize: '12px',
                            padding: '3px 8px',
                            borderRadius: '5px',
                            display: 'inline-flex',
                            justifyContent: 'center',
                          }}
                        >
                          {u ? '+' : ''}{chg24.toFixed(2)}%
                        </span>
                      )}
                    </td>

                    {/* Contract */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '14px 14px' }} onClick={e => e.stopPropagation()}>
                      {a.address && a.explorerUrl ? (
                        <a
                          href={a.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={a.address}
                          style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--mt)' }}
                        >
                          {a.address.slice(0, 6)}…{a.address.slice(-4)} ↗
                        </a>
                      ) : (
                        <span style={{ fontSize: '13px', color: 'var(--dim)' }}>—</span>
                      )}
                    </td>

                    {/* Action */}
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '14px 14px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {isPairAsset && a.address && (
                          <Link
                            href={`/launch?quoteAsset=${a.address}`}
                            className="btn btn-subtle btn-sm"
                            style={{
                              padding: '5px 10px',
                              fontSize: '11.5px',
                              fontWeight: 700,
                              borderColor: 'rgba(174,212,60,0.3)',
                              color: 'var(--brand)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                            title={`Launch a new token pair against ${a.ticker} on Qualyra`}
                          >
                            <Rocket size={12} />
                            <span>Launch Pair</span>
                          </Link>
                        )}
                        <Link
                          href={`/trade?pair=${a.id}`}
                          className="btn btn-brand btn-sm"
                          style={{
                            fontWeight: 700,
                            padding: '5px 12px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '11.5px',
                            borderRadius: '6px',
                          }}
                        >
                          Trade <ArrowUpRight size={12} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Zap, Share2 } from 'lucide-react'
import { tickerColor, formatPrice, fmtUsd, fmtPct, formatTokenAmount } from '@/lib/utils'
import { logoTransform } from '@/lib/ipfs'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { openSharePnl } from '@/components/trade/SharePnlModal'
import { type UserPosition } from '@/lib/storage'
import { type Project } from '@/lib/data'

interface PositionsTabProps {
  positions: UserPosition[]
  projects: Project[]
  liveEthPrice: number
  onSelectPair: (id: string) => void
}

export function PositionsTab({
  positions,
  projects,
  liveEthPrice,
  onSelectPair,
}: PositionsTabProps) {
  if (positions.length === 0) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
        <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tx)', marginBottom: '6px' }}>No Active Token Holdings</h4>
        <p style={{ fontSize: '13px', color: 'var(--dim)', maxWidth: '420px', margin: '0 auto 18px' }}>
          You haven&apos;t bought or deployed any tokens yet. Start trading on the bonding curve or launch your own token on Robinhood Chain!
        </p>
        <Link href="/trade" className="btn btn-brand btn-sm" style={{ padding: '8px 18px' }}>
          Explore Markets &amp; Trade →
        </Link>
      </div>
    )
  }

  return (
    <div className="tbl-scroll">
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Balance &amp; Value</th>
            <th>Price</th>
            <th>Market Cap</th>
            <th>% Supply</th>
            <th>Curve Status</th>
            <th>24h Change</th>
            <th style={{ textAlign: 'right' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const matchProj = projects.find(proj => proj.id.toLowerCase() === p.id.toLowerCase())
            const quoteAsset = p.quoteAsset || matchProj?.quoteAsset || 'ETH'
            const isUsdg = quoteAsset === 'USDG'
            let rawPrice = p.price || matchProj?.price || 0
            if (rawPrice === 0 && matchProj?.goal) {
              rawPrice = (4.9 * matchProj.goal) / 1_000_000_000
            }
            const priceInUsd = isUsdg ? rawPrice : rawPrice * liveEthPrice
            const valueInUsd = p.balance * priceInUsd
            const chg24 = matchProj?.chg || 0
            const isUp = chg24 >= 0
            const mcapUsd = matchProj?.mcap && matchProj.mcap > 0 ? matchProj.mcap : (priceInUsd * 1_000_000_000)
            const supplyPct = Math.min(100, Math.max(0, (p.balance / 1_000_000_000) * 100))
            const isGraduated = matchProj?.status === 'graduated' || matchProj?.progress === 100
            const curveProgress = matchProj?.progress ?? 0

            return (
              <tr key={p.id} className="row" onClick={() => onSelectPair(p.id)}>
                <td>
                  <div className="pair">
                    <div style={{ position: 'relative', display: 'inline-flex', width: '34px', height: '34px', flexShrink: 0 }}>
                      {p.logoUrl ? (
                        <div
                          style={{
                            width: '34px',
                            height: '34px',
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
                            unoptimized
                            width={34}
                            height={34}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none'
                            }}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: p.logoFit || 'cover',
                              transform: logoTransform(p.logoScale),
                            }}
                          />
                        </div>
                      ) : p.rwa || p.tick.startsWith('r') ? (
                        <RwaLogo ticker={p.tick} size={34} showChainBadge={false} />
                      ) : (
                        <div className="coin" style={{ background: tickerColor(p.tick), width: '34px', height: '34px' }}>
                          {p.tick.slice(0, 2)}
                        </div>
                      )}
                      <RobinhoodBadge size={14} />
                    </div>
                    <div>
                      <div className="pn">
                        {p.tick} <span style={{ color: 'var(--dim)', fontSize: '11px' }}>/ {quoteAsset}</span>
                        {p.isCreator && (
                          <span style={{ marginLeft: '6px', fontSize: '10px', background: 'rgba(174,212,60,0.15)', color: 'var(--brand)', padding: '1px 5px', borderRadius: '3px', fontWeight: 600 }}>
                            CREATOR
                          </span>
                        )}
                        {p.rwa && (
                          <span
                            style={{
                              marginLeft: '6px',
                              fontSize: '9.5px',
                              background: 'rgba(59, 130, 246, 0.12)',
                              color: '#60A5FA',
                              border: '1px solid rgba(59, 130, 246, 0.3)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontWeight: 700,
                            }}
                          >
                            RWA
                          </span>
                        )}
                      </div>
                      <div className="ps">{p.name}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: '13.5px', fontFamily: 'var(--font-mono, inherit)' }}>
                      {formatTokenAmount(p.balance, !!p.rwa)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px', fontFamily: 'var(--font-mono, inherit)' }}>
                      {valueInUsd >= 0.01
                        ? `≈ $${valueInUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                        : valueInUsd > 0
                        ? '≈ <$0.01 USD'
                        : '≈ $0.00 USD'}
                    </div>
                  </div>
                </td>
                <td>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: '13px' }}>
                      ${formatPrice(priceInUsd, !!p.rwa)}
                    </div>
                    {!isUsdg && rawPrice > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '1px' }}>
                        {formatPrice(rawPrice)} ETH
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: '13px', fontFamily: 'var(--font-mono, inherit)' }}>
                      {fmtUsd(mcapUsd)}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '1px' }}>
                      FDV
                    </div>
                  </div>
                </td>
                <td>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: '13px', fontFamily: 'var(--font-mono, inherit)' }}>
                      {supplyPct >= 0.01 ? `${supplyPct.toFixed(2)}%` : '<0.01%'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                      of 1B Supply
                    </div>
                  </div>
                </td>
                <td>
                  {isGraduated ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#34D399',
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        padding: '2px 7px',
                        borderRadius: '4px',
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                      Graduated
                    </span>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11.5px', fontWeight: 600, color: '#F59E0B' }}>
                        <Zap size={12} />
                        <span>{curveProgress.toFixed(0)}%</span>
                        <span style={{ fontSize: '10px', color: 'var(--dim)', fontWeight: 400 }}>Bonding</span>
                      </div>
                      <div style={{ width: '64px', height: '3.5px', background: 'var(--line)', borderRadius: '2px', overflow: 'hidden', marginTop: '3px' }}>
                        <div style={{ width: `${Math.min(100, Math.max(2, curveProgress))}%`, height: '100%', background: '#F59E0B', borderRadius: '2px' }} />
                      </div>
                    </div>
                  )}
                </td>
                <td>
                  <span
                    className={`chip ${isUp ? 'up' : 'dn'}`}
                    style={{
                      fontWeight: 600,
                      fontSize: '11.5px',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {fmtPct(chg24, 2)}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => {
                        openSharePnl({
                          tick: p.tick,
                          name: p.name,
                          entry: p.entry || rawPrice,
                          price: rawPrice,
                          balance: p.balance,
                          isProfit: isUp,
                          pnlPct: Math.abs(chg24),
                          pnlUsd: Math.round(valueInUsd * (chg24 / 100)),
                          quoteAsset,
                        })
                      }}
                      className="btn btn-subtle btn-sm"
                      style={{
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                      title="Share PnL Brag Card"
                    >
                      <Share2 size={12} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                      <span>Share</span>
                    </button>
                    <Link href={`/trade?pair=${p.id}`} className="btn btn-brand btn-sm">
                      Trade
                    </Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

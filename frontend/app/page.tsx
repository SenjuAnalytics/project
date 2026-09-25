'use client'

import { useMemo } from 'react'
import { logoTransform } from '@/lib/ipfs'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAllProjects } from '@/hooks/useAllProjects'
import { useCompetition } from '@/hooks/useCompetition'
import { WeeklyBanner } from '@/components/shared/WeeklyBanner'
import { MarketsTable } from '@/components/shared/MarketsTable'
import { tickerColor, formatPrice, formatPercent, fmtUsd } from '@/lib/utils'
import { motion } from 'framer-motion'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

export default function HomePage() {
  const router = useRouter()
  const { projects, chainProjects, chainLive, tokenCount } = useAllProjects()
  const competition = useCompetition()

  const topMovers = useMemo(() => {
    return [...projects].sort((a, b) => b.chg - a.chg).slice(0, 5)
  }, [projects])

  // Real 24h volume strictly from tokens deployed on Qualyra (0 if no trades in last 24h)
  const totalVol24h = useMemo(() => {
    return chainProjects.reduce((acc, p) => acc + (p.vol24 || 0), 0)
  }, [chainProjects])

  // Real tokens count strictly from QualyraFactory on-chain
  const totalTokensCount = chainLive ? tokenCount : 0
  const competitionPool = competition.totalPrizePoolUsd

  return (
    <div>
      <div className="wrap">
        {/* ===== HERO ===== */}
        <div className="hero">
          <div className="panel hero-l">
            <div className="kick">LIVE ON ROBINHOOD CHAIN</div>
            <h1 className="hero-title">Launch. Prove. <em>Battle.</em></h1>
            <p>
              The exchange where tokens launch on a bonding curve, prove real market activity - not wash trading - and battle for rewards funded by real revenue.
            </p>
            <div className="hero-cta">
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
                <Link href="/trade" className="btn btn-brand">Start Trading</Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}>
                <Link href="/launch" className="btn btn-ghost">Launch a Token</Link>
              </motion.div>
            </div>
            <div className="hero-stats" style={{ display: 'flex', gap: '36px', marginTop: '28px', flexWrap: 'wrap' }}>
              <div>
                <div className="v" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--tx)', lineHeight: 1.1 }}>
                  {fmtUsd(totalVol24h)}
                </div>
                <div className="l" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--mt)', marginTop: '4px' }}>
                  Qualified vol · 24h
                </div>
              </div>
              <div>
                <div className="v" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--tx)', lineHeight: 1.1 }}>
                  {chainLive ? totalTokensCount : '—'}
                </div>
                <div className="l" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--mt)', marginTop: '4px' }}>
                  Tokens launched
                </div>
              </div>
              <div>
                <div className="v" style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.02em', color: '#0ECB81', lineHeight: 1.1 }}>
                  <SubCentUsd amount={competitionPool} prefix="$" />
                </div>
                <div className="l" style={{ fontSize: '12px', fontWeight: 500, color: 'var(--mt)', marginTop: '4px' }}>
                  Trader League pool
                </div>
              </div>
            </div>
          </div>

          {/* Top Movers Panel */}
          <div className="panel movers" style={{ paddingBottom: '8px' }}>
            <div className="mv-hd" style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--line)', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--tx)" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="var(--brand-dim)"/>
                </svg>
                <b style={{ fontSize: '14.5px', letterSpacing: '-0.01em', color: 'var(--tx)' }}>Top Movers</b>
              </div>
              <Link href="/trade" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx)', background: 'var(--brand-dim)', padding: '4px 10px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', userSelect: 'none' }}>
                Trade All
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
            <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topMovers.map((p, i) => {
                const u = p.chg >= 0
                const pxStr = formatPrice(p.price, !!p.rwa)
                
                let rankClass = ''
                let rankMedal = ''
                if (i === 0) {
                  rankClass = 'rank-1'
                  rankMedal = '🥇'
                } else if (i === 1) {
                  rankClass = 'rank-2'
                  rankMedal = '🥈'
                } else if (i === 2) {
                  rankClass = 'rank-3'
                  rankMedal = '🥉'
                }

                return (
                  <motion.div
                    key={p.id}
                    className={`mv-row ${rankClass}`}
                    onClick={() => router.push(`/trade?pair=${p.id}`)}
                    whileHover={{ scale: 1.012, x: 2 }}
                    whileTap={{ scale: 0.985 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '10px 14px',
                      gap: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {/* Rank Indicator */}
                    <div
                      style={{
                        width: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {rankMedal ? (
                        <span style={{ fontSize: '16px', lineHeight: 1 }}>{rankMedal}</span>
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: 'var(--mt)',
                            background: 'var(--inset, rgba(255,255,255,0.06))',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            letterSpacing: '0.02em',
                            border: '1px solid var(--line)',
                          }}
                        >
                          #{i + 1}
                        </span>
                      )}
                    </div>

                    {/* Token Logo */}
                    <div style={{ position: 'relative', width: '32px', height: '32px', flexShrink: 0 }}>
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
                          <img
                            src={p.logoUrl}
                            alt={p.tick}
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
                        <div
                          className="coin"
                          style={{
                            background: tickerColor(p.tick),
                            width: '32px',
                            height: '32px',
                            fontSize: '10.5px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05), inset 0 0 0 1px rgba(0,0,0,0.05)',
                          }}
                        >
                          {p.tick.slice(0, 2)}
                        </div>
                      )}
                      <RobinhoodBadge size={13} />
                    </div>

                    {/* Ticker & Name */}
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                        ${p.tick}
                      </div>
                      <div
                        style={{
                          fontSize: '11.5px',
                          color: 'var(--mt)',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                          overflow: 'hidden',
                          marginTop: '2px',
                          fontWeight: 500,
                          lineHeight: 1.2,
                        }}
                      >
                        {p.name}
                      </div>
                    </div>

                    {/* Price & Change */}
                    <div
                      style={{
                        textAlign: 'right',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        gap: '3px',
                        flexShrink: 0,
                        minWidth: '80px',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 800,
                          color: 'var(--tx)',
                          letterSpacing: '-0.02em',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ color: 'var(--dim)', marginRight: '2px', fontSize: '12px', fontWeight: 600 }}>$</span>
                        {pxStr}
                      </div>
                      <div
                        className={`chip ${u ? 'up' : 'dn'}`}
                        style={{
                          padding: '2.5px 8px',
                          fontSize: '10.5px',
                          borderRadius: '5px',
                          fontWeight: 800,
                          letterSpacing: '0.01em',
                          minWidth: '60px',
                          textAlign: 'center',
                        }}
                      >
                        {formatPercent(p.chg)}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ===== BATTLE POOL BANNER ===== */}
        <WeeklyBanner />

        {/* ===== MARKETS TABLE ===== */}
        <MarketsTable projects={projects} />

        {/* ===== WHY TRADE ON QUALYRA ===== */}
        <div className="sec">
          <div className="sec-hd"><h3>Why trade on Qualyra</h3></div>
          <div className="feats">
            <div className="panel feat">
              <div className="ic">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--brand)" strokeWidth="1.7">
                  <path d="M10 1.8L16.5 4v5c0 4.2-2.9 6.9-6.5 8.2C6.4 15.9 3.5 13.2 3.5 9V4L10 1.8z" />
                  <path d="M7.5 9.5l1.8 1.8 3.2-3.6" />
                </svg>
              </div>
              <h4>Liquidity locked on every launch</h4>
              <p>At graduation the whole raise seeds the pool, and the contract that owns it has no function to take it out. If a finished curve cannot graduate for 7 days, buyers can be refunded proportionally instead.</p>
            </div>
            <div className="panel feat">
              <div className="ic">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--brand)" strokeWidth="1.7">
                  <path d="M3 17V9M8 17V4M13 17v-6M18 17V7" />
                </svg>
              </div>
              <h4>Qualified volume, not wash</h4>
              <p>Self-trades, linked wallets and buy-sell loops are filtered before ranking. Battles are settled on verified activity.</p>
            </div>
            <div className="panel feat">
              <div className="ic">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--brand)" strokeWidth="1.7">
                  <path d="M6 3h8v4a4 4 0 01-8 0V3z" />
                  <path d="M6 4H3.5v1A3.5 3.5 0 007 8.5M14 4h2.5v1A3.5 3.5 0 0113 8.5M10 11v2M7.5 17h5M8.5 13.5h3" />
                </svg>
              </div>
              <h4>Rewards from real revenue</h4>
              <p>Battle pots and the Trader League are funded by trading fees alone: nothing is printed and there is no entry fee. The more real volume, the bigger the pool.</p>
            </div>
          </div>
        </div>

        {/* ===== CTA BAND ===== */}
        <div className="sec">
          <div className="panel cta-band">
            <h3>Have a project? List it in minutes.</h3>
            <p>Bonding curve, locked liquidity and Battle eligibility - all in one flow.</p>
            <Link href="/launch" className="btn btn-brand">Launch a Token</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

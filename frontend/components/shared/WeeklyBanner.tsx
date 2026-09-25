'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useCompetition } from '@/hooks/useCompetition'
import { currentWeekEnd } from '@/lib/competitionTime'
import { formatCryptoAmount } from '@/lib/utils'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

const PLACES = ['🥇 1st', '🥈 2nd', '🥉 3rd', '4th', '5th']

export function WeeklyBanner() {
  const competition = useCompetition()
  const { totalPrizePoolUsd, currentWeek, currentWeekNum, firstLeagueWeek, prizeShares } = competition
  const isBootstrap = firstLeagueWeek === 0

  // Counts down to the vault's weekEndsAt; before the first read, to the same Monday computed locally.
  const [cd, setCd] = useState({ d: '--', h: '--', m: '--', s: '--' })

  useEffect(() => {
    const updateCd = () => {
      const now = Math.floor(Date.now() / 1000)
      const endsAt = currentWeek?.endsAt || currentWeekEnd(now)
      const diff = Math.max(0, endsAt - now)
      const d = Math.floor(diff / 86400)
      const h = Math.floor((diff % 86400) / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setCd({
        d: String(d).padStart(2, '0'),
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0'),
      })
    }

    updateCd()
    const t = setInterval(updateCd, 1000)
    return () => clearInterval(t)
  }, [currentWeek?.endsAt])

  // Only what the vault actually holds. The pool starts every week at zero and fills from fees.
  const poolUsd = Math.max(0, totalPrizePoolUsd)
  const hasFees = poolUsd > 0

  return (
    <div className="sec">
      <div className="panel weekly-banner-panel">
        {/* Left: Info */}
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--brand)', fontSize: '11px', fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: '4px' }}>
            <span>🏆</span> {isBootstrap ? 'QUALYRA ARENA · BOOTSTRAP POOL' : `QUALYRA ARENA · WEEK #${currentWeekNum} POOL`}
          </div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: 'var(--brand)', letterSpacing: '-.02em', lineHeight: 1.1 }}>
            <SubCentUsd amount={poolUsd} prefix="$" />
          </div>
          {currentWeek?.pools && currentWeek.pools.length > 0 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', fontFamily: 'monospace', color: 'var(--dim)' }}>
              <span className="livedot" style={{ width: '6px', height: '6px', background: '#22c55e' }}></span>
              <span>On-Chain:</span>
              <b style={{ color: 'var(--tx)' }}>
                {currentWeek.pools.map(p => formatCryptoAmount(p.amount, p.symbol, 7)).join(' + ')}
              </b>
            </div>
          )}
          <div className="k" style={{ marginTop: '6px', lineHeight: 1.5, color: 'var(--mt)', fontSize: '12.5px' }}>
            {hasFees
              ? `Collected from trading fees this week. The top ${prizeShares.length} traders split it ${prizeShares.join('/')}.`
              : 'Nothing collected yet. The pool fills from trading fees as the week goes.'}
          </div>
        </div>
        
        {/* Center: Countdown */}
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--inset)', padding: '12px 20px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--dim)', letterSpacing: '.1em', marginBottom: '8px' }}>
            <span className="livedot"></span> WEEK CLOSES IN
          </div>
          <div className="cdchips" style={{ gap: '8px', margin: 0 }}>
            <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.d}</b><span>DAYS</span></div>
            <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.h}</b><span>HRS</span></div>
            <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.m}</b><span>MIN</span></div>
            <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.s}</b><span>SEC</span></div>
          </div>
        </div>

        {/* Center-Right: Prize Distribution */}
        <div style={{ flex: '1 1 200px', fontSize: '12px', color: 'var(--mt)', lineHeight: 1.8, background: 'var(--inset)', padding: '12px 16px', borderRadius: '6px', border: '1px solid var(--line)' }}>
          {PLACES.slice(0, prizeShares.length).map((place, i) => (
            <div
              key={place}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                ...(i === 0 ? { borderBottom: '1px solid var(--line)', paddingBottom: '4px', marginBottom: '4px' } : {}),
              }}
            >
              <span className={i < 2 ? undefined : 'dim'} style={{ fontWeight: 500 }}>
                {place} ({prizeShares[i]}%)
              </span>{' '}
              <b style={{ color: i === 0 ? 'var(--brand)' : 'var(--tx)' }}>
                <SubCentUsd amount={(poolUsd * prizeShares[i]) / 100} prefix="$" />
              </b>
            </div>
          ))}
        </div>

        {/* Right: CTA */}
        <div className="weekly-banner-cta" style={{ flex: '0 0 auto' }}>
          <Link href="/battles" className="btn btn-brand" style={{ padding: '14px 28px', fontSize: '14px', fontWeight: 700 }}>
            Enter Arena
          </Link>
        </div>
      </div>
    </div>
  )
}

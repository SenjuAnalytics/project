'use client'

import { Sparkles } from 'lucide-react'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

interface TournamentHeroBannerProps {
  /** Pots of battles not yet finalized, in USD. */
  potUsd: number
  /** The same pots per pair asset, e.g. "0.12 ETH, 40 USDG". */
  nativeBreakdown?: string
  openCount: number
  userBattleCount: number
  cd: { d: string; h: string; m: string; s: string }
}

const RULES = [
  { icon: '✅', label: '$100k market cap', text: 'held for 24 hours to qualify' },
  { icon: '🔗', label: 'Same pair asset', text: 'ETH against ETH, USDG against USDG' },
  { icon: '📊', label: 'Score', text: '70% qualified volume, 30% unique buyers' },
  { icon: '🔥', label: 'Winner takes the pot', text: 'and it buys back and burns that token' },
]

export function TournamentHeroBanner({
  potUsd,
  nativeBreakdown,
  openCount,
  userBattleCount,
  cd,
}: TournamentHeroBannerProps) {
  return (
    <div className="sec">
      <div
        className="panel"
        style={{
          padding: '28px 32px',
          background: 'linear-gradient(135deg, var(--panel) 45%, rgba(var(--brand-rgb),0.09) 100%)',
          borderColor: 'rgba(var(--brand-rgb),0.4)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div className="battle-hero-grid">
          {/* Left: Pool Amount */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--brand)',
                fontSize: '11.5px',
                fontWeight: 800,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              <span>🏆</span> QUALYRA ARENA · BATTLE POTS
            </div>
            <div style={{ fontSize: '44px', fontWeight: 900, color: 'var(--brand)', letterSpacing: '-.02em', lineHeight: 1, display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
              <SubCentUsd amount={potUsd} prefix="$" />
              <span style={{ fontSize: '18px', color: 'var(--dim)', fontWeight: 600, marginLeft: '6px' }}>USD</span>
            </div>

            {nativeBreakdown && (
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '10px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    background: 'var(--inset)',
                    border: '1px solid rgba(var(--brand-rgb), 0.25)',
                    fontSize: '12.5px',
                    fontFamily: 'monospace',
                    color: 'var(--tx)',
                  }}
                >
                  <span className="livedot" style={{ width: '7px', height: '7px', background: '#22c55e' }}></span>
                  <span style={{ color: 'var(--dim)' }}>In {openCount} open {openCount === 1 ? 'battle' : 'battles'}:</span>
                  <b style={{ color: 'var(--brand)', letterSpacing: '0.02em' }}>{nativeBreakdown}</b>
                </div>
              </div>
            )}

            <p style={{ color: 'var(--mt)', fontSize: '13px', marginTop: '10px', lineHeight: 1.6, maxWidth: '360px' }}>
              Battles run from 00:00 to 24:00 UTC. Until its battle is booked, 70% of a token&apos;s competition share
              (15% of every trading fee) is held for its pot, and from the booking until the 24 hours end all of it goes
              in. Once the result clears its challenge window, the pot buys back and burns the winning token on its own.
              On a draw, each token&apos;s own contribution buys back and burns that token.
            </p>

            {userBattleCount > 0 && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '12px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  background: 'var(--brand-dim)',
                  border: '1px solid rgba(var(--brand-rgb), 0.4)',
                  fontSize: '11.5px',
                  color: 'var(--brand)',
                  fontWeight: 700,
                }}
              >
                <Sparkles size={12} />
                <span>
                  {userBattleCount === 1 ? 'One of your tokens is' : `${userBattleCount} of your tokens are`} in a battle
                </span>
              </div>
            )}
          </div>

          {/* Center: Live Countdown Card */}
          <div
            style={{
              textAlign: 'center',
              background: 'var(--panel)',
              padding: '18px 20px',
              borderRadius: '8px',
              border: '1px solid var(--line)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--dim)',
                letterSpacing: '.1em',
                marginBottom: '10px',
              }}
            >
              <span className="livedot"></span> WEEK CLOSES IN
            </div>
            <div className="cdchips" style={{ gap: '8px', margin: 0 }}>
              <div style={{ padding: '6px 0', width: '54px' }}><b>{cd.d}</b><span>DAYS</span></div>
              <div style={{ padding: '6px 0', width: '54px' }}><b>{cd.h}</b><span>HRS</span></div>
              <div style={{ padding: '6px 0', width: '54px' }}><b>{cd.m}</b><span>MIN</span></div>
              <div style={{ padding: '6px 0', width: '54px' }}><b>{cd.s}</b><span>SEC</span></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '8px' }}>
              Battle Points reset Monday 00:00 UTC
            </div>
          </div>

          {/* Right: Rules */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', justifyContent: 'center', fontSize: '12.5px', lineHeight: 1.45 }}>
            {RULES.map(rule => (
              <div key={rule.label} style={{ display: 'flex', gap: '8px', alignItems: 'baseline', color: 'var(--mt)' }}>
                <span aria-hidden="true">{rule.icon}</span>
                <span>
                  <b style={{ color: 'var(--tx)' }}>{rule.label}</b> {rule.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

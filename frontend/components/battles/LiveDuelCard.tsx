'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, Flame } from 'lucide-react'
import { px7, fmtUsd } from '@/lib/utils'
import { BattleTokenLogo } from '@/components/battles/BattleTokenLogo'
import { type DuelView } from '@/hooks/battles/useBattleState'
import { type BattleStatus } from '@/hooks/useCompetition'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

interface LiveDuelCardProps {
  m: DuelView
  onFinalize?: (battleId: number) => void
  isPendingFinalize?: boolean
}

/** Mirrors QualyraCompetitionVault.Outcome. */
function resultLabel(m: DuelView): string | null {
  if (m.outcome === 0) return null
  if (m.outcome === 3) return 'DRAW'
  if (m.outcome === 6) return 'VOID'
  if (m.winnerSide === 'A') return `$${m.a.tick} WON`
  if (m.winnerSide === 'B') return `$${m.b.tick} WON`
  return null
}

const STATUS_LABEL: Record<BattleStatus, string> = {
  upcoming: 'Upcoming',
  live: 'Live',
  'awaiting-result': 'Scoring',
  challenge: 'Challenge window',
  finalized: 'Settled',
  void: 'Void',
  canceled: 'Canceled',
}

/** Hours and minutes left until `at`. */
function TimeLeft({ at }: { at: number }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000)
    return () => clearInterval(timer)
  }, [])
  const left = Math.max(0, at - now)
  return (
    <span className="mono">
      {Math.floor(left / 3600)}h {String(Math.floor((left % 3600) / 60)).padStart(2, '0')}m
    </span>
  )
}

export function LiveDuelCard({ m, onFinalize, isPendingFinalize }: LiveDuelCardProps) {
  const { status, canFinalize } = m
  const volA = m.a.vol24 || 0
  const volB = m.b.vol24 || 0
  const totVol = volA + volB

  // Same weights the operator scores with (70% qualified volume, 30% unique buyers), but fed with 24h
  // volume and holder counts. The official score only exists once the result is posted.
  const buyersA = m.a.holders || 0
  const buyersB = m.b.holders || 0
  const totBuyers = buyersA + buyersB

  const domA = (totVol === 0 && totBuyers === 0)
    ? 50
    : Math.min(95, Math.max(5, Math.round(
        (0.70 * (totVol > 0 ? volA / totVol : 0.5) +
         0.30 * (totBuyers > 0 ? buyersA / totBuyers : 0.5)) * 100
      )))
  const domB = 100 - domA

  const isALeading = domA >= 50
  const isUserBattle = m.isUserBattle
  const result = resultLabel(m)

  return (
    <div className={`battle-fixture-card ${isUserBattle ? 'user-battle' : ''}`}>
      {/* Top Header Bar: Integrated, Low-Profile Slim Strip */}
      <div className="bfc-header">
        <div className="bfc-header-left">
          <span className="bfc-battle-tag">{m.title}</span>
          {isUserBattle && <span className="bfc-badge-user">YOUR TOKEN</span>}
          {status && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: '4px',
                background: status === 'live' ? 'rgba(34, 197, 94, 0.2)' : 'var(--inset)',
                color: status === 'live' ? '#22c55e' : 'var(--dim)',
                textTransform: 'uppercase',
              }}
            >
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>

        <div className="bfc-header-center">
          <span title="Estimated from 24h volume and holders. The posted result uses qualified volume and unique buyers inside the battle window.">
            SCORE EST. (70% VOL + 30% BUYERS)
          </span>
        </div>

        <div className="bfc-header-right">
          <span className="bfc-prize-tag">
            Pot: <b><SubCentUsd amount={m.pot} prefix="$" /></b>
            {m.nativePot && (
              <span style={{ marginLeft: '4px', opacity: 0.85, fontSize: '11px', fontFamily: 'monospace' }}>
                ({m.nativePot})
              </span>
            )}
          </span>
          {result ? (
            <span className={`bfc-lead-pill ${m.winnerSide === 'B' ? 'lead-b' : 'lead-a'}`}>🏁 {result}</span>
          ) : (
            <span className={`bfc-lead-pill ${isALeading ? 'lead-a' : 'lead-b'}`}>
              👑 {isALeading ? `$${m.a.tick}` : `$${m.b.tick}`} AHEAD ({isALeading ? domA : domB}%)
            </span>
          )}
          {status === 'challenge' && !m.settleOverdue && (
            <span
              title="Settled automatically when the challenge window closes. The first buyback runs in the same transaction."
              style={{ fontSize: '11px', color: 'var(--dim)', whiteSpace: 'nowrap' }}
            >
              {canFinalize ? 'Settling now' : <>Settles in <TimeLeft at={m.settlesAt} /></>}
            </span>
          )}
          {m.settleOverdue && onFinalize && (
            <button
              type="button"
              disabled={isPendingFinalize}
              onClick={() => onFinalize(m.id)}
              title="The automatic settlement is running late. Anyone can settle it; the pot then goes to the buyback."
              className="btn btn-brand btn-sm"
              style={{
                fontSize: '11px',
                padding: '3px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: '#ef4444',
                borderColor: '#ef4444',
              }}
            >
              <Flame size={12} />
              <span>{isPendingFinalize ? 'Settling…' : 'Settle now'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Arena Strip */}
      <div className="bfc-body">
        {/* Contender A (Left) */}
        <div className={`bfc-contender a-side ${isALeading ? 'is-leading' : ''}`}>
          <div className="bfc-contender-info">
            <div className="bfc-logo-wrap">
              <BattleTokenLogo p={m.a} size={38} />
            </div>
            <div className="bfc-token-meta">
              <div className="bfc-token-title">
                <span className="bfc-ticker">${m.a.tick}</span>
                <span className="bfc-name">{m.a.name}</span>
                {isALeading && <span className="bfc-leader-crown">👑 LEADER</span>}
              </div>
              <div className="bfc-token-sub">
                <span className="bfc-price">${px7(m.a.price, !!m.a.rwa)}</span>
                <span className="bfc-sub-dot">•</span>
                <span className="bfc-vol-val">Vol: <b>{fmtUsd(m.a.vol24)}</b></span>
              </div>
            </div>
          </div>

          <div className="bfc-actions">
            <Link
              href={`/trade?pair=${m.a.id}`}
              className="btn btn-subtle bfc-btn-trade"
              title={`Trade ${m.a.tick}`}
            >
              <span>Trade</span>
              <ExternalLink size={10} />
            </Link>
          </div>
        </div>

        {/* Center Clash Epicenter */}
        <div className="bfc-clash-hub">
          <div className="bfc-clash-gloves-stage" title="Tournament Clash Duel">
            <div className="duel-gloves-aura" />
            <Image
              src="/battle-gloves.png?v=2"
              alt="Boxing Gloves Clash"
              width={46}
              height={46}
              unoptimized
              className="duel-gloves-img"
            />
          </div>
          <span className="bfc-vs-pill">VS</span>
          <div className="bfc-score-badge">
            <span className="score-a">{domA}%</span>
            <span className="score-div">:</span>
            <span className="score-b">{domB}%</span>
          </div>
        </div>

        {/* Contender B (Right) */}
        <div className={`bfc-contender b-side ${!isALeading ? 'is-leading' : ''}`}>
          <div className="bfc-actions">
            <Link
              href={`/trade?pair=${m.b.id}`}
              className="btn btn-subtle bfc-btn-trade"
              title={`Trade ${m.b.tick}`}
            >
              <span>Trade</span>
              <ExternalLink size={10} />
            </Link>
          </div>

          <div className="bfc-contender-info b-info">
            <div className="bfc-token-meta b-meta">
              <div className="bfc-token-title b-title">
                {!isALeading && <span className="bfc-leader-crown">👑 LEADER</span>}
                <span className="bfc-ticker">${m.b.tick}</span>
                <span className="bfc-name">{m.b.name}</span>
              </div>
              <div className="bfc-token-sub b-sub">
                <span className="bfc-price">${px7(m.b.price, !!m.b.rwa)}</span>
                <span className="bfc-sub-dot">•</span>
                <span className="bfc-vol-val">Vol: <b>{fmtUsd(m.b.vol24)}</b></span>
              </div>
            </div>
            <div className="bfc-logo-wrap">
              <BattleTokenLogo p={m.b} size={38} />
            </div>
          </div>
        </div>
      </div>

      {/* Integrated Bottom Tug-of-War Track */}
      <div className="bfc-dominance-track">
        <div
          className="bfc-dominance-fill a-fill"
          style={{ width: `${domA}%` }}
          title={`$${m.a.tick}: ${domA}% (estimate)`}
        />
        <div
          className="bfc-dominance-fill b-fill"
          style={{ width: `${domB}%` }}
          title={`$${m.b.tick}: ${domB}% (estimate)`}
        />
      </div>
    </div>
  )
}

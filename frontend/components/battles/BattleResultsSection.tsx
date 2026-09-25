'use client'

import { Flame, Trophy } from 'lucide-react'
import { useCompetition, type BattleView } from '@/hooks/useCompetition'
import { useBuybacks } from '@/hooks/battles/useBuybacks'
import { explorerUrl } from '@/lib/contracts'
import { formatCryptoAmount } from '@/lib/utils'
import { formatTokenAmount } from '@/lib/formatters'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

/** Mirrors QualyraCompetitionVault.Outcome. */
function resultText(b: BattleView): string {
  if (b.status === 'canceled') {
    return "Canceled before the start. Each token's contribution went back to its pending pot, and both can battle again"
  }
  switch (b.outcome) {
    case 1:
      return `$${b.tokenA.tick} won`
    case 2:
      return `$${b.tokenB.tick} won`
    case 3:
      return "Draw, each token's contribution buys back that token"
    case 4:
      return `$${b.tokenA.tick} disqualified, $${b.tokenB.tick} takes the pot`
    case 5:
      return `$${b.tokenB.tick} disqualified, $${b.tokenA.tick} takes the pot`
    case 6:
      return "Void, each token's contribution buys back that token"
    default:
      return 'Finalized'
  }
}

const PLACES = ['🥇 1st', '🥈 2nd', '🥉 3rd', '4th', '5th']

const statCard = { background: 'var(--inset)', padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--line)' }

export function BattleResultsSection() {
  const { pastWeeks, battles, totalPrizePoolUsd, vaultAddress, currentWeekNum, chainId, prizeShares } = useCompetition()
  const burns = useBuybacks()

  const settled = battles.filter(b => b.finalized).sort((x, y) => y.startTime - x.startTime)
  const hasHistory = pastWeeks.length > 0 || settled.length > 0
  const explorer = explorerUrl(chainId)
  const tickOf = (b: BattleView, token: string) =>
    token.toLowerCase() === b.tokenA.address.toLowerCase() ? b.tokenA.tick : b.tokenB.tick

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div
        className="panel"
        style={{
          padding: '28px 32px',
          background: 'linear-gradient(135deg, var(--panel) 45%, rgba(255, 179, 0, 0.08) 100%)',
          borderColor: 'rgba(255, 179, 0, 0.35)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#ffb300',
                fontSize: '11.5px',
                fontWeight: 800,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              <span>🏛️</span> QUALYRA BATTLES · ON-CHAIN ARCHIVE
            </div>
            <h2 style={{ fontSize: '30px', fontWeight: 900, color: 'var(--tx)', letterSpacing: '-.02em', margin: 0 }}>
              Results &amp; Burns
            </h2>
            <p style={{ color: 'var(--mt)', fontSize: '13.5px', marginTop: '10px', lineHeight: 1.6, maxWidth: '580px' }}>
              Battle results, buybacks and weekly Trader League winners, read from the competition vault and the
              buyback burner.
            </p>
          </div>

          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              padding: '16px 20px',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              minWidth: '220px',
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Competition Vault
            </div>
            {vaultAddress ? (
              <a
                href={`${explorer}/address/${vaultAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}
              >
                {vaultAddress.slice(0, 8)}…{vaultAddress.slice(-6)} ↗
              </a>
            ) : (
              <code style={{ fontSize: '11px', color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>Not deployed</code>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginTop: '24px',
            borderTop: '1px solid var(--line)',
            paddingTop: '20px',
          }}
        >
          <div style={statCard}>
            <div style={{ fontSize: '11.5px', color: 'var(--dim)', fontWeight: 600 }}>Trader League Pool</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--brand)', marginTop: '4px' }}>
              <SubCentUsd amount={totalPrizePoolUsd} prefix="$" />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>From trading fees only</div>
          </div>

          <div style={statCard}>
            <div style={{ fontSize: '11.5px', color: 'var(--dim)', fontWeight: 600 }}>Current League Round</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--tx)', marginTop: '4px' }}>Week #{currentWeekNum}</div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>Resets every Monday 00:00 UTC</div>
          </div>

          <div style={statCard}>
            <div style={{ fontSize: '11.5px', color: 'var(--dim)', fontWeight: 600 }}>Challenge Window</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--tx)', marginTop: '4px' }}>48h / 24h</div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>Trader League / battles</div>
          </div>

          <div style={statCard}>
            <div style={{ fontSize: '11.5px', color: 'var(--dim)', fontWeight: 600 }}>Prize Distribution</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#00c853', marginTop: '6px' }}>
              {prizeShares.join(' / ')}%
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>Top {prizeShares.length} wallets per week</div>
          </div>
        </div>
      </div>

      {!hasHistory ? (
        <div
          className="panel"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            background: 'var(--panel)',
            borderRadius: '12px',
            border: '1px solid var(--line)',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏛️</div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx)', marginBottom: '8px' }}>Nothing settled yet</h3>
          <p style={{ fontSize: '13px', color: 'var(--dim)', maxWidth: '520px', margin: '0 auto', lineHeight: 1.6 }}>
            Finalized battles, their buybacks and each week&apos;s Trader League winners show up here once the vault
            settles them.
          </p>
        </div>
      ) : (
        <>
          {settled.length > 0 && (
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Flame size={18} style={{ color: '#ef4444' }} />
                <span>Battle Results</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {settled.map(b => {
                  const burned = burns.get(b.id) ?? []
                  return (
                    <div key={b.id} className="panel" style={{ padding: '18px 20px', borderRadius: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '15px', color: 'var(--tx)' }}>
                          Battle #{b.id} · ${b.tokenA.tick} vs ${b.tokenB.tick}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--dim)', fontFamily: 'var(--font-mono)' }}>
                          {b.pot > 0 ? formatCryptoAmount(b.pot, b.assetSymbol, 7) : '—'}
                        </span>
                      </div>
                      <div style={{ fontSize: '12.5px', color: 'var(--mt)', marginBottom: burned.length > 0 ? '10px' : 0 }}>
                        {resultText(b)}
                      </div>
                      {burned.map(entry => (
                        <div
                          key={entry.token}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '7px 10px',
                            borderRadius: '6px',
                            background: 'var(--inset)',
                            fontSize: '12px',
                            marginTop: '6px',
                          }}
                        >
                          <span>🔥 {formatTokenAmount(entry.burned)} ${tickOf(b, entry.token)} burned</span>
                          <span style={{ color: 'var(--dim)' }}>
                            {entry.tranches} {entry.tranches === 1 ? 'tranche' : 'tranches'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {pastWeeks.length > 0 && (
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx)', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Trophy size={18} style={{ color: 'var(--brand)' }} />
                <span>Weekly Champions</span>
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                {pastWeeks.map(pw => (
                  <div
                    key={pw.week}
                    className="panel"
                    style={{
                      padding: '20px',
                      borderRadius: '10px',
                      border: '1px solid var(--line)',
                      background: 'var(--panel)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx)' }}>Week #{pw.week}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand)' }}>
                        <SubCentUsd amount={pw.totalUsd} prefix="$" />
                      </span>
                    </div>

                    {pw.winners.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--dim)' }}>No winners posted yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {pw.winners.map((w, idx) => (
                          <div
                            key={w}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '8px 10px',
                              borderRadius: '6px',
                              background: 'var(--inset)',
                              fontSize: '12px',
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>
                              {PLACES[idx]} ({prizeShares[idx]}%)
                            </span>
                            <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>
                              {w.slice(0, 6)}…{w.slice(-4)}
                            </code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

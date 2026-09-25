'use client'

import { Award, ShieldCheck, Gift } from 'lucide-react'
import { type CompetitionState, type WeekView } from '@/hooks/useCompetition'
import { formatCryptoAmount } from '@/lib/utils'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

const PLACES = [
  { medal: '🥇', label: '1ST PLACE', text: 'Highest qualified volume of the week, across every pair.' },
  { medal: '🥈', label: '2ND PLACE', text: 'Second highest qualified volume.' },
  { medal: '🥉', label: '3RD PLACE', text: 'Third highest qualified volume.' },
  { medal: '4️⃣', label: '4TH PLACE', text: 'Fourth highest qualified volume.' },
  { medal: '5️⃣', label: '5TH PLACE', text: 'Fifth highest qualified volume.' },
]

function weekStatus(week: WeekView): { text: string; color: string } {
  if (week.closed) return { text: 'Closed', color: 'var(--dim)' }
  if (week.finalizedAt > 0) return { text: 'Claims open', color: '#22c55e' }
  if (week.canFinalize) return { text: 'Settling', color: '#f59e0b' }
  if (week.proposedAt > 0) return { text: 'Challenge window', color: 'var(--mt)' }
  return { text: 'Awaiting results', color: 'var(--dim)' }
}

interface TraderLeagueSectionProps {
  competition: CompetitionState
  cd: { d: string; h: string; m: string; s: string }
}

export function TraderLeagueSection({ competition, cd }: TraderLeagueSectionProps) {
  const {
    currentWeek,
    totalPrizePoolUsd,
    firstLeagueWeek,
    currentWeekNum,
    userClaimable,
    claimPrize,
    finalizeWeek,
    isPendingTx,
    pastWeeks,
    prizeShares,
  } = competition

  const isBootstrap = firstLeagueWeek === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '8px' }}>
      {/* 1. Hero Prize Overview */}
      <div
        className="panel"
        style={{
          padding: '28px 32px',
          background: 'linear-gradient(135deg, var(--panel) 40%, rgba(var(--brand-rgb), 0.08) 100%)',
          borderColor: 'rgba(var(--brand-rgb), 0.35)',
          borderRadius: '12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '24px' }}>
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: 'var(--brand)',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '.12em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              <span>🏆</span> QUALYRA TRADER LEAGUE · {isBootstrap ? 'BOOTSTRAP PHASE' : `WEEK #${currentWeekNum}`}
            </div>
            <div style={{ fontSize: '42px', fontWeight: 900, color: 'var(--brand)', letterSpacing: '-.02em', lineHeight: 1, display: 'inline-flex', alignItems: 'baseline', gap: '8px' }}>
              <SubCentUsd amount={totalPrizePoolUsd} prefix="$" />
              <span style={{ fontSize: '18px', color: 'var(--dim)', fontWeight: 600 }}>USD</span>
            </div>

            {/* Native Asset Breakdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
              {currentWeek?.pools && currentWeek.pools.length > 0 ? (
                currentWeek.pools.map(p => (
                  <span
                    key={p.asset}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: 'var(--inset)',
                      border: '1px solid var(--line)',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      color: 'var(--tx)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span className="livedot" style={{ width: '6px', height: '6px', background: '#22c55e' }} />
                    <b>{formatCryptoAmount(p.amount, p.symbol, 7)}</b>
                    <span style={{ opacity: 0.75 }}>
                      (<SubCentUsd amount={p.usd} prefix="≈ $" />)
                    </span>
                  </span>
                ))
              ) : (
                <span className="dim" style={{ fontSize: '12.5px' }}>
                  Nothing collected yet. The pool fills from trading fees as the week goes.
                </span>
              )}
            </div>

            <p style={{ color: 'var(--mt)', fontSize: '12.5px', marginTop: '12px', lineHeight: 1.5, maxWidth: '480px' }}>
              {isBootstrap
                ? 'Fees collected before the league starts wait in the bootstrap pool, which is spread evenly over the first four league weeks.'
                : `Filled by 30% of every token's competition share outside its battle. The top ${prizeShares.length} wallets by qualified volume split it ${prizeShares.join('/')}.`}
            </p>
          </div>

          {/* Countdown Card */}
          <div
            style={{
              textAlign: 'center',
              background: 'var(--panel)',
              padding: '18px 24px',
              borderRadius: '10px',
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
              <span className="livedot"></span> CURRENT WEEK CLOSES IN
            </div>
            <div className="cdchips" style={{ gap: '8px', margin: 0 }}>
              <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.d}</b><span>DAYS</span></div>
              <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.h}</b><span>HRS</span></div>
              <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.m}</b><span>MIN</span></div>
              <div style={{ padding: '6px 0', width: '56px' }}><b>{cd.s}</b><span>SEC</span></div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '8px' }}>
              Settles every Monday at 00:00 UTC
            </div>
          </div>
        </div>
      </div>

      {/* 2. User Claimable Prizes Banner (If Connected User has claimable rewards) */}
      {userClaimable.length > 0 && (
        <div
          style={{
            padding: '20px 24px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.12), rgba(34, 197, 94, 0.04))',
            border: '1px solid rgba(34, 197, 94, 0.4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22c55e',
                  fontSize: '22px',
                }}
              >
                <Gift size={24} />
              </div>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx)' }}>
                  🎉 You have unclaimed Trader League rewards!
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--mt)', marginTop: '2px' }}>
                  {userClaimable.map(u => (
                    <span key={u.week} style={{ marginRight: '12px' }}>
                      Week #{u.week} ({u.rankLabel} Place, {u.sharePercent}%): <b><SubCentUsd amount={u.totalUsd} prefix="$" suffix=" USD" /></b>
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {userClaimable.map(u => (
                <button
                  key={u.week}
                  type="button"
                  disabled={isPendingTx}
                  onClick={() => claimPrize(u.week, u.rank, u.assets.map(a => a.address))}
                  className="btn btn-brand"
                  style={{
                    padding: '10px 20px',
                    fontWeight: 800,
                    fontSize: '13px',
                    background: '#22c55e',
                    borderColor: '#22c55e',
                    color: '#fff',
                  }}
                >
                  {isPendingTx ? 'Claiming…' : (
                    <>Claim Week #{u.week} (<SubCentUsd amount={u.totalUsd} prefix="$" />)</>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. Prize Tier Distribution Cards */}
      <div>
        <h3 style={{ fontSize: '17px', fontWeight: 800, marginBottom: '14px' }}>Weekly Prize Distribution</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '14px' }}>
          {PLACES.slice(0, prizeShares.length).map((place, i) => {
            const first = i === 0
            return (
              <div
                key={place.label}
                className="panel"
                style={{
                  padding: '18px',
                  borderRadius: '10px',
                  border: first ? '1px solid rgba(var(--brand-rgb), 0.4)' : '1px solid var(--line)',
                  background: first ? 'linear-gradient(180deg, var(--panel) 0%, rgba(var(--brand-rgb), 0.05) 100%)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '22px' }}>{place.medal}</span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: first ? 'var(--brand-dim)' : 'var(--inset)',
                      color: first ? 'var(--brand)' : 'var(--dim)',
                    }}
                  >
                    {place.label}
                  </span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx)' }}>
                  {prizeShares[i]}% <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--dim)' }}>of each asset</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: first ? 'var(--brand)' : 'var(--tx)', marginTop: '4px' }}>
                  ~<SubCentUsd amount={(totalPrizePoolUsd * prizeShares[i]) / 100} prefix="$" suffix=" USD" />
                </div>
                <p style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '8px', lineHeight: 1.4 }}>{place.text}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* 4. Past Weeks Settlement Table */}
      <div className="panel" style={{ padding: '24px', borderRadius: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>League Settlement & History</h3>
            <p className="dim" style={{ fontSize: '12px', margin: '3px 0 0' }}>
              On-chain records of past weeks, challenge windows, and winner addresses.
            </p>
          </div>
        </div>

        {pastWeeks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--dim)', fontSize: '13px' }}>
            <Award size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <div>No finalized weeks recorded yet. Week #{currentWeekNum} is currently active.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--dim)', textAlign: 'left' }}>
                  <th style={{ padding: '10px' }}>WEEK</th>
                  <th style={{ padding: '10px' }}>TOTAL POOL</th>
                  <th style={{ padding: '10px' }}>WINNERS (1ST TO 5TH)</th>
                  <th style={{ padding: '10px' }}>STATUS</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {pastWeeks.map(pw => (
                  <tr key={pw.week} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '12px 10px', fontWeight: 700 }}>
                      Week #{pw.week}
                    </td>
                    <td style={{ padding: '12px 10px', fontFamily: 'monospace' }}>
                      <SubCentUsd amount={pw.totalUsd} prefix="$" />
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      {pw.winners.length > 0 ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {pw.winners.map((w, idx) => (
                            <span
                              key={w}
                              style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'var(--inset)',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                              }}
                            >
                              {idx + 1}: {w.slice(0, 6)}…{w.slice(-4)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="dim">Not posted yet</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{ color: weekStatus(pw).color, fontWeight: 600 }}>{weekStatus(pw).text}</span>
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                      {pw.settleOverdue && (
                        <button
                          type="button"
                          disabled={isPendingTx}
                          onClick={() => finalizeWeek(pw.week)}
                          title="The automatic settlement is running late. Anyone can settle the week to open claims."
                          className="btn btn-brand btn-sm"
                          style={{ fontSize: '11.5px', padding: '4px 12px' }}
                        >
                          {isPendingTx ? 'Settling…' : 'Settle now'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Rules & Integrity */}
      <div
        style={{
          padding: '16px 20px',
          borderRadius: '8px',
          background: 'var(--inset)',
          border: '1px solid var(--line)',
          fontSize: '12px',
          color: 'var(--dim)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          lineHeight: 1.5,
        }}
      >
        <ShieldCheck size={18} style={{ color: 'var(--brand)', flexShrink: 0, marginTop: '2px' }} />
        <div>
          <b>How the Trader League works</b>: each week runs from Monday 00:00 UTC to the next Monday. One leaderboard
          covers every token on Qualyra, and prizes are paid in each pair asset the pool holds. Once the week ends,
          the winners are posted on-chain and sit in a 48-hour challenge window, then the week settles on its own and
          claims open. Winners have 60 days to claim; unclaimed prizes and empty places roll into a later week.
        </div>
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { Flame, Gift, Trophy, Award, CheckCircle2, Lock } from 'lucide-react'
import { tickerColor, formatCryptoAmount } from '@/lib/utils'
import { type Project } from '@/lib/data'
import type { Address } from 'viem'
import { useCompetition, RANK_LABELS } from '@/hooks/useCompetition'
import { useBattleEligibility, type BattleEligibility } from '@/hooks/battles/useBattleEligibility'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

function statusChip(status: BattleEligibility, graduated: boolean): { text: string; ok: boolean } {
  switch (status.state) {
    case 'eligible':
      return { text: 'ELIGIBLE TO BATTLE', ok: true }
    case 'qualifying':
      return { text: 'QUALIFYING', ok: false }
    case 'disqualified':
      return { text: 'DISQUALIFIED', ok: false }
    case 'battled':
      return { text: 'BATTLE USED', ok: false }
    case 'waiting':
      return { text: graduated ? 'BELOW $100K' : 'ON THE CURVE', ok: false }
    default:
      return { text: 'STATUS UNAVAILABLE', ok: false }
  }
}

const shortDate = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

interface BattleRewardsTabProps {
  creatorProjects: Project[]
  currentWeekNumber: number
}

export function BattleRewardsTab({ creatorProjects, currentWeekNumber }: BattleRewardsTabProps) {
  const { userClaimable, claimPrize, isPendingTx, prizeShares } = useCompetition()
  const unclaimedUsd = userClaimable.reduce((sum, u) => sum + u.totalUsd, 0)
  const tokenAddresses = creatorProjects
    .map(p => p.address)
    .filter((a): a is string => !!a && /^0x[0-9a-fA-F]{40}$/.test(a)) as Address[]
  const eligibility = useBattleEligibility(tokenAddresses)

  return (
    <div style={{ padding: '24px' }}>
      {/* Top Summary Metrics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '22px',
        }}
      >
        <div style={{ background: 'var(--inset)', padding: '16px 18px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div className="k" style={{ fontSize: '10.5px' }}>TOKEN LEAGUE (24H DUELS)</div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--brand)', marginTop: '4px' }}>
            {creatorProjects.filter(p => p.status === 'graduated' || p.progress >= 100).length} Graduated
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Flame size={12} style={{ color: '#F87171' }} />
            <span>Battle pot → buyback &amp; burn of the winner</span>
          </div>
        </div>

        <div style={{ background: 'var(--inset)', padding: '16px 18px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div className="k" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Gift size={13} style={{ color: '#0ECB81' }} />
            <span>UNCLAIMED PRIZES</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#0ECB81', marginTop: '4px' }}>
            <SubCentUsd amount={unclaimedUsd} prefix="$" suffix=" USD" />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
            {userClaimable.length === 0
              ? 'Nothing to claim'
              : `${userClaimable.length} ${userClaimable.length === 1 ? 'week' : 'weeks'} ready to claim`}
          </div>
        </div>

        <div style={{ background: 'var(--inset)', padding: '16px 18px', borderRadius: '8px', border: '1px solid var(--line)' }}>
          <div className="k" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Trophy size={13} style={{ color: 'var(--brand)' }} />
            <span>TRADER LEAGUE PRIZE VAULT</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--tx)', marginTop: '4px' }}>
            Top {prizeShares.length} Winners
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
            {prizeShares.join(' / ')}% via CompetitionVault
          </div>
        </div>
      </div>

      {/* Section 1: Token League Status for User's Tokens */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={16} style={{ color: '#F87171' }} />
              <span>Token League — 24-Hour Duels</span>
              <span style={{ fontSize: '10px', background: 'rgba(174,212,60,0.15)', color: 'var(--brand)', padding: '1px 6px', borderRadius: '3px' }}>
                ONCHAIN
              </span>
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
              Qualified tokens duel once, for 24 hours. The pot starts with what each token set aside before the booking
              and takes its whole 15% competition share until the battle ends. QualyraBuybackBurner then spends it buying the
              winner back in its pool and burning it.
            </p>
          </div>
          <Link href="/battles" className="btn btn-brand btn-sm" style={{ padding: '6px 14px', fontSize: '12px' }}>
            Arena Battles →
          </Link>
        </div>

        {eligibility.supported === false && (
          <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '0 0 12px' }}>
            The vault on this network predates on-chain eligibility, so battle status shows up once the current
            contracts are deployed.
          </p>
        )}

        {creatorProjects.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
            {creatorProjects.map(proj => {
              const isGrad = proj.status === 'graduated'
              const status: BattleEligibility =
                (proj.address && eligibility.byToken.get(proj.address.toLowerCase())) || { state: 'unknown' }
              const chip = statusChip(status, isGrad)
              const qualified = status.state === 'eligible' || status.state === 'battled'
              const battled = status.state === 'battled'

              return (
                <div
                  key={proj.id}
                  style={{
                    background: 'var(--inset)',
                    padding: '16px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div className="coin" style={{ background: tickerColor(proj.tick), width: '34px', height: '34px', borderRadius: '7px' }}>
                        {proj.tick.slice(0, 2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--tx)' }}>
                          ${proj.tick} · {proj.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                          Quote Asset: <b style={{ color: 'var(--tx)' }}>{proj.quoteAsset || 'ETH'}</b>
                        </div>
                      </div>
                    </div>
                    <span className={`chip ${chip.ok ? 'up' : 'dn'}`} style={{ fontSize: '10.5px', fontWeight: 700 }}>
                      {chip.text}
                    </span>
                  </div>

                  {/* Requirements Checklist */}
                  <div style={{ background: 'var(--panel)', padding: '10px 12px', borderRadius: '6px', fontSize: '11.5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: isGrad ? 'var(--green)' : 'var(--dim)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {isGrad ? <CheckCircle2 size={13} style={{ color: 'var(--green)' }} /> : <Lock size={13} style={{ color: 'var(--dim)' }} />}
                        <span>1. Graduated to its pool</span>
                      </span>
                      <b>{isGrad ? '✓ Graduated' : `${Math.round(proj.progress || 0)}% of curve`}</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: qualified ? 'var(--green)' : 'var(--dim)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {qualified ? <CheckCircle2 size={13} style={{ color: 'var(--green)' }} /> : <Lock size={13} style={{ color: 'var(--dim)' }} />}
                        <span>2. $100k market cap held for 24h</span>
                      </span>
                      <b>
                        {status.state === 'qualifying'
                          ? `Qualifies ${shortDate(status.eligibleAt)}`
                          : status.state === 'disqualified'
                            ? `Dropped ${shortDate(status.at)}`
                            : qualified
                              ? '✓ Qualified'
                              : status.state === 'waiting'
                                ? 'Not reached'
                                : '—'}
                      </b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: battled ? 'var(--dim)' : 'var(--mt)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Lock size={13} style={{ color: 'var(--dim)' }} />
                        <span>3. One battle per token</span>
                      </span>
                      <b>{battled ? 'Used' : status.state === 'unknown' ? '—' : 'Available'}</b>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--dim)' }}>
                      Matched automatically with a token on the same pair asset
                    </span>
                    <Link href="/battles" className="link" style={{ fontSize: '11.5px', fontWeight: 600 }}>
                      Arena →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: 'var(--inset)', padding: '32px 20px', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚔️</div>
            <h5 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx)', marginBottom: '4px' }}>
              No Tokens Launched Yet
            </h5>
            <p style={{ fontSize: '12.5px', color: 'var(--dim)', margin: '0 auto 16px', maxWidth: '440px', lineHeight: 1.5 }}>
              Launch a token and take it to graduation. Once its market cap holds $100k for 24 hours it qualifies for
              its one battle, and the winner&apos;s pot buys back and burns it.
            </p>
            <Link href="/launch" className="btn btn-subtle btn-sm" style={{ padding: '6px 16px' }}>
              🚀 Launch a Token
            </Link>
          </div>
        )}
      </div>

      {/* Section 2: Trader League (Weekly Leaderboard & Payouts) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trophy size={16} style={{ color: 'var(--brand)' }} />
              <span>Trader League — Weekly Tournament</span>
              <span style={{ fontSize: '10px', background: 'rgba(14,203,129,0.15)', color: '#0ECB81', padding: '1px 6px', borderRadius: '3px' }}>
                ACTIVE ROUND
              </span>
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--dim)', marginTop: '2px' }}>
              Wallets are ranked each week by qualified volume across every Qualyra token. The pool takes 30% of every
              token&apos;s competition share outside its battle, and the top {prizeShares.length} split it {prizeShares.join('/')}.
            </p>
          </div>
        </div>

        <div
          style={{
            background: 'var(--inset)',
            border: '1px solid var(--line)',
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            <div style={{ background: 'var(--panel)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
              <div className="k" style={{ fontSize: '10.5px' }}>ROUND CYCLE</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--tx)', marginTop: '4px' }}>
                Week #{currentWeekNumber}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                Resets every Monday 00:00 UTC
              </div>
            </div>

            <div style={{ background: 'var(--panel)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--line)' }}>
              <div className="k" style={{ fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Award size={13} style={{ color: 'var(--brand)' }} />
                <span>PRIZE SHARES</span>
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--brand)', marginTop: '4px' }}>
                {prizeShares.map(p => `${p}%`).join(' · ')}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                1st to {RANK_LABELS[prizeShares.length - 1]} place, per asset
              </div>
            </div>
          </div>

          {userClaimable.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {userClaimable.map(u => (
                <div
                  key={`${u.week}-${u.rank}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    padding: '12px 14px',
                    borderRadius: '6px',
                    background: 'var(--panel)',
                    border: '1px solid rgba(34, 197, 94, 0.35)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>
                      Week #{u.week} · {u.rankLabel} place ({u.sharePercent}%)
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--mt)', marginTop: '2px', fontFamily: 'monospace' }}>
                      {u.assets.map(a => formatCryptoAmount(a.amount, a.symbol, 7)).join(' + ')}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isPendingTx}
                    onClick={() => claimPrize(u.week, u.rank, u.assets.map(a => a.address))}
                    className="btn btn-brand btn-sm"
                    style={{ padding: '6px 14px', fontWeight: 700 }}
                  >
                    {isPendingTx ? 'Claiming…' : 'Claim'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '12px', color: 'var(--dim)', maxWidth: '520px', lineHeight: 1.5 }}>
              Results are posted after the week closes and can be challenged for 48 hours. Prizes then stay claimable for
              60 days, paid in every pair asset the pool holds.
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Link href="/trade" className="btn btn-subtle btn-sm" style={{ padding: '6px 14px' }}>
                Trade Tokens →
              </Link>
              <Link href="/battles" className="btn btn-brand btn-sm" style={{ padding: '6px 14px' }}>
                View Full Standings →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

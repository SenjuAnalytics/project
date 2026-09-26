'use client'

import Link from 'next/link'
import { ArrowUpRight, Share2, Coins, Zap } from 'lucide-react'
import { tickerColor, px7 } from '@/lib/utils'
import { openSharePnl } from '@/components/trade/SharePnlModal'
import { ROBINHOOD_PAIR_ASSETS, NATIVE_PAIR_ASSET } from '@/lib/contracts'
import { type Project } from '@/lib/data'
import { type CreatorFeeInfo } from '@/hooks/portfolio/usePortfolioData'

const NO_FEES: CreatorFeeInfo = { raw: 0n, formatted: 0, unswept: 0, atSettlement: 0 }

interface CreatedTokensTabProps {
  creatorProjects: Project[]
  creatorFeeMap: Record<string, CreatorFeeInfo>
  liveEthPrice: number
  claimingToken: string | null
  address?: string
  onClaimFees: (tokenAddress: string, quoteAssetAddress: string, quoteSymbol: string) => void
}

export function CreatedTokensTab({
  creatorProjects,
  creatorFeeMap,
  liveEthPrice,
  claimingToken,
  address,
  onClaimFees,
}: CreatedTokensTabProps) {
  if (creatorProjects.length === 0) {
    return (
      <div style={{ background: 'var(--inset)', padding: '48px 20px', borderRadius: '8px', border: '1px solid var(--line)', textAlign: 'center' }}>
        <div style={{ fontSize: '42px', marginBottom: '12px' }}>🚀</div>
        <h4 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tx)', marginBottom: '8px' }}>
          No Launched Tokens Yet
        </h4>
        <p style={{ fontSize: '13px', color: 'var(--dim)', maxWidth: '440px', margin: '0 auto 20px', lineHeight: 1.6 }}>
          You haven&apos;t launched any tokens under your address yet. Deploy a token with no creator allocation, a bonding curve anyone can sell back into, and liquidity that locks permanently at graduation.
        </p>
        <Link href="/launch" className="btn btn-brand btn-sm" style={{ padding: '9px 22px', fontWeight: 700 }}>
          🚀 Launch New Token Now →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Summary Metric Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px',
      }}>
        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Launched Tokens
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tx)', marginTop: '4px' }}>
            {creatorProjects.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '2px', fontWeight: 500 }}>
            ● Active on Robinhood Chain
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Combined Market Cap
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--brand)', marginTop: '4px' }}>
            ${creatorProjects.reduce((sum, p) => sum + (p.mcap || 0), 0).toLocaleString('en-US')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
            Across all creator curves
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Liquidity
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#00C853', marginTop: '4px' }}>
            100% Locked
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
            No function exists to remove it
          </div>
        </div>

        <div style={{ background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Creator allocation
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: '#7AA8FF', marginTop: '4px' }}>
            None
          </div>
          <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
            You earn from trading fees instead
          </div>
        </div>
      </div>

      {/* Creator Token Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {creatorProjects.map(proj => {
          const isGraduated = proj.status === 'graduated' || proj.progress >= 100
          const progressPct = Math.min(100, Math.max(0, proj.progress || 0))
          const raisedQuote = proj.raised || 0
          const goalQuote = proj.goal || 30
          const remQuote = Math.max(0, goalQuote - raisedQuote)

          return (
            <div
              key={proj.id}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: '10px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
              }}
            >
              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      background: tickerColor(proj.tick),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      fontWeight: 800,
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {proj.tick.slice(0, 3)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx)' }}>
                        {proj.name}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--dim)' }}>
                        ${proj.tick}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '10.5px',
                          fontWeight: 700,
                          background: 'rgba(var(--brand-rgb), 0.15)',
                          color: 'var(--brand)',
                          border: '1px solid rgba(var(--brand-rgb), 0.3)',
                        }}
                      >
                        👑 CREATOR ALLOCATION
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--dim)', marginTop: '2px' }}>
                      Creator wallet:{' '}
                      <code style={{ color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>
                        {proj.creatorAddress
                          ? `${proj.creatorAddress.slice(0, 6)}…${proj.creatorAddress.slice(-4)}`
                          : address
                          ? `${address.slice(0, 6)}…${address.slice(-4)}`
                          : 'Connected Wallet'}
                      </code>{' '}
                      · Deployed on Robinhood Chain
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx)' }}>
                      ${px7(proj.price)}
                    </div>
                    <div style={{ fontSize: '11.5px', color: proj.chg >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {proj.chg >= 0 ? '+' : ''}{proj.chg}% 24h
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: isGraduated ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                      color: isGraduated ? '#10B981' : '#F59E0B',
                      border: `1px solid ${isGraduated ? '#10B98140' : '#F59E0B40'}`,
                    }}
                  >
                    {isGraduated ? (
                      '🎓 GRADUATED TO AMM'
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Zap size={11} />
                        <span>BONDING ({progressPct}%)</span>
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Real-time Bonding Curve Graduation Meter */}
              <div
                style={{
                  background: 'var(--subtle)',
                  borderRadius: '8px',
                  padding: '14px 16px',
                  border: '1px solid var(--line)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>🎯</span> Bonding Curve Graduation Progress
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand)' }}>
                    {progressPct}% Completed
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    width: '100%',
                    height: '10px',
                    borderRadius: '5px',
                    background: 'var(--input)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: `${progressPct}%`,
                      height: '100%',
                      borderRadius: '5px',
                      background: isGraduated
                        ? 'linear-gradient(90deg, #10B981 0%, #059669 100%)'
                        : 'linear-gradient(90deg, var(--brand) 0%, #0ECB81 100%)',
                      transition: 'width 0.4s ease',
                      boxShadow: '0 0 10px rgba(var(--brand-rgb), 0.4)',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '11.5px', color: 'var(--dim)', flexWrap: 'wrap', gap: '6px' }}>
                  <span>
                    Raised: <b style={{ color: 'var(--tx)' }}>{raisedQuote.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {goalQuote} {proj.quoteAsset || 'ETH'}</b> (≈ ${Math.round(proj.quoteAsset === 'USDG' ? raisedQuote : raisedQuote * liveEthPrice).toLocaleString('en-US')} USD)
                  </span>
                  <span>
                    {isGraduated
                      ? '✓ Liquidity seeded into the pool and locked permanently'
                      : `~${remQuote.toFixed(2)} ${proj.quoteAsset || 'ETH'} remaining until automatic AMM graduation`}
                  </span>
                </div>
              </div>

              {/* What this token actually pays the creator */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>💰</span> Your earnings on this token
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>
                  <div style={{ background: 'var(--subtle)', border: '1px solid rgba(0, 200, 83, 0.35)', borderRadius: '6px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Trading fee share</b>
                      <span style={{ fontSize: '10px', color: '#00c853', fontWeight: 700 }}>70%</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Of the 1% fee on every trade, before and after graduation</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--brand)', fontWeight: 600, marginTop: '4px' }}>Paid in {proj.quoteAsset || 'ETH'}</div>
                  </div>

                  <div style={{ background: 'var(--subtle)', border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Creator tax</b>
                      <span style={{ fontSize: '10px', color: 'var(--dim)', fontWeight: 700 }}>{proj.creatorTax}%</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Chosen at launch, same on buys and sells, paid to you in full</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--dim)', fontWeight: 600, marginTop: '4px' }}>Locked for the life of the token</div>
                  </div>

                  <div style={{ background: 'var(--subtle)', border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Where it sits</b>
                      <span style={{ fontSize: '10px', color: 'var(--dim)', fontWeight: 700 }}>FEE VAULT</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Balances accrue per pair asset and are pulled, never pushed</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--dim)', fontWeight: 600, marginTop: '4px' }}>Claim any time, no schedule</div>
                  </div>

                  <div style={{ background: 'var(--subtle)', border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Token allocation</b>
                      <span style={{ fontSize: '10px', color: 'var(--dim)', fontWeight: 700 }}>NONE</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--dim)' }}>The entire supply goes to the curve, so there is nothing to vest</div>
                    <div style={{ fontSize: '10.5px', color: 'var(--dim)', fontWeight: 600, marginTop: '4px' }}>Buy on the curve like anyone else</div>
                  </div>
                </div>
              </div>

              {/* Quick Action Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <Link
                    href={`/trade?pair=${proj.id}`}
                    className="btn btn-brand btn-sm"
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>Open Terminal</span>
                    <ArrowUpRight size={12} strokeWidth={2.4} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      openSharePnl({
                        tick: proj.tick,
                        name: proj.name,
                        entry: proj.entry || proj.price,
                        price: proj.price,
                        balance: 100000000,
                        isProfit: proj.chg >= 0,
                        pnlPct: Math.abs(proj.chg),
                        pnlUsd: Math.round((proj.vol24 ?? 0) * 0.1),
                        quoteAsset: proj.quoteAsset || 'ETH',
                      })
                    }}
                    className="btn btn-subtle btn-sm"
                    style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                  >
                    <Share2 size={13} strokeWidth={2.4} />
                    <span>Share Card</span>
                  </button>
                </div>

                {/* Real Onchain Creator Fee Claiming */}
                {(() => {
                  const feeInfo = creatorFeeMap[proj.id.toLowerCase()] || NO_FEES
                  const hasFees = feeInfo.formatted > 0
                  const isClaiming = claimingToken === proj.id
                  const amountText = (value: number) =>
                    value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })

                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10.5px', color: 'var(--dim)', fontWeight: 600, textTransform: 'uppercase' }}>
                          Claimable Fees
                        </div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: hasFees ? '#10B981' : 'var(--tx)' }}>
                          {amountText(feeInfo.formatted)} {proj.quoteAsset || 'ETH'}
                        </div>
                        {feeInfo.unswept > 0 && (
                          <div
                            title="Still held by the pool hook. Claiming sweeps it to the fee vault first."
                            style={{ fontSize: '10.5px', color: 'var(--dim)', marginTop: '2px' }}
                          >
                            incl. {amountText(feeInfo.unswept)} not swept yet
                          </div>
                        )}
                        {feeInfo.atSettlement > 0 && (
                          <div
                            title="Earned during the token's battle. The fee vault credits it when the battle settles."
                            style={{ fontSize: '10.5px', color: 'var(--dim)', marginTop: '2px' }}
                          >
                            +{amountText(feeInfo.atSettlement)} once the battle settles
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={!hasFees || isClaiming}
                        onClick={() => {
                          const quoteAddr = proj.quoteAssetAddress || (proj.quoteAsset === 'USDG' ? ROBINHOOD_PAIR_ASSETS.usdg : NATIVE_PAIR_ASSET)
                          onClaimFees(proj.id, quoteAddr, proj.quoteAsset || 'ETH')
                        }}
                        className="btn btn-brand btn-sm"
                        style={{
                          padding: '7px 16px',
                          fontSize: '12px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          opacity: !hasFees ? 0.6 : 1,
                          cursor: !hasFees ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Coins size={14} />
                        <span>
                          {isClaiming
                            ? 'Claiming...'
                            : hasFees
                            ? `Claim ${proj.quoteAsset || 'ETH'} Fees`
                            : 'No Fees to Claim'}
                        </span>
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

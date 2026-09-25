'use client'

import { useMemo } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { Address } from 'viem'
import { fmtUsd } from '@/lib/utils'
import type { Project } from '@/lib/data'
import { useBattleEligibility, type BattleEligibility } from '@/hooks/battles/useBattleEligibility'

const when = (seconds: number) =>
  new Date(seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Label and color for the vault's view of a token's battle. Null hides the row. */
function battleLabel(status: BattleEligibility | undefined): { text: string; color: string; title?: string } | null {
  switch (status?.state) {
    case 'eligible':
      return { text: 'Eligible', color: 'var(--green)' }
    case 'qualifying':
      return {
        text: `Qualifies ${when(status.eligibleAt)}`,
        color: 'var(--tx)',
        title: 'Market cap has been at $100k or more since the first close above it. Dropping below before the 24 hours are up disqualifies the token.',
      }
    case 'waiting':
      return { text: 'Below $100k market cap', color: 'var(--dim)' }
    case 'disqualified':
      return { text: 'Disqualified', color: 'var(--red)', title: `Dropped below $100k on ${when(status.at)}` }
    case 'battled':
      return { text: 'Battle used', color: 'var(--dim)', title: "Each token gets one battle. This token's is booked, live or over." }
    default:
      return null
  }
}

interface BondingCurveCardProps {
  curProject: Project
  chainLastPrice: number
  explorerBase: string
  isRwaStock: boolean
  quote: string
  mobileView: 'chart' | 'trades' | 'markets'
}

/** Right-column card: bonding curve progress, pool liquidity and battle status, or stock token facts. */
export function BondingCurveCard({
  curProject,
  chainLastPrice,
  explorerBase,
  isRwaStock,
  quote,
  mobileView,
}: BondingCurveCardProps) {
  // Battle status comes from the competition vault, so only tokens launched on Qualyra have one.
  const battleTokens = useMemo(
    () =>
      !isRwaStock && !curProject.platform && curProject.address && /^0x[0-9a-fA-F]{40}$/.test(curProject.address)
        ? [curProject.address as Address]
        : [],
    [isRwaStock, curProject.platform, curProject.address],
  )
  const { byToken } = useBattleEligibility(battleTokens)
  const battle = battleLabel(battleTokens[0] ? byToken.get(battleTokens[0].toLowerCase()) : undefined)

  return (
    <div className={`trade-info-card ${mobileView === 'chart' ? 'mobile-card-hidden' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="ph" style={{ padding: '10px 14px' }}>
        <span>
          {isRwaStock
            ? 'Stock Token'
            : curProject.status === 'graduated' || curProject.poolAddress
            ? 'DEX Pool Liquidity'
            : 'Bonding Curve'}
        </span>
        <span
          className="k"
          style={{
            color: (isRwaStock || curProject.status === 'graduated' || curProject.poolAddress) ? 'var(--green)' : 'var(--brand)',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
          }}
        >
          {isRwaStock ? (
            'PAIR ASSET'
          ) : curProject.status === 'graduated' || curProject.poolAddress ? (
            <>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'var(--green)',
                  boxShadow: '0 0 6px var(--green)',
                  display: 'inline-block',
                }}
              />
              GRADUATED
            </>
          ) : (
            `${curProject.progress}%`
          )}
        </span>
      </div>
      <div style={{ padding: '8px 14px 4px' }}>
        <div style={{ width: '100%', height: '7px', background: 'var(--input)', borderRadius: '4px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${isRwaStock || curProject.status === 'graduated' || curProject.poolAddress ? 100 : curProject.progress}%`,
              height: '100%',
              background: isRwaStock || curProject.status === 'graduated' || curProject.poolAddress ? 'var(--green)' : 'var(--brand)',
              transition: 'width 0.3s',
            }}
          />
        </div>
      </div>
      <div className="curve-stats" style={{ padding: '4px 14px 12px' }}>
        {isRwaStock ? (
          <>
            <div className="cstat">
              <span className="l">Issuer</span>
              <span className="v">Robinhood</span>
            </div>
            <div className="cstat">
              <span className="l">Value per token</span>
              <span className="v">Share price × multiplier</span>
            </div>
            <div className="cstat">
              <span className="l">Mint &amp; redeem</span>
              <span className="v">Mon 02:00 – Sat 02:00 CET</span>
            </div>
            <div className="cstat">
              <span className="l">On Qualyra</span>
              <span className="v">Pair asset for launches</span>
            </div>
          </>
        ) : curProject.status === 'graduated' || curProject.poolAddress ? (
          <>
            <div className="cstat">
              <span className="l">Pool Reserve</span>
              <span className="v" style={{ color: 'var(--tx)', fontWeight: 600 }}>
                {curProject.liquidity ? fmtUsd(curProject.liquidity) : '—'}
              </span>
            </div>
            <div className="cstat">
              <span className="l">Pooled {curProject.tick}</span>
              <span className="v" style={{ color: 'var(--tx)', fontWeight: 600 }}>
                {curProject.pooledBase
                  ? `${curProject.pooledBase.toLocaleString('en-US')} ${curProject.tick}`
                  : curProject.id === 'pons'
                  ? '4,118,060 PONS'
                  : curProject.id === 'ai'
                  ? '8,345,598 AI'
                  : '—'}
              </span>
            </div>
            <div className="cstat">
              <span className="l">Pooled {curProject.pooledQuoteSymbol || 'WETH'}</span>
              <span className="v" style={{ color: 'var(--tx)', fontWeight: 600 }}>
                {(() => {
                  // The ETH side of a graduated native-ETH pool cannot be read from the v4
                  // singleton by balanceOf — it commingles every pool's ETH — so it is derived
                  // from the pooled token amount and the live market price. `curProject.price`
                  // is 0 once a token graduates (the curve stops pricing), so the market price
                  // above (the last traded price, i.e. what the pool prices at) is used instead.
                  const mktPx = chainLastPrice || curProject.price
                  const pooledQuoteVal =
                    curProject.pooledQuote ??
                    (curProject.pooledBase && mktPx ? curProject.pooledBase * mktPx : undefined)
                  return pooledQuoteVal
                    ? `${pooledQuoteVal.toLocaleString('en-US', { minimumFractionDigits: pooledQuoteVal < 1 ? 4 : 2, maximumFractionDigits: pooledQuoteVal < 1 ? 6 : 2 })} ${curProject.pooledQuoteSymbol || 'WETH'}`
                    : curProject.id === 'pons'
                    ? '1,121.21 WETH'
                    : curProject.id === 'ai'
                    ? '890.39 WETH'
                    : '—'
                })()}
              </span>
            </div>
            <div className="cstat">
              <span className="l">AMM Platform</span>
              <span className="v" style={{ color: 'var(--tx)' }}>
                {curProject.platform || 'Qualyra'}
              </span>
            </div>
            <div className="cstat">
              <span className="l">LP Status</span>
              {curProject.platform ? (
                <span
                  className="v"
                  style={{ color: 'var(--dim)', fontWeight: 600 }}
                  title={`This token was launched on ${curProject.platform}, so its liquidity terms are set there, not by Qualyra.`}
                >
                  Set by {curProject.platform}
                </span>
              ) : (
                <span
                  className="v"
                  style={{ color: 'var(--green)', fontWeight: 600 }}
                  title="The pool position is owned by QualyraLiquidityLocker, which has no function to remove liquidity."
                >
                  Locked permanently 🔒
                </span>
              )}
            </div>
            <div className="cstat">
              <span className="l">Pool Contract</span>
              <span className="v">
                {curProject.poolAddress ? (
                  <a
                    href={`${explorerBase}/address/${curProject.poolAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--brand)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}
                    title="View the pool on the explorer"
                  >
                    <span>{curProject.poolAddress.slice(0, 6)}…{curProject.poolAddress.slice(-4)}</span>
                    <ArrowUpRight size={11} />
                  </a>
                ) : (
                  <span style={{ color: 'var(--dim)' }}>—</span>
                )}
              </span>
            </div>
            {battle && (
              <div className="cstat">
                <span className="l">Battle</span>
                <span className="v" style={{ color: battle.color, fontWeight: 600 }} title={battle.title}>
                  {battle.text}
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="cstat">
              <span className="l">Raised</span>
              <span className="v">{`${curProject.raised} / ${curProject.goal} ${quote}`}</span>
            </div>
            <div className="cstat">
              <span className="l">Graduation Target</span>
              <span className="v">{`${curProject.goal} ${quote}`}</span>
            </div>
            <div className="cstat">
              <span className="l">LP Fate</span>
              <span className="v" style={{ color: 'var(--green)' }}>Locked permanently 🔒</span>
            </div>
            <div className="cstat">
              <span className="l">Creator tax</span>
              <span className="v">{`${curProject.creatorTax}%`}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

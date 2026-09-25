'use client'

import { useChainId, useReadContracts } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { px7 } from '@/lib/utils'
import type { Project } from '@/lib/data'
import { qualyraBondingCurveAbi, resolveTargetChainId } from '@/lib/contracts'
import { CurvePhase, type TokenMarket } from '@/lib/useQualyraTrade'

interface ShieldPanelProps {
  curProject: Project
  currentHolding: number
  explorerBase: string
  quote: string
  market: TokenMarket
}

/**
 * What `currentHolding` would redeem if refunds opened now. Same arithmetic as `claimRefund`: a pro rata
 * share of the curve's quote reserve over the supply outside the curve, which the contract freezes once
 * refunds open. Null when there is no curve to ask.
 */
function useRefundEstimate(market: TokenMarket, holding: number): number | null {
  const chainId = resolveTargetChainId(useChainId())
  const { curve, token, quoteDecimals, graduated } = market
  const { data } = useReadContracts({
    contracts: [
      { address: curve, chainId, abi: qualyraBondingCurveAbi, functionName: 'quoteReserve' },
      { address: curve, chainId, abi: qualyraBondingCurveAbi, functionName: 'tokenReserve' },
      { address: curve, chainId, abi: qualyraBondingCurveAbi, functionName: 'refundableTokens' },
      { address: token, chainId, abi: erc20Abi, functionName: 'totalSupply' },
    ],
    query: { enabled: !!curve && !!token && !graduated },
  })

  if (!data || data.some(r => r.status !== 'success')) return null
  const [quoteReserve, tokenReserve, frozen, totalSupply] = data.map(r => r.result as bigint)
  const refundable = market.phase === CurvePhase.Refunding ? frozen : totalSupply - tokenReserve
  if (refundable <= 0n) return null
  return (holding * Number(formatUnits(quoteReserve, quoteDecimals))) / Number(formatUnits(refundable, 18))
}

/** Bottom-tab panel: the safety checks that apply to this token. */
export function ShieldPanel({
  curProject,
  currentHolding,
  explorerBase,
  quote,
  market,
}: ShieldPanelProps) {
  const refundEstimate = useRefundEstimate(market, currentHolding)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Shield Overview Card */}
      <div style={{
        background: 'var(--subtle)',
        border: '1px solid var(--line)',
        borderRadius: '8px',
        padding: '14px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '8px',
            background: 'rgba(0, 200, 83, 0.12)',
            border: '1px solid rgba(0, 200, 83, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
          }}>
            🛡️
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--tx)' }}>Liquidity Lock</span>
              <span style={{
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(0, 200, 83, 0.15)',
                color: '#00c853',
                border: '1px solid rgba(0, 200, 83, 0.3)'
              }}>
                ● LOCKED PERMANENTLY
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--dim)', marginTop: '2px' }}>
              <b>100%</b> of the graduation liquidity sits in QualyraLiquidityLocker · no function exists to take it out
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--dim)' }}>
          <div>
            <div>Contract</div>
            <code style={{ color: 'var(--tx)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>0x7a81...d94c</code>
          </div>
          <div>
            <div>Removable</div>
            <span style={{ color: 'var(--tx)', fontWeight: 600 }}>Never</span>
          </div>
        </div>
      </div>

      {/* What the contracts actually guarantee */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '10px' }}>
          Guaranteed by the contracts
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          <div style={{
            background: 'var(--subtle)',
            border: '1px solid rgba(0, 200, 83, 0.3)',
            borderRadius: '6px',
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Liquidity</b>
              <span style={{ fontSize: '10px', color: '#00c853', fontWeight: 700 }}>LOCKED</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)' }}>The pool position is owned by the locker contract</div>
            <div style={{ fontSize: '10.5px', color: 'var(--brand)', fontWeight: 600, marginTop: '4px' }}>No removal function exists</div>
          </div>

          <div style={{
            background: 'var(--subtle)',
            border: '1px solid rgba(0, 200, 83, 0.3)',
            borderRadius: '6px',
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Contract code</b>
              <span style={{ fontSize: '10px', color: '#00c853', fontWeight: 700 }}>IMMUTABLE</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)' }}>No proxy and no upgrade path after deployment</div>
            <div style={{ fontSize: '10.5px', color: 'var(--brand)', fontWeight: 600, marginTop: '4px' }}>A new version means a new deployment</div>
          </div>

          <div style={{
            background: 'var(--subtle)',
            border: '1px solid rgba(0, 200, 83, 0.3)',
            borderRadius: '6px',
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Token supply</b>
              <span style={{ fontSize: '10px', color: '#00c853', fontWeight: 700 }}>FIXED</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)' }}>1 billion, no owner, no mint, no blocklist</div>
            <div style={{ fontSize: '10.5px', color: 'var(--brand)', fontWeight: 600, marginTop: '4px' }}>Only the buyback burns it</div>
          </div>

          <div style={{
            background: 'var(--subtle)',
            border: '1px solid rgba(0, 200, 83, 0.3)',
            borderRadius: '6px',
            padding: '10px 12px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <b style={{ fontSize: '12px', color: 'var(--tx)' }}>Trading fee</b>
              <span style={{ fontSize: '10px', color: '#00c853', fontWeight: 700 }}>1%</span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)' }}>Locked for this token at launch</div>
            <div style={{ fontSize: '10.5px', color: 'var(--brand)', fontWeight: 600, marginTop: '4px' }}>70% creator · 15% platform · 15% competition</div>
          </div>
        </div>
      </div>

      {/* Refund path for a curve that completes but cannot graduate */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '12px',
        paddingTop: '6px'
      }}>
        <div style={{
          background: 'var(--subtle)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          padding: '12px 14px',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔒</span> What cannot happen
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--dim)', lineHeight: 1.6 }}>
            • <b>Zero creator allocation:</b> the creator holds no allocation. The whole supply went to the curve.<br/>
            • <b>No liquidity pull:</b> the pool position is owned by a contract with no withdraw function.<br/>
            • <b>No rule change:</b> fee, tax and supply are locked at launch, and no contract can be upgraded.
          </div>
        </div>

        <div style={{
          background: 'var(--subtle)',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>💰</span> Refund if graduation fails
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--dim)', marginBottom: '10px' }}>
              If a completed curve cannot graduate for 7 days, the admin can open refunds and holders redeem their proportional share of the raise.
              {market.graduated ? (
                <div style={{ marginTop: '6px', color: 'var(--dim)' }}>
                  This token graduated, so the refund path is closed.
                </div>
              ) : currentHolding > 0 ? (
                <div style={{ marginTop: '6px', color: 'var(--tx)', fontWeight: 600 }}>
                  Your share if refunds opened now:{' '}
                  <span style={{ color: 'var(--brand)' }}>{refundEstimate === null ? '—' : `${px7(refundEstimate)} ${quote}`}</span>{' '}
                  ({currentHolding.toLocaleString('en-US')} ${curProject.tick})
                </div>
              ) : (
                <div style={{ marginTop: '6px', color: 'var(--dim)' }}>
                  Eligible holding: <b style={{ color: 'var(--tx)' }}>0 ${curProject.tick}</b> (refunds are proportional to what you hold)
                </div>
              )}
            </div>
          </div>

          <a
            href={curProject.explorerUrl || `${explorerBase}/token/${curProject.address || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(0, 200, 83, 0.15)',
              color: '#00c853',
              border: '1px solid rgba(0, 200, 83, 0.35)',
              borderRadius: '6px',
              padding: '8px 14px',
              fontSize: '11.5px',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s',
            }}
          >
            <span>🛡️</span>
            <span>View Verified Contract on Explorer ↗</span>
          </a>
        </div>
      </div>
    </div>
  )
}

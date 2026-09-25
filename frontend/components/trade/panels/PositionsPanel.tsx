'use client'

import { Share2 } from 'lucide-react'
import { px7 } from '@/lib/utils'
import { openSharePnl } from '@/components/trade/SharePnlModal'
import type { Project } from '@/lib/data'
import type { UserPosition } from '@/lib/storage'

interface PositionsPanelProps {
  curProject: Project
  currentPosition: UserPosition | null
}

/** Bottom-tab panel: the wallet's open position in the pair being viewed. */
export function PositionsPanel({
  curProject,
  currentPosition,
}: PositionsPanelProps) {
  return (
    <div style={{ fontSize: '13px', color: 'var(--mt)', lineHeight: 1.8 }}>
      {currentPosition && currentPosition.balance > 0 ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: '12px' }}>
          <span>Position: <b style={{ color: 'var(--tx)' }}>{currentPosition.balance.toLocaleString('en-US')} ${curProject.tick}</b></span>
          <span>Avg Entry: <b style={{ color: 'var(--tx)' }}>${px7(currentPosition.entry)}</b></span>
          {(() => {
            const pnlPct = ((curProject.price - currentPosition.entry) / currentPosition.entry) * 100
            const pnlUsd = (curProject.price - currentPosition.entry) * currentPosition.balance
            const isProfit = pnlPct >= 0
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className={isProfit ? 'up' : 'dn'} style={{ fontWeight: 600 }}>
                  PnL: {isProfit ? '+' : ''}{pnlPct.toFixed(2)}% ({isProfit ? '+' : ''}${pnlUsd.toFixed(2)})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    openSharePnl({
                      tick: curProject.tick,
                      name: curProject.name,
                      entry: currentPosition.entry,
                      price: curProject.price,
                      balance: currentPosition.balance,
                      isProfit: isProfit,
                      pnlPct: Math.abs(pnlPct),
                      pnlUsd: Math.abs(pnlUsd),
                      quoteAsset: curProject.quoteAsset,
                    })
                  }}
                  style={{
                    background: 'var(--brand-dim)',
                    border: '1px solid rgba(var(--brand-rgb), 0.35)',
                    color: 'var(--brand)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                  title="Generate Shareable PnL Card"
                >
                  <Share2 size={12} strokeWidth={2.4} style={{ flexShrink: 0 }} />
                  <span>Share Card</span>
                </button>
              </div>
            )
          })()}
        </div>
      ) : (
        <div style={{ padding: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--dim)' }}>No active position in ${curProject.tick}. Use the order form on the right to enter.</span>
          <span className="mono" style={{ fontSize: '11px', color: 'var(--ft)' }}>0.00 ${curProject.tick}</span>
        </div>
      )}
    </div>
  )
}

'use client'

import { px7 } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { cancelOpenOrder, cancelAllOpenOrders, type LimitOrder } from '@/lib/storage'
import type { Project } from '@/lib/data'

interface OpenOrdersPanelProps {
  curProject: Project
  isRwa: boolean
  pairOpenOrders: LimitOrder[]
}

/** Bottom-tab panel: limit, take-profit and stop-loss orders resting on this pair. */
export function OpenOrdersPanel({
  curProject,
  isRwa,
  pairOpenOrders,
}: OpenOrdersPanelProps) {
  const { toast } = useToast()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>
            Active Open Orders ({pairOpenOrders.length})
          </span>
          <span style={{ fontSize: '11px', color: 'var(--dim)' }}>
            Market: ${px7(curProject.price)}
          </span>
        </div>
        {pairOpenOrders.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const count = cancelAllOpenOrders(curProject.id)
              toast.info('Orders Cancelled', `Cancelled ${count} open order(s) for $${curProject.tick}.`)
            }}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#ef4444',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel All ({pairOpenOrders.length})
          </button>
        )}
      </div>

      {pairOpenOrders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--dim)' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📝</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx)', marginBottom: '4px' }}>
            No Open Orders for ${curProject.tick}
          </div>
          <p style={{ fontSize: '12px', maxWidth: '380px', margin: '0 auto' }}>
            Switch to Limit mode in the execution panel to place automated limit orders, or attach Take-Profit & Stop-Loss triggers.
          </p>
        </div>
      ) : (
        <div className="tbl-scroll" style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: '6px', background: 'var(--panel)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Time</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Type</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Side</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Target Price</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Amount</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Total ({curProject.quoteAsset || (isRwa ? 'USDG' : 'ETH')})</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Distance</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Status</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--panel2)', padding: '9px 12px', fontWeight: 600, fontSize: '11.5px', color: 'var(--dim)', textAlign: 'right', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {pairOpenOrders.map(order => {
                const distPct = ((order.limitPrice - curProject.price) / curProject.price) * 100
                const distStr = (distPct >= 0 ? '+' : '') + distPct.toFixed(2) + '%'
                const isBuy = order.side === 'BUY'
                let typeBadgeColor = '#F59E0B'
                let typeBg = 'rgba(245, 158, 11, 0.14)'
                if (order.type === 'TP') {
                  typeBadgeColor = '#10B981'
                  typeBg = 'rgba(16, 185, 129, 0.14)'
                } else if (order.type === 'SL') {
                  typeBadgeColor = '#EF4444'
                  typeBg = 'rgba(239, 68, 68, 0.14)'
                }

                return (
                  <tr key={order.id}>
                    <td style={{ fontSize: '11px', color: 'var(--dim)' }}>{order.time}</td>
                    <td>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        background: typeBg,
                        color: typeBadgeColor,
                        border: `1px solid ${typeBadgeColor}40`
                      }}>
                        {order.type}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        background: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: isBuy ? '#10B981' : '#EF4444',
                      }}>
                        {order.side}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--tx)' }}>
                      ${px7(order.limitPrice)}
                    </td>
                    <td>
                      {order.amount.toLocaleString('en-US')} ${order.tick}
                    </td>
                    <td>
                      {order.totalQuote.toLocaleString('en-US')} {order.quoteAsset}
                    </td>
                    <td style={{
                      fontWeight: 600,
                      color: distPct >= 0 ? 'var(--green)' : 'var(--red)',
                      fontSize: '11.5px'
                    }}>
                      {distStr} away
                    </td>
                    <td>
                      <span style={{ fontSize: '10.5px', color: '#F59E0B', fontWeight: 600 }}>
                        ● PENDING
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => {
                          cancelOpenOrder(order.id)
                          toast.info('Order Cancelled', `Cancelled ${order.type} ${order.side} order.`)
                        }}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          background: 'var(--input)',
                          border: '1px solid var(--line)',
                          color: 'var(--red)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

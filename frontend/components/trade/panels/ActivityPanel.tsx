'use client'

import type { TokenTransferItem } from '@/lib/trade/types'
import type { Project } from '@/lib/data'

interface ActivityPanelProps {
  curProject: Project
  explorerBase: string
  loadingTransfers: boolean
  onchainTransfers: TokenTransferItem[]
}

/** Bottom-tab panel: on-chain transfers for this token. */
export function ActivityPanel({
  curProject,
  explorerBase,
  loadingTransfers,
  onchainTransfers,
}: ActivityPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--tx)', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00c853', display: 'inline-block', boxShadow: '0 0 6px #00c853' }} />
          <span>Robinhood Chain L2 Event Stream (Live on-chain logs)</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
          {loadingTransfers ? 'Syncing blocks...' : `${onchainTransfers.length} Recent Transfers Indexed`}
        </div>
      </div>

      {loadingTransfers && onchainTransfers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--dim)', fontSize: '12px' }}>
          Reading Transfer events from Robinhood Chain RPC...
        </div>
      ) : onchainTransfers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)', fontSize: '12px' }}>
          No transfer events detected in recent blocks for ${curProject.tick}.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ color: 'var(--dim)', borderBottom: '1px solid var(--line)', height: '26px' }}>
                <th style={{ fontWeight: 600, padding: '4px 8px' }}>Age</th>
                <th style={{ fontWeight: 600, padding: '4px 8px' }}>Tx Hash</th>
                <th style={{ fontWeight: 600, padding: '4px 8px' }}>From</th>
                <th style={{ fontWeight: 600, padding: '4px 8px' }}>To</th>
                <th style={{ fontWeight: 600, padding: '4px 8px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {onchainTransfers.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--subtle)', height: '28px' }}>
                  <td style={{ padding: '4px 8px', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{t.timeAgo}</td>
                  <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                    <a
                      href={t.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--brand)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
                    >
                      {t.txHash.slice(0, 6)}…{t.txHash.slice(-4)} ↗
                    </a>
                  </td>
                  <td style={{ padding: '4px 8px', color: 'var(--tx)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    <a
                      href={`${explorerBase}/address/${t.from}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {t.from.slice(0, 6)}…{t.from.slice(-4)}
                    </a>
                  </td>
                  <td style={{ padding: '4px 8px', color: 'var(--tx)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    <a
                      href={`${explorerBase}/address/${t.to}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'none' }}
                    >
                      {t.to.slice(0, 6)}…{t.to.slice(-4)}
                    </a>
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                    {parseFloat(t.valueFormatted) > 0 ? parseFloat(t.valueFormatted).toLocaleString('en-US', { maximumFractionDigits: 2 }) : t.valueFormatted} ${curProject.tick}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

'use client'

import type { TokenHolderItem } from '@/lib/trade/types'
import type { Project } from '@/lib/data'

interface HoldersPanelProps {
  curProject: Project
  explorerBase: string
  loadingHolders: boolean
  onchainHolders: TokenHolderItem[]
  totalHoldersCount: number
}

/** Bottom-tab panel: the token's largest holders. */
export function HoldersPanel({
  curProject,
  explorerBase,
  loadingHolders,
  onchainHolders,
  totalHoldersCount,
}: HoldersPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--tx)', fontWeight: 600 }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00c853', display: 'inline-block', boxShadow: '0 0 6px #00c853' }} />
          <span>{totalHoldersCount > 0 ? totalHoldersCount.toLocaleString('en-US') : 'Authentic'} Token Holders on Robinhood Chain</span>
        </div>
        {(curProject.address || curProject.id) && (
          <a
            href={`${explorerBase}/token/${curProject.address || curProject.id}?tab=holders`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '11px', color: 'var(--brand)', textDecoration: 'none', fontWeight: 600 }}
          >
            View on Explorer ↗
          </a>
        )}
      </div>

      {loadingHolders && onchainHolders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--dim)', fontSize: '12px' }}>
          Loading holder distribution directly from Robinhood Chain...
        </div>
      ) : onchainHolders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dim)', fontSize: '12px' }}>
          No token holders found yet on Robinhood Chain.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ color: 'var(--dim)', borderBottom: '1px solid var(--line)', height: '26px' }}>
                <th style={{ fontWeight: 600, padding: '4px 8px', width: '36px' }}>#</th>
                <th style={{ fontWeight: 600, padding: '4px 8px' }}>Holder Address</th>
                <th style={{ fontWeight: 600, padding: '4px 8px', textAlign: 'right' }}>Balance</th>
                <th style={{ fontWeight: 600, padding: '4px 8px', textAlign: 'right', width: '140px' }}>Share of Supply</th>
              </tr>
            </thead>
            <tbody>
              {onchainHolders.map(h => {
                const isDead = h.address.toLowerCase().includes('000000000000000000000000000000000000dead')
                return (
                  <tr key={h.rank} style={{ borderBottom: '1px solid var(--subtle)', height: '30px' }}>
                    <td style={{ padding: '4px 8px', color: 'var(--dim)', fontWeight: 600 }}>{h.rank}</td>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <a
                          href={h.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--tx)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
                        >
                          {h.address.slice(0, 6)}…{h.address.slice(-4)}
                        </a>
                        {isDead ? (
                          <span style={{ fontSize: '9.5px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}>
                            🔥 BURNED
                          </span>
                        ) : h.label ? (
                          <span style={{ fontSize: '9.5px', fontWeight: 600, padding: '1px 5px', borderRadius: '4px', background: 'rgba(0, 200, 83, 0.12)', color: '#00c853' }}>
                            {h.label}
                          </span>
                        ) : h.isContract ? (
                          <span style={{ fontSize: '9.5px', color: 'var(--dim)', padding: '1px 4px', borderRadius: '3px', background: 'var(--subtle)' }}>
                            Contract
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--tx)', whiteSpace: 'nowrap' }}>
                      {h.balanceFormatted} ${curProject.tick}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        <div style={{ width: '50px', height: '5px', borderRadius: '3px', background: 'var(--line)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, h.percentage * 3)}%`, height: '100%', background: isDead ? '#EF4444' : 'var(--brand)', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontWeight: 700, color: isDead ? '#EF4444' : 'var(--tx)', minWidth: '38px' }}>
                          {h.percentage}%
                        </span>
                      </div>
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

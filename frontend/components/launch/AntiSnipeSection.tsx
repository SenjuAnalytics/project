'use client'

import { Plus, Trash2 } from 'lucide-react'

interface AntiSnipeSectionProps {
  snipeExempt: Array<{ id: string; address: string }>
  invalidExempt: number
  addExemptWallet: () => void
  removeExemptWallet: (id: string) => void
  updateExemptWallet: (id: string, address: string) => void
}

const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v.trim())

export function AntiSnipeSection({
  snipeExempt,
  invalidExempt,
  addExemptWallet,
  removeExemptWallet,
  updateExemptWallet,
}: AntiSnipeSectionProps) {
  return (
    <div className="fsec">
      <h4><span className="n">04</span> Snipe tax exemptions</h4>
      <p>Wallets that skip the snipe tax in the first 15 seconds. You and your fee recipient already are.</p>

      <div className="fi" style={{ marginBottom: '6px' }}>
        <label style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
          <span>Exempt wallets</span>
          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 600,
              color: invalidExempt > 0 ? 'var(--red)' : 'var(--dim)',
            }}
          >
            {invalidExempt > 0 ? `${invalidExempt} invalid` : `${snipeExempt.length}/32`}
          </span>
        </label>

        {snipeExempt.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--ft)', padding: '2px 0 4px' }}>
            None yet. Optional, and locked at launch.
          </div>
        ) : (
          snipeExempt.map((wallet, i) => {
            const touched = wallet.address.trim().length > 0
            const bad = touched && !isAddress(wallet.address)
            return (
              <div
                key={wallet.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr 34px', gap: '8px', alignItems: 'center', marginTop: i === 0 ? '0' : '8px' }}
              >
                <input
                  className="inp"
                  placeholder="0x…"
                  value={wallet.address}
                  onChange={e => updateExemptWallet(wallet.id, e.target.value)}
                  spellCheck={false}
                  style={{
                    fontSize: '12px',
                    height: '36px',
                    fontFamily: 'var(--font-mono)',
                    borderColor: bad ? 'var(--red)' : undefined,
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeExemptWallet(wallet.id)}
                  style={{
                    width: '34px',
                    height: '36px',
                    borderRadius: '6px',
                    border: '1px solid var(--line2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'var(--red)',
                    background: 'var(--input)',
                    transition: 'all .15s',
                  }}
                  title="Remove wallet"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })
        )}

        {snipeExempt.length < 32 && (
          <button
            type="button"
            onClick={addExemptWallet}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: '1px dashed var(--line3)',
              color: 'var(--brand)',
              fontSize: '12px',
              fontWeight: 600,
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              marginTop: '10px',
              transition: 'all .15s',
            }}
          >
            <Plus size={13} />
            <span>Add wallet</span>
          </button>
        )}
      </div>

      <div style={{ fontSize: '12px', color: 'var(--ft)' }}>
        An exemption only skips the snipe tax. The 1% trading fee and your creator tax still apply.
      </div>
    </div>
  )
}

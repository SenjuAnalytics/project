'use client'

import { Sliders, X, ShieldCheck, ShieldAlert } from 'lucide-react'

interface SlippageModalProps {
  slippage: number
  customSlippage: string
  setCustomSlippage: (value: string) => void
  setShowSlippageModal: (open: boolean) => void
  handleUpdateSlippage: (value: number) => void
}

/** Slippage tolerance and front-running protection settings. */
export function SlippageModal({
  slippage,
  customSlippage,
  setCustomSlippage,
  setShowSlippageModal,
  handleUpdateSlippage,
}: SlippageModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => setShowSlippageModal(false)}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: '460px',
          borderRadius: '14px',
          border: '1px solid rgba(var(--brand-rgb), 0.35)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 24px rgba(var(--brand-rgb), 0.12)',
          background: 'var(--panel)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--inset)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: 'var(--brand-dim)',
                color: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(var(--brand-rgb), 0.3)',
              }}
            >
              <Sliders size={18} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx)' }}>
                Slippage & Fair Sequencer Settings
              </div>
              <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                Robinhood Chain MEV & Frontrunning Shield
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowSlippageModal(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--dim)',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Slippage Selector */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--tx)' }}>
                Slippage Tolerance
              </span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: slippage > 3 ? 'var(--red)' : slippage < 0.2 ? '#F59E0B' : 'var(--brand)' }}>
                {slippage}%
              </span>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--dim)', marginBottom: '10px', lineHeight: 1.5 }}>
              Your swap will revert if the execution price slips unfavorably by more than this percentage before sequencer inclusion.
            </div>

            {/* Preset Chips */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[0.1, 0.5, 1.0].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    handleUpdateSlippage(val)
                    setCustomSlippage('')
                  }}
                  style={{
                    padding: '8px 0',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: slippage === val && !customSlippage ? 800 : 600,
                    cursor: 'pointer',
                    background: slippage === val && !customSlippage ? 'var(--brand-dim)' : 'var(--input)',
                    border: `1px solid ${slippage === val && !customSlippage ? 'var(--brand)' : 'var(--line)'}`,
                    color: slippage === val && !customSlippage ? 'var(--brand)' : 'var(--tx)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {val}% {val === 0.5 && '★'}
                </button>
              ))}

              {/* Custom Input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: customSlippage ? 'var(--brand-dim)' : 'var(--input)',
                  border: `1px solid ${customSlippage ? 'var(--brand)' : 'var(--line)'}`,
                  borderRadius: '8px',
                  padding: '0 8px',
                }}
              >
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="50"
                  placeholder="Custom"
                  value={customSlippage}
                  onChange={e => {
                    const v = e.target.value
                    setCustomSlippage(v)
                    const parsed = parseFloat(v)
                    if (!isNaN(parsed) && parsed > 0 && parsed <= 50) {
                      handleUpdateSlippage(parsed)
                    }
                  }}
                  className="no-spin"
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: 'var(--tx)',
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontSize: '11px', color: 'var(--dim)', fontWeight: 600 }}>%</span>
              </div>
            </div>

            {/* Dynamic Warning Alert */}
            {slippage < 0.2 && (
              <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#F59E0B' }}>
                <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                <span>Low slippage may cause transactions to fail during high bonding curve volatility.</span>
              </div>
            )}
            {slippage > 3.0 && (
              <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--red)' }}>
                <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                <span>High slippage allows significantly worse fill prices if market moves against you.</span>
              </div>
            )}
            {slippage >= 0.2 && slippage <= 3.0 && (
              <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--green)' }}>
                <ShieldCheck size={14} style={{ flexShrink: 0 }} />
                <span>Optimal slippage configured for Robinhood Chain sub-second finality.</span>
              </div>
            )}
          </div>

          {/* Robinhood Chain Frontrunning & Fair Sequencer Card */}
          <div
            style={{
              padding: '14px',
              borderRadius: '10px',
              background: 'var(--inset)',
              border: '1px solid var(--line)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <ShieldCheck size={16} style={{ color: 'var(--green)' }} />
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--tx)' }}>
                Robinhood Chain Fair Sequencer Protection
              </span>
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--dim)', margin: 0, lineHeight: 1.6 }}>
              Qualyra routes orders directly into Robinhood Chain&apos;s private sequencer mempool. Sandwich attacks, frontrunning, and predatory MEV bots are eliminated at the sequencer consensus layer via deterministic FIFO ordering. Your slippage tolerance strictly acts as a safeguard against natural pool price shifts.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10.5px', color: 'var(--green)', fontWeight: 600, marginTop: '2px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
              <span>Private Mempool Verified · MEV Protection Active</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--line)',
            background: 'var(--inset)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
            Applied to all Market & Limit orders
          </div>
          <button
            type="button"
            onClick={() => setShowSlippageModal(false)}
            className="btn btn-brand"
            style={{ fontSize: '12px', padding: '6px 16px', fontWeight: 700 }}
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  )
}

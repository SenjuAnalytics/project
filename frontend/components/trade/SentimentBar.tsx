'use client'

import { SoonBadge } from '@/components/ui/SoonBadge'

const NOT_LIVE = 'Sentiment votes need a shared backend. Not live yet.'

const buttonStyle = {
  padding: '7px 10px',
  borderRadius: '6px',
  fontSize: '11.5px',
  fontWeight: 600,
  cursor: 'not-allowed',
  background: 'var(--input)',
  border: '1px solid var(--line)',
  color: 'var(--dim)',
} as const

// Votes kept in one browser's storage aren't a community signal, so nothing is collected until there is
// somewhere shared to put them.
export function SentimentBar() {
  return (
    <div
      className="trade-sentiment-card"
      title={NOT_LIVE}
      style={{
        padding: '12px 14px',
        background: 'var(--panel)',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--tx)' }}>Community Sentiment</span>
        <SoonBadge title={NOT_LIVE} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', opacity: 0.6 }}>
        <button type="button" disabled style={buttonStyle}>🐂 Bullish</button>
        <button type="button" disabled style={buttonStyle}>🐻 Bearish</button>
      </div>
    </div>
  )
}

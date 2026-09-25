'use client'

import { usePairAssets } from '@/lib/usePairAssets'

interface PairAssetFilterProps {
  /** 'all' or a pair asset symbol. */
  value: string
  onChange: (value: string) => void
}

// Tokens only battle on the same pair asset, so the asset is the natural way to slice the list.
export function PairAssetFilter({ value, onChange }: PairAssetFilterProps) {
  const { assets } = usePairAssets()
  const options = [{ id: 'all', label: 'All Duels' }, ...assets.map(a => ({ id: a.symbol, label: a.symbol }))]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          style={{
            padding: '5px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            background: value === option.id ? 'var(--brand)' : 'var(--panel)',
            color: value === option.id ? '#000' : 'var(--dim)',
            border: value === option.id ? '1px solid var(--brand)' : '1px solid var(--line)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {option.id === 'all' && <span style={{ marginRight: '5px' }}>⚔️</span>}
          {option.label}
        </button>
      ))}
    </div>
  )
}

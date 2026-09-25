'use client'

// One social link field.
//
// For a platform the site is fixed and shown as part of the field, so the only thing a creator can type
// is the handle. That removes the class of mistake the free-text version allowed — a different site's
// URL, a link to one post, a trailing path — rather than catching it afterwards.
//
// Checking happens on every keystroke, but a field that is merely half-typed says nothing: `checkSocial`
// returns an empty reason for that, and only a value that cannot become a handle gets an error.

import type { ReactNode } from 'react'

import { checkSocial, SOCIAL_RULES, type SocialKind } from '@/lib/socialLinks'

type Props = {
  kind: SocialKind
  icon?: ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  /** Rendered instead of the label, for the custom-link rows that carry their own selector. */
  compact?: boolean
}

export function SocialField({ kind, icon, label, value, onChange, compact }: Props) {
  const rule = SOCIAL_RULES[kind]
  const result = checkSocial(kind, value)
  const error = result.ok ? '' : result.reason
  const filled = value.trim().length > 0
  const good = filled && result.ok

  const borderColor = error ? 'var(--red)' : good ? 'var(--brand)' : 'var(--line2)'

  return (
    <div className="fi">
      {!compact && (
        <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mt)' }}>
          {icon} {label}
        </label>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderRadius: '6px',
          border: `1px solid ${borderColor}`,
          background: 'var(--input)',
          overflow: 'hidden',
          height: compact ? '36px' : undefined,
          transition: 'border-color .15s',
        }}
      >
        {rule.prefix && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 2px 0 10px',
              fontSize: compact ? '12px' : '13px',
              color: 'var(--dim)',
              background: 'var(--inset)',
              borderRight: '1px solid var(--line2)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              paddingRight: '10px',
            }}
          >
            {rule.prefix}
          </span>
        )}
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={rule.placeholder}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'var(--tx)',
            padding: compact ? '0 10px' : '9px 10px',
            fontSize: compact ? '12px' : '13px',
            fontFamily: 'inherit',
          }}
        />
      </div>
      {error && (
        <span style={{ fontSize: '11px', color: 'var(--red)', marginTop: '4px', display: 'block' }}>{error}</span>
      )}
      {good && !error && (
        <span style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '4px', display: 'block' }}>
          {result.url}
        </span>
      )}
    </div>
  )
}

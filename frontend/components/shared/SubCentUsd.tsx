'use client'

import React from 'react'
import { splitSubCentUsd } from '@/lib/formatters'

export interface SubCentUsdProps {
  amount: number
  prefix?: string
  suffix?: string
  className?: string
  subClassName?: string
  style?: React.CSSProperties
  subStyle?: React.CSSProperties
  maxSubCents?: number
}

/**
 * Institutional Sub-Cent USD Display Component.
 * - Displays major dollars & cents in primary bold weight (e.g. $1.66)
 * - Displays micro-cent fractional digits in muted/subdued smaller font (e.g. 99)
 * - Completely avoids confusing users into thinking numbers are thousands of dollars,
 *   while ensuring every micro-trade and fee addition remains immediately visible.
 */
export function SubCentUsd({
  amount,
  prefix = '',
  suffix = '',
  className,
  subClassName,
  style,
  subStyle,
  maxSubCents = 2,
}: SubCentUsdProps) {
  const parts = splitSubCentUsd(amount, maxSubCents)

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        letterSpacing: '-0.02em',
        ...style,
      }}
    >
      <span>
        {prefix}
        {parts.integer}.{parts.cents}
      </span>
      {parts.hasSubCents && (
        <span
          className={subClassName}
          style={{
            fontSize: '0.68em',
            opacity: 0.68,
            fontWeight: 600,
            marginLeft: '1px',
            letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            ...subStyle,
          }}
          title={`Exact sub-cent precision: .${parts.cents}${parts.subCents}`}
        >
          {parts.subCents}
        </span>
      )}
      {suffix && <span style={{ marginLeft: '4px', fontSize: '0.85em', opacity: 0.85 }}>{suffix}</span>}
    </span>
  )
}

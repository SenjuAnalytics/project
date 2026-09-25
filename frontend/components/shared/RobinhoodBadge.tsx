'use client'

import React from 'react'
import Image from 'next/image'

export interface RobinhoodBadgeProps {
  size?: number
  className?: string
  style?: React.CSSProperties
  title?: string
}

export function RobinhoodBadge({
  size = 14,
  className = '',
  style = {},
  title = 'Robinhood Chain',
}: RobinhoodBadgeProps) {
  return (
    <span
      className={`robinhood-chain-badge ${className}`}
      title={title}
      style={{
        position: 'absolute',
        bottom: '-2px',
        right: '-2px',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        background: '#D2FF00',
        border: '1.5px solid var(--panel, #0D1117)',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.65)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3,
        pointerEvents: 'none',
        overflow: 'hidden',
        flexShrink: 0,
        ...style,
      }}
    >
      <Image
        src="/robinhood-chain.svg"
        alt="Robinhood Chain"
        width={size}
        height={size}
        unoptimized
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'cover',
        }}
      />
    </span>
  )
}

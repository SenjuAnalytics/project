'use client'

import Image from 'next/image'
import { logoTransform } from '@/lib/ipfs'
import { tickerColor } from '@/lib/utils'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { type Project } from '@/lib/data'

export function BattleTokenLogo({ p, size = 38 }: { p: Project; size?: number }) {
  const badgeSize = Math.max(10, Math.round(size * 0.38))
  return (
    <div style={{ position: 'relative', display: 'inline-flex', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
      {p.rwa || p.tick.startsWith('r') ? (
        <RwaLogo ticker={p.tick} size={size} showChainBadge={false} />
      ) : p.logoUrl ? (
        <div
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: p.logoShape === 'circle' ? '50%' : '8px',
            background: p.logoBg === 'white' ? '#FFFFFF' : p.logoBg === 'dark' ? '#0F1218' : 'var(--inset)',
            border: '1px solid var(--line)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
          }}
        >
          <Image
            src={p.logoUrl}
            alt={p.tick}
            width={size}
            height={size}
            unoptimized
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: p.logoFit || 'cover',
              transform: logoTransform(p.logoScale),
            }}
          />
        </div>
      ) : (
        <div
          className="coin"
          style={{
            background: tickerColor(p.tick),
            width: `${size}px`,
            height: `${size}px`,
            fontSize: `${Math.round(size * 0.35)}px`,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {p.tick.slice(0, 2)}
        </div>
      )}
      <RobinhoodBadge size={badgeSize} />
    </div>
  )
}

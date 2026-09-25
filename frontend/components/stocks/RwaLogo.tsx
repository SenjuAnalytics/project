'use client'

import React from 'react'
import Image from 'next/image'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'

interface RwaLogoProps {
  ticker: string
  size?: number | 'sm' | 'md' | 'lg'
  className?: string
  style?: React.CSSProperties
  showChainBadge?: boolean
}

const TOKEN_FILE_MAP: Record<string, string> = {
  NVDA: '/tokens/nvda.svg',
  AAPL: '/tokens/aapl.svg',
  SPY: '/tokens/spy.svg',
  GOOGL: '/tokens/googl.svg',
  GOOG: '/tokens/googl.svg',
  GME: '/tokens/gme.svg',
  SPCX: '/tokens/spcx.svg',
  SGOV: '/tokens/sgov.svg',
  TSLA: '/tokens/tsla.svg',
  MSFT: '/tokens/msft.svg',
  USDG: '/tokens/usdg.png',
  PONS: '/tokens/pons.png',
  AI: '/tokens/ai.jpg',
}

export function RwaLogo({
  ticker,
  size = 'md',
  className = '',
  style = {},
  showChainBadge = true,
}: RwaLogoProps) {
  const normTicker = ticker.toUpperCase().replace(/^R/, '')
  const [imgError, setImgError] = React.useState(false)
  
  let px = 32
  if (typeof size === 'number') {
    px = size
  } else if (size === 'sm') {
    px = 24
  } else if (size === 'md') {
    px = 34
  } else if (size === 'lg') {
    px = 44
  }

  const iconPx = Math.round(px * 0.58)
  const borderRadius = Math.max(4, Math.round(px * 0.22))
  const badgeSize = Math.max(10, Math.round(px * 0.38))

  const logoSrc = TOKEN_FILE_MAP[normTicker]

  const renderInner = () => {
    if (logoSrc && !imgError) {
      return (
        <div
          style={{
            width: `${px}px`,
            height: `${px}px`,
            borderRadius: `${borderRadius}px`,
            overflow: 'hidden',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
            background: '#0F1218',
          }}
          title={ticker}
        >
          <Image
            src={logoSrc}
            alt={ticker}
            width={px}
            height={px}
            unoptimized
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      )
    }
    return renderIcon()
  }

  // Configuration per asset: background gradient, border color, and custom SVG icon
  const renderIcon = () => {
    switch (normTicker) {
      case 'AAPL':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #1C1E22, #0D0E11)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* Apple Logo SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 170 170" fill="currentColor">
              <path
                fill="#FFFFFF"
                d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.6-7.83-11.7-14.38-6.19-9.88-11.06-21.65-14.61-35.31-3.55-13.66-5.33-26.68-5.33-39.06 0-15.02 3.73-27.42 11.19-37.21 7.46-9.79 17.07-14.77 28.84-14.95 4.67 0 10.02 1.25 16.05 3.75 6.03 2.5 9.94 3.79 11.74 3.87 1.52-.1 5.56-1.4 12.13-3.88 6.57-2.49 12.02-3.6 16.36-3.34 13.91.76 25.13 5.75 33.64 14.98-12.18 7.39-18.17 17.51-17.96 30.34.22 10.01 4.13 18.38 11.75 25.12 7.61 6.74 16.63 10.55 27.05 11.41-2.39 7.39-5.1 14.68-8.15 21.88zM119.22 33.65c0-7.39 2.65-14.46 7.95-21.21 5.3-6.75 11.89-11.2 19.78-13.34.43 1.96.65 3.81.65 5.55 0 7.39-2.83 14.79-8.48 22.2-5.66 7.4-12.39 11.85-20.21 13.36-.22-1.74-.33-3.07-.33-4z"
              />
            </svg>
          </div>
        )

      case 'TSLA':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #E82127, #A81419)',
              border: '1px solid rgba(255, 100, 100, 0.3)',
              boxShadow: '0 2px 10px rgba(232, 33, 39, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* Tesla 'T' Emblem SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path
                d="M12 5.5V19.5M12 5.5C14.2 5.5 17.5 6.2 19.5 7.5L20 5C17.5 4.1 14.5 3.7 12 3.7C9.5 3.7 6.5 4.1 4 5L4.5 7.5C6.5 6.2 9.8 5.5 12 5.5Z"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8.5 7.5L7 9.5C9.5 8.7 11 8.5 12 8.5C13 8.5 14.5 8.7 17 9.5L15.5 7.5"
                stroke="#FFFFFF"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )

      case 'MSFT':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #181B20, #0E1013)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* Microsoft 4-Color Grid SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24">
              <rect x="2" y="2" width="9.2" height="9.2" fill="#F25022" rx="1.2" />
              <rect x="12.8" y="2" width="9.2" height="9.2" fill="#7FBA00" rx="1.2" />
              <rect x="2" y="12.8" width="9.2" height="9.2" fill="#00A4EF" rx="1.2" />
              <rect x="12.8" y="12.8" width="9.2" height="9.2" fill="#FFB900" rx="1.2" />
            </svg>
          </div>
        )

      case 'NVDA':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #102110, #051005)',
              border: '1px solid rgba(118, 185, 0, 0.45)',
              boxShadow: '0 2px 10px rgba(118, 185, 0, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* NVIDIA Stylized Eye/Spiral Claw SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path
                d="M4.5 12C4.5 7.8 7.8 4.5 12 4.5C14.8 4.5 17.2 6 18.5 8.2M6.8 12C6.8 9.1 9.1 6.8 12 6.8C13.9 6.8 15.6 7.8 16.5 9.4M9.2 12C9.2 10.4 10.4 9.2 12 9.2C12.9 9.2 13.8 9.7 14.3 10.5M12 12C12 14.5 10 16.5 7.5 16.5H4M12 12C14.5 12 16.5 14 16.5 16.5V19.5"
                stroke="#76B900"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )

      case 'SPY':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #0A2E20, #03170F)',
              border: '1px solid rgba(14, 203, 129, 0.4)',
              boxShadow: '0 2px 10px rgba(14, 203, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* S&P 500 Benchmark Icon SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path d="M3 19V5M3 19H21M7 15L11 10L15 13L21 6" stroke="#0ECB81" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="21" cy="6" r="2" fill="#0ECB81" />
              <path d="M7 19V15M11 19V10M15 19V13" stroke="rgba(14, 203, 129, 0.4)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )

      case 'QQQ':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #071D3A, #040E1E)',
              border: '1px solid rgba(0, 164, 239, 0.4)',
              boxShadow: '0 2px 10px rgba(0, 164, 239, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* Nasdaq 100 Geometric Diamond SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path d="M12 2L21 7V17L12 22L3 17V7L12 2Z" stroke="#00A4EF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M12 6L18 9.5V14.5L12 18L6 14.5V9.5L12 6Z" fill="rgba(0, 164, 239, 0.2)" stroke="#38BDF8" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="2.5" fill="#FFFFFF" />
            </svg>
          </div>
        )

      case 'TBILL3M':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #2D2409, #151004)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              boxShadow: '0 2px 10px rgba(245, 158, 11, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* US Treasury Pediment & Pillars SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path d="M2 9L12 3L22 9V10H2V9Z" fill="#F59E0B" />
              <rect x="4" y="11" width="2.5" height="7" fill="#FCD34D" rx="0.5" />
              <rect x="8.75" y="11" width="2.5" height="7" fill="#FCD34D" rx="0.5" />
              <rect x="13" y="11" width="2.5" height="7" fill="#FCD34D" rx="0.5" />
              <rect x="17.5" y="11" width="2.5" height="7" fill="#FCD34D" rx="0.5" />
              <rect x="2" y="19" width="20" height="2" fill="#F59E0B" rx="0.5" />
            </svg>
          </div>
        )

      case 'TNOTE10':
      case 'TNOTE':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #1C2618, #0B1209)',
              border: '1px solid rgba(174, 212, 60, 0.5)',
              boxShadow: '0 2px 10px rgba(174, 212, 60, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* 10-Year Treasury Yield Scroll with Seal SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path
                d="M19 4H5C3.9 4 3 4.9 3 6V18C3 19.1 3.9 20 5 20H19C20.1 20 21 19.1 21 18V6C21 4.9 20.1 4 19 4Z"
                stroke="#AED43C"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M7 8H13M7 12H11" stroke="#AED43C" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="16" cy="13" r="2.8" stroke="#AED43C" strokeWidth="1.5" fill="rgba(174, 212, 60, 0.25)" />
              <path d="M16 16V18.5L17.5 17.5L19 18.5V16" fill="#AED43C" />
            </svg>
          </div>
        )

      case 'GOOGL':
      case 'GOOG':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #1E232A, #111418)',
              border: '1px solid rgba(66, 133, 244, 0.4)',
              boxShadow: '0 2px 10px rgba(66, 133, 244, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* Google Multicolored 'G' Logo SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                fill="#EA4335"
              />
            </svg>
          </div>
        )

      case 'GME':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #2D1416, #15090A)',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              boxShadow: '0 2px 10px rgba(239, 68, 68, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* GameStop Power Button Icon SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3V11M18.36 5.64C20 7.28 21 9.52 21 12C21 16.97 16.97 21 12 21C7.03 21 3 16.97 3 12C3 9.52 4 7.28 5.64 5.64"
                stroke="#EF4444"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )

      case 'SPCX':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #0F1A26, #060B12)',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              boxShadow: '0 2px 10px rgba(56, 189, 248, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* SpaceX Falcon Trajectory / Rocket Silhouette SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path
                d="M4.5 19.5L9 15M9 15L15 9M9 15L6 12M15 9L12 6M15 9L20 4M20 4L16 2M20 4L22 8M3 21L5 21L6 20L4 18L3 19L3 21Z"
                stroke="#38BDF8"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M12 18C15.31 18 18 15.31 18 12" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
        )

      case 'SGOV':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'linear-gradient(145deg, #0A261A, #04140D)',
              border: '1px solid rgba(16, 185, 129, 0.45)',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {/* US Treasury Bond Pillars SVG */}
            <svg width={iconPx} height={iconPx} viewBox="0 0 24 24" fill="none">
              <path d="M2 9L12 3L22 9V10H2V9Z" fill="#10B981" />
              <rect x="4" y="11" width="2.5" height="7" fill="#34D399" rx="0.5" />
              <rect x="8.75" y="11" width="2.5" height="7" fill="#34D399" rx="0.5" />
              <rect x="13" y="11" width="2.5" height="7" fill="#34D399" rx="0.5" />
              <rect x="17.5" y="11" width="2.5" height="7" fill="#34D399" rx="0.5" />
              <rect x="2" y="19" width="20" height="2" fill="#10B981" rx="0.5" />
            </svg>
          </div>
        )

      case 'ETH':
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: `${borderRadius}px`,
              background: '#627EEA',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              ...style,
            }}
            className={className}
          >
            <svg width={iconPx} height={iconPx} viewBox="0 0 32 32" fill="none">
              <path d="M16 4L15.8 4.7V20.2L16 20.4L23.4 16L16 4Z" fill="white" fillOpacity="0.85" />
              <path d="M16 4L8.6 16L16 20.4V4Z" fill="white" />
              <path d="M16 21.8L15.9 22V27.7L16 28L23.4 17.5L16 21.8Z" fill="white" fillOpacity="0.85" />
              <path d="M16 28V21.8L8.6 17.5L16 28Z" fill="white" />
              <path d="M16 20.4L23.4 16L16 12.7V20.4Z" fill="white" fillOpacity="0.5" />
              <path d="M8.6 16L16 20.4V12.7L8.6 16Z" fill="white" fillOpacity="0.85" />
            </svg>
          </div>
        )

      default:
        return (
          <div
            style={{
              width: `${px}px`,
              height: `${px}px`,
              borderRadius: '8px',
              background: 'var(--panel2)',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--tx)',
              flexShrink: 0,
              ...style,
            }}
            className={className}
          >
            {ticker.slice(0, 2)}
          </div>
        )
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: `${px}px`,
        height: `${px}px`,
        flexShrink: 0,
        ...style,
      }}
      className={className}
      title={ticker}
    >
      {renderInner()}
      {showChainBadge && <RobinhoodBadge size={badgeSize} />}
    </div>
  )
}

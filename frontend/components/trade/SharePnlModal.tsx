'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Download, Copy, Share2, Check, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { px7 } from '@/lib/utils'

export interface SharePnlData {
  tick: string
  name: string
  entry: number
  price: number
  balance: number
  isProfit: boolean
  pnlPct: number
  pnlUsd: number
  quoteAsset?: string
}

export function openSharePnl(data: SharePnlData) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('qualyra:open-share-pnl', { detail: data }))
}

export function SharePnlModal() {
  const [data, setData] = useState<SharePnlData | null>(null)
  const [theme, setTheme] = useState<'robinhood' | 'cyber' | 'titanium'>('robinhood')
  const [showUsd, setShowUsd] = useState(true)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as SharePnlData
      if (detail) {
        setData(detail)
        setCopied(false)
      }
    }
    window.addEventListener('qualyra:open-share-pnl', handleOpen)
    return () => {
      window.removeEventListener('qualyra:open-share-pnl', handleOpen)
    }
  }, [])

  if (!data) return null

  const isProfit = data.isProfit
  const pnlPctStr = (isProfit ? '+' : '') + data.pnlPct.toFixed(2) + '%'
  const pnlUsdStr = (isProfit ? '+' : '') + '$' + Math.abs(data.pnlUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Theme Styling Profiles
  const themeStyles = {
    robinhood: {
      bg: 'linear-gradient(145deg, #0A0F0D 0%, #111C15 50%, #06110A 100%)',
      border: '1px solid rgba(16, 185, 129, 0.35)',
      accent: '#10B981',
      badgeBg: 'rgba(16, 185, 129, 0.15)',
      subText: '#8E9B90',
      heroShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(16, 185, 129, 0.12)',
    },
    cyber: {
      bg: 'linear-gradient(145deg, #0B0B1A 0%, #14112E 50%, #080816 100%)',
      border: '1px solid rgba(168, 85, 247, 0.4)',
      accent: '#06B6D4',
      badgeBg: 'rgba(168, 85, 247, 0.18)',
      subText: '#9A9AA8',
      heroShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(6, 182, 212, 0.15)',
    },
    titanium: {
      bg: 'linear-gradient(145deg, #1C1E22 0%, #292C33 50%, #16181B 100%)',
      border: '1px solid rgba(255, 255, 255, 0.18)',
      accent: isProfit ? '#10B981' : '#EF4444',
      badgeBg: 'rgba(255, 255, 255, 0.08)',
      subText: '#A1A7B2',
      heroShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
    },
  }[theme]

  // Render to Canvas and trigger download
  const handleDownloadPng = async () => {
    setDownloading(true)
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const scale = 2
      const w = 600
      const h = 420
      canvas.width = w * scale
      canvas.height = h * scale
      ctx.scale(scale, scale)

      // Background
      const grad = ctx.createLinearGradient(0, 0, w, h)
      if (theme === 'robinhood') {
        grad.addColorStop(0, '#0A0F0D')
        grad.addColorStop(0.5, '#121F17')
        grad.addColorStop(1, '#06110A')
      } else if (theme === 'cyber') {
        grad.addColorStop(0, '#0B0B1A')
        grad.addColorStop(0.5, '#171233')
        grad.addColorStop(1, '#080816')
      } else {
        grad.addColorStop(0, '#1C1E22')
        grad.addColorStop(0.5, '#292C33')
        grad.addColorStop(1, '#16181B')
      }
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, w, h)

      // Accent border
      ctx.strokeStyle = isProfit ? '#10B981' : '#EF4444'
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, w - 2, h - 2)

      // Top branding
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('QUALYRA', 36, 44)

      ctx.fillStyle = themeStyles.accent
      ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('ROBINHOOD CHAIN DEX', 130, 43)

      // Watermark right
      ctx.fillStyle = '#6B7280'
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('🔒 Liquidity Locked', w - 190, 44)

      // Separator
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(36, 62)
      ctx.lineTo(w - 36, 62)
      ctx.stroke()

      // Ticker & Token Name
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(`$${data.tick}`, 36, 110)

      ctx.fillStyle = '#9CA3AF'
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(data.name, 36, 134)

      // Long / Spot Badge
      ctx.fillStyle = isProfit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
      ctx.fillRect(w - 120, 88, 84, 28)
      ctx.strokeStyle = isProfit ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
      ctx.strokeRect(w - 120, 88, 84, 28)

      ctx.fillStyle = isProfit ? '#10B981' : '#EF4444'
      ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(isProfit ? 'PROFIT 🚀' : 'POSITION', w - 108, 106)

      // Main ROI Headline
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('RETURN ON INVESTMENT (ROI)', 36, 184)

      ctx.fillStyle = isProfit ? '#10B981' : '#EF4444'
      ctx.font = '900 58px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(pnlPctStr, 36, 244)

      // Price comparison
      const metricsY = 290
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('ENTRY PRICE', 36, metricsY)
      ctx.fillText('MARK PRICE', 180, metricsY)
      if (showUsd) {
        ctx.fillText('EST. NET PNL', 330, metricsY)
      }

      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('$' + px7(data.entry), 36, metricsY + 24)
      ctx.fillText('$' + px7(data.price), 180, metricsY + 24)
      if (showUsd) {
        ctx.fillStyle = isProfit ? '#10B981' : '#EF4444'
        ctx.fillText(pnlUsdStr, 330, metricsY + 24)
      }

      // Bottom Bar
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
      ctx.beginPath()
      ctx.moveTo(36, 350)
      ctx.lineTo(w - 36, 350)
      ctx.stroke()

      ctx.fillStyle = '#6B7280'
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText('app.qualyra.com · Powered by Robinhood Chain', 36, 385)

      ctx.fillStyle = '#9CA3AF'
      ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      ctx.fillText(new Date().toUTCString().slice(0, 22), w - 180, 385)

      // Download
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `qualyra-pnl-${data.tick.toLowerCase()}-${Date.now()}.png`
      a.click()
    } catch (err) {
      console.error('Failed to generate PnL image', err)
    } finally {
      setDownloading(false)
    }
  }

  // Copy card link / text
  const handleCopyLink = () => {
    const text = `Just hit ${pnlPctStr} ${showUsd ? `(${pnlUsdStr}) ` : ''}on $${data.tick} on Qualyra DEX (Robinhood Chain)! 🚀\nTrade here: https://app.qualyra.com/trade?pair=${data.tick.toLowerCase()}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  // Share to X
  const handleShareX = () => {
    const text = encodeURIComponent(
      `Just hit ${pnlPctStr} ${showUsd ? `(${pnlUsdStr}) ` : ''}on $${data.tick} on @QualyraDEX! Built on @RobinhoodApp Chain 🚀\n\nTrade live on Robinhood Chain:`
    )
    const url = encodeURIComponent(`https://app.qualyra.com/trade?pair=${data.tick.toLowerCase()}`)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => setData(null)}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'var(--modal-bg, #FFFFFF)',
          border: '1px solid var(--line)',
          borderRadius: '14px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--panel2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'var(--brand-dim)',
                border: '1px solid var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--tx)',
                flexShrink: 0,
              }}
            >
              <Share2 size={16} strokeWidth={2.4} />
            </div>
            <div>
              <b style={{ fontSize: '14.5px', color: 'var(--tx)' }}>Shareable PnL Card</b>
              <div style={{ fontSize: '11px', color: 'var(--dim)' }}>
                Generate brag cards for social media on Robinhood Chain
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setData(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--dim)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body: The Live PnL Card Preview */}
        <div style={{ padding: '20px', background: 'var(--inset)' }}>
          <div
            ref={cardRef}
            style={{
              borderRadius: '12px',
              padding: '24px',
              background: themeStyles.bg,
              border: themeStyles.border,
              boxShadow: themeStyles.heroShadow,
              position: 'relative',
              overflow: 'hidden',
              userSelect: 'none',
            }}
          >
            {/* Top Brand Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <b style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.04em', color: '#FFFFFF' }}>
                  QUALYRA
                </b>
                <span
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 800,
                    letterSpacing: '0.08em',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: themeStyles.badgeBg,
                    color: themeStyles.accent,
                    border: `1px solid ${themeStyles.accent}40`,
                  }}
                >
                  ROBINHOOD CHAIN
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#9CA3AF' }}>
                <ShieldCheck size={13} style={{ color: '#10B981' }} />
                <span>Verified DEX</span>
              </div>
            </div>

            {/* Token & Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
                  ${data.tick}
                </div>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '2px' }}>
                  {data.name}
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: isProfit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  border: `1px solid ${isProfit ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
                  color: isProfit ? '#10B981' : '#EF4444',
                }}
              >
                {isProfit ? 'PROFIT 🚀' : 'POSITION'}
              </span>
            </div>

            {/* Big ROI Display */}
            <div style={{ margin: '10px 0 16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                RETURN ON INVESTMENT (ROI)
              </div>
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 900,
                  color: isProfit ? '#10B981' : '#EF4444',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                  marginTop: '4px',
                  textShadow: isProfit ? '0 0 20px rgba(16, 185, 129, 0.3)' : '0 0 20px rgba(239, 68, 68, 0.3)',
                }}
              >
                {pnlPctStr}
              </div>
            </div>

            {/* Metrics Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: showUsd ? '1fr 1fr 1.2fr' : '1fr 1fr',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div>
                <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600 }}>ENTRY PRICE</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                  ${px7(data.entry, data.quoteAsset === 'USD' || data.entry >= 100)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600 }}>MARK PRICE</div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#FFFFFF', marginTop: '2px' }}>
                  ${px7(data.price, data.quoteAsset === 'USD' || data.price >= 100)}
                </div>
              </div>
              {showUsd && (
                <div>
                  <div style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 600 }}>EST. NET PNL</div>
                  <div
                    style={{
                      fontSize: '13.5px',
                      fontWeight: 800,
                      color: isProfit ? '#10B981' : '#EF4444',
                      marginTop: '2px',
                    }}
                  >
                    {pnlUsdStr}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Stamp */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                paddingTop: '10px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '10.5px',
                color: '#6B7280',
              }}
            >
              <span>app.qualyra.com · Robinhood Chain</span>
              <span className="mono">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          </div>
        </div>

        {/* Modal Controls: Customization Bar */}
        <div
          style={{
            padding: '14px 20px',
            background: 'var(--panel)',
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Theme Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--dim)', fontWeight: 600 }}>Theme:</span>
            {(['robinhood', 'cyber', 'titanium'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '5px',
                  fontSize: '11px',
                  fontWeight: theme === t ? 700 : 500,
                  border: `1px solid ${theme === t ? 'var(--brand)' : 'var(--line)'}`,
                  background: theme === t ? 'var(--brand-dim)' : 'var(--input)',
                  color: theme === t ? 'var(--brand)' : 'var(--dim)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Toggle Show USD Amount */}
          <button
            type="button"
            onClick={() => setShowUsd(!showUsd)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: 'none',
              border: 'none',
              color: 'var(--dim)',
              fontSize: '11.5px',
              cursor: 'pointer',
            }}
          >
            {showUsd ? <Eye size={13} /> : <EyeOff size={13} />}
            <span>{showUsd ? 'Hide USD Amount' : 'Show USD Amount'}</span>
          </button>
        </div>

        {/* Modal Action Buttons: Download, Copy, Share to X & Telegram */}
        <div
          style={{
            padding: '16px 20px',
            background: 'var(--panel2)',
            borderTop: '1px solid var(--line)',
            display: 'grid',
            gridTemplateColumns: '1.2fr 1fr 1fr',
            gap: '8px',
          }}
        >
          <button
            type="button"
            className="btn btn-brand"
            onClick={handleDownloadPng}
            disabled={downloading}
            style={{
              padding: '9px 14px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Download size={14} />
            <span>{downloading ? 'Rendering...' : 'Download Card'}</span>
          </button>

          <button
            type="button"
            className="btn btn-subtle"
            onClick={handleShareX}
            style={{
              padding: '9px 12px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>𝕏 Share</span>
          </button>

          <button
            type="button"
            className="btn btn-subtle"
            onClick={handleCopyLink}
            style={{
              padding: '9px 12px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {copied ? <Check size={14} style={{ color: '#10B981' }} /> : <Copy size={14} />}
            <span>{copied ? 'Copied!' : 'Copy Text'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

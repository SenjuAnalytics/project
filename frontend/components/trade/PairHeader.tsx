'use client'

import React from 'react'
import Image from 'next/image'
import { Globe, Share2 } from 'lucide-react'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { DiscordIcon, TelegramIcon, XIcon } from '@/components/ui/SocialIcons'
import { useToast } from '@/components/ui/Toast'
import type { Project } from '@/lib/data'
import { logoTransform } from '@/lib/ipfs'
import { fmtUsd, px7, tickerColor } from '@/lib/utils'
import type { TradeItem } from '@/lib/trade/types'

interface PairHeaderProps {
  curProject: Project
  quote: string
  quoteUsdPrice?: number
  explorerBase: string
  favs: Set<string>
  toggleFav: (id: string, e: React.MouseEvent) => void
  priceTrends: Record<string, 'up' | 'down' | null>
  trades: TradeItem[]
  setMobileView: (view: 'chart' | 'trades' | 'markets') => void
}

/** Fixed top banner of the trade view showing pair stats, 24h metrics, and links. */
export function PairHeader({
  curProject,
  quote,
  quoteUsdPrice,
  explorerBase,
  favs,
  toggleFav,
  priceTrends,
  trades,
  setMobileView,
}: PairHeaderProps) {
  const { toast } = useToast()

  const isUsdQuote = quote === 'USDG' || quote === 'USD' || quote === 'USDC'
  const effectiveQuoteUsd = (quoteUsdPrice && quoteUsdPrice > 0) ? quoteUsdPrice : (quote === 'ETH' ? 2400 : 1)
  const isChainToken = /^0x[0-9a-fA-F]{40}$/.test(curProject.id)
  const isRwa = !!curProject.rwa

  // Dual Pricing: Primary USD valuation + Native quote valuation
  const priceUsd = isChainToken ? (isUsdQuote ? curProject.price : curProject.price * effectiveQuoteUsd) : curProject.price
  const hiUsd = isChainToken ? (isUsdQuote ? curProject.hi : curProject.hi * effectiveQuoteUsd) : curProject.hi
  const loUsd = isChainToken ? (isUsdQuote ? curProject.lo : curProject.lo * effectiveQuoteUsd) : curProject.lo

  return (
    <div style={{ flexShrink: 0, borderBottom: '1px solid var(--line)', background: 'var(--panel)' }}>
      <div className="pairhd" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ position: 'relative', display: 'inline-flex', width: '36px', height: '36px', flexShrink: 0 }}>
          {curProject.rwa ? (
            <RwaLogo ticker={curProject.tick} size={36} showChainBadge={false} />
          ) : curProject.logoUrl ? (
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: curProject.logoShape === 'circle' ? '50%' : '8px',
                background: curProject.logoBg === 'white' ? '#FFFFFF' : curProject.logoBg === 'dark' ? '#0F1218' : 'var(--inset)',
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
                src={curProject.logoUrl}
                alt={curProject.tick}
                width={36}
                height={36}
                unoptimized
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: curProject.logoFit || 'cover',
                  transform: logoTransform(curProject.logoScale),
                }}
              />
            </div>
          ) : (
            <div
              className="coin"
              style={{ background: tickerColor(curProject.tick), width: '36px', height: '36px', fontSize: '12px' }}
            >
              {curProject.tick.slice(0, 2)}
            </div>
          )}
          <RobinhoodBadge size={15} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <h2 style={{ margin: 0 }}>{curProject.tick} <span style={{ fontSize: '14px', fontWeight: 500 }}>/ {quote}</span></h2>
            {curProject.rwa && (
              <span style={{
                fontSize: '9.5px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: curProject.rwaType === 'stock'
                  ? 'rgba(59, 130, 246, 0.12)'
                  : curProject.rwaType === 'treasury'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : 'rgba(139, 92, 246, 0.14)',
                color: curProject.rwaType === 'stock'
                  ? '#60A5FA'
                  : curProject.rwaType === 'treasury'
                  ? '#34D399'
                  : '#A78BFA',
                fontWeight: 700,
                border: `1px solid ${
                  curProject.rwaType === 'stock'
                    ? 'rgba(59, 130, 246, 0.3)'
                    : curProject.rwaType === 'treasury'
                    ? 'rgba(16, 185, 129, 0.3)'
                    : 'rgba(139, 92, 246, 0.3)'
                }`,
                letterSpacing: '0.4px',
                lineHeight: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                {curProject.rwaType === 'stock' ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                      <polyline points="16 7 22 7 22 13" />
                    </svg>
                    STOCK
                  </>
                ) : curProject.rwaType === 'treasury' ? (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                    </svg>
                    TREASURY
                  </>
                ) : (
                  <>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                    </svg>
                    RWA
                  </>
                )}
              </span>
            )}
            <button
              type="button"
              onClick={e => toggleFav(curProject.id, e)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                color: favs.has(curProject.id) ? '#F59E0B' : 'var(--dim)',
                lineHeight: 1,
                padding: '2px 4px',
                transition: 'transform 0.15s ease, color 0.15s ease',
              }}
              title={favs.has(curProject.id) ? 'Starred in Favorites (Click to remove)' : 'Add to Favorites (★)'}
            >
              {favs.has(curProject.id) ? '★' : '☆'}
            </button>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--ft)', marginTop: '2px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <span>{curProject.name}</span>
            {curProject.platform && (
              <span style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '4px',
                background: 'var(--panel2)',
                color: 'var(--brand)',
                border: '1px solid var(--line)',
                fontWeight: 600,
              }}>
                {curProject.platform}
              </span>
            )}
            {curProject.address && (
              <a
                href={curProject.explorerUrl || `${explorerBase}/token/${curProject.address}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '10.5px',
                  color: 'var(--dim)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontFamily: 'monospace',
                }}
                title={`View on Robinhood Chain Blockscout: ${curProject.address}`}
              >
                {curProject.address.slice(0, 6)}…{curProject.address.slice(-4)} ↗
              </a>
            )}
          </div>
        </div>
        <button
          type="button"
          className="trade-mobile-switch-btn"
          onClick={() => setMobileView('markets')}
          title="Select Token Pair"
        >
          ⇄ Markets
        </button>
        {(() => {
          const trend = priceTrends[curProject.id.toLowerCase()] || priceTrends[curProject.tick.toLowerCase()] || priceTrends[curProject.tick.toLowerCase().replace(/^r/, '')]
          return (
            <div
              className="px-now"
              style={{
                fontSize: '20px',
                fontWeight: 700,
                color: trend === 'up' ? '#00c853' : trend === 'down' ? '#f6465d' : 'inherit',
                transition: 'color 0.35s ease',
              }}
            >
              ${px7(priceUsd, isRwa)}
            </div>
          )
        })()}
        <div className={`chip ${curProject.chg >= 0 ? 'up' : 'dn'}`}>
          {curProject.chg >= 0 ? '+' : ''}{curProject.chg.toFixed(2)}%
        </div>
        <div className="hstat">
          <div className="l">24h High</div>
          <div className="v">${px7(hiUsd, isRwa)}</div>
        </div>
        <div className="hstat">
          <div className="l">24h Low</div>
          <div className="v">${px7(loUsd, isRwa)}</div>
        </div>
        <div className="hstat">
          <div className="l">Q-Volume</div>
          <div className="v">{fmtUsd(curProject.vol24)}</div>
        </div>
        <div className="hstat">
          <div className="l">Mkt Cap</div>
          <div className="v">{fmtUsd(curProject.mcap)}</div>
        </div>
        <div className="hd-tags">
          {curProject.status === 'bonding' && (
            <span className="tag bd">BOND {curProject.progress}%</span>
          )}
          {curProject.battle > 0 && <span className="tag bl">BTL #{curProject.battle}</span>}
          {curProject.rwa && <span className="tag" style={{ color: 'var(--brand)', background: 'rgba(var(--brand-rgb),.15)', border: '1px solid rgba(var(--brand-rgb),.3)' }}>🏦 RWA</span>}
          {(() => {
            const buyPressure = trades.length > 0
              ? Math.round((trades.filter(t => t.isBuy).length / trades.length) * 100)
              : 50
            const isBullish = buyPressure >= 50
            return (
              <span
                className="tag"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: isBullish ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  border: `1px solid ${isBullish ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  color: isBullish ? '#10B981' : '#EF4444',
                }}
                title={`Buy Pressure: ${buyPressure}% (based on recent verified fills)`}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isBullish ? '#10B981' : '#EF4444' }} />
                Buy Pressure: {buyPressure}%
              </span>
            )
          })()}
          {(curProject.website || curProject.twitter || curProject.telegram || curProject.discord) && (
            <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center', marginLeft: '4px' }}>
              {curProject.website && (
                <a
                  href={curProject.website}
                  target="_blank"
                  rel="noreferrer"
                  title={`Website: ${curProject.website}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    background: 'var(--input)',
                    border: '1px solid var(--line)',
                    color: 'var(--dim)',
                    transition: 'color .15s, border-color .15s',
                  }}
                >
                  <Globe size={13} />
                </a>
              )}
              {curProject.twitter && (
                <a
                  href={curProject.twitter.startsWith('http') ? curProject.twitter : `https://x.com/${curProject.twitter.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Twitter: ${curProject.twitter}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    background: 'var(--input)',
                    border: '1px solid var(--line)',
                    color: 'var(--dim)',
                    transition: 'color .15s, border-color .15s',
                  }}
                >
                  <XIcon size={12} color="currentColor" />
                </a>
              )}
              {curProject.telegram && (
                <a
                  href={curProject.telegram.startsWith('http') ? curProject.telegram : `https://t.me/${curProject.telegram.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Telegram: ${curProject.telegram}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    background: 'var(--input)',
                    border: '1px solid var(--line)',
                    color: '#229ED9',
                    transition: 'color .15s, border-color .15s',
                  }}
                >
                  <TelegramIcon size={12} color="#229ED9" />
                </a>
              )}
              {curProject.discord && (
                <a
                  href={curProject.discord.startsWith('http') ? curProject.discord : `https://discord.gg/${curProject.discord}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`Discord: ${curProject.discord}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    background: 'var(--input)',
                    border: '1px solid var(--line)',
                    color: '#5865F2',
                    transition: 'color .15s, border-color .15s',
                  }}
                >
                  <DiscordIcon size={12} color="#5865F2" />
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    navigator.clipboard.writeText(window.location.href)
                    toast.success('Trade Link Copied! 📋', `Direct URL for $${curProject.tick} copied to clipboard.`)
                  }
                }}
                title="Copy Direct Trade URL to Clipboard"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  background: 'var(--input)',
                  border: '1px solid var(--line)',
                  color: 'var(--dim)',
                  cursor: 'pointer',
                  transition: 'color .15s, border-color .15s',
                }}
              >
                <Share2 size={12} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

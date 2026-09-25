'use client'

import Image from 'next/image'
import { 
  Globe, 
  Link2, 
  TrendingUp, 
  Lock 
} from 'lucide-react'
import { DiscordIcon, TelegramIcon, XIcon } from '@/components/ui/SocialIcons'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { logoTransform } from '@/lib/ipfs'
import { useLaunchFee } from '@/lib/useQualyraLaunch'
import { type CustomSocialLink } from '@/hooks/launch/useLaunchForm'

interface LaunchPreviewCardProps {
  logoUrl: string
  logoFit: 'cover' | 'contain'
  logoShape: 'squircle' | 'circle'
  logoBg: 'transparent' | 'white' | 'dark'
  logoScale: number
  displayName: string
  displayTicker: string
  displayDesc: string
  coinBg: string
  quoteAsset: string
  goal: string
  creatorTax: number
  website: string
  twitter: string
  telegram: string
  discord: string
  customLinks: CustomSocialLink[]
}

export function LaunchPreviewCard({
  logoUrl,
  logoFit,
  logoShape,
  logoBg,
  logoScale,
  displayName,
  displayTicker,
  displayDesc,
  coinBg,
  quoteAsset,
  goal,
  creatorTax,
  website,
  twitter,
  telegram,
  discord,
  customLinks,
}: LaunchPreviewCardProps) {
  const launchFee = useLaunchFee()
  return (
    <div className="panel prev">
      <div className="ph">
        <span>Listing Preview</span>
        <span className="k">LIVE</span>
      </div>
      <div className="body" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <div style={{ position: 'relative', display: 'inline-flex', width: '38px', height: '38px', flexShrink: 0 }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: logoShape === 'circle' ? '50%' : '9px',
                overflow: 'hidden',
                border: '1.5px solid var(--line)',
                flexShrink: 0,
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                background: logoBg === 'white' ? '#ffffff' : logoBg === 'dark' ? '#141915' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt={displayName}
                  unoptimized
                  width={64}
                  height={64}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: logoFit,
                    transform: logoTransform(logoScale),
                    transition: 'transform .1s ease',
                  }}
                />
              ) : (
                <div
                  className="coin"
                  style={{
                    background: coinBg,
                    width: '100%',
                    height: '100%',
                    borderRadius: logoShape === 'circle' ? '50%' : 0,
                    fontSize: '13px',
                  }}
                >
                  {displayTicker.slice(0, 2)}
                </div>
              )}
            </div>
            <RobinhoodBadge size={14} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.01em', color: 'var(--tx)' }}>
              {displayTicker}{' '}
              <span style={{ fontSize: '13px', color: 'var(--ft)', fontWeight: 500 }}>
                / {quoteAsset}
              </span>
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--mt)', lineHeight: 1.25, marginTop: '3px', fontWeight: 400 }}>
              {displayName}
            </div>
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--mt)', lineHeight: 1.6, marginBottom: '14px' }}>
          {displayDesc}
        </p>

        {/* Social Channels Preview in Listing Preview */}
        {(website || twitter || telegram || discord || customLinks.some(l => l.url.trim())) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {website && (
              <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--input)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--line)', color: 'var(--brand)', fontWeight: 600 }}>
                <Globe size={11} /> Web
              </span>
            )}
            {twitter && (
              <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--input)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--line)', color: 'var(--tx)', fontWeight: 600 }}>
                <XIcon size={11} color="var(--tx)" /> X
              </span>
            )}
            {telegram && (
              <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--input)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--line)', color: '#2AABEE', fontWeight: 600 }}>
                <TelegramIcon size={11} color="#2AABEE" /> TG
              </span>
            )}
            {discord && (
              <span style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--input)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--line)', color: '#5865F2', fontWeight: 600 }}>
                <DiscordIcon size={11} color="#5865F2" /> Discord
              </span>
            )}
            {customLinks.filter(l => l.url.trim()).map(l => (
              <span key={l.id} style={{ fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'var(--input)', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--line)', color: 'var(--dim)' }}>
                <Link2 size={11} /> {l.label}
              </span>
            ))}
          </div>
        )}

        {/* Interactive Dynamic Bonding Curve Visualizer */}
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <TrendingUp size={14} style={{ color: 'var(--brand)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)' }}>
                Bonding Curve Price Trajectory
              </span>
            </div>
            <span style={{ fontSize: '10.5px', color: 'var(--brand)', fontWeight: 700, background: 'rgba(var(--brand-rgb), 0.12)', padding: '2px 6px', borderRadius: '4px' }}>
              Exponential Curve
            </span>
          </div>

          {/* SVG Curve Canvas */}
          <div style={{ background: 'var(--inset)', borderRadius: '8px', border: '1px solid var(--line)', padding: '10px 12px 6px' }}>
            <svg viewBox="0 0 320 115" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
              <defs>
                <linearGradient id="launchCurveGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="launchCurveLine" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10B981" />
                  <stop offset="50%" stopColor="var(--brand)" />
                  <stop offset="100%" stopColor="#F59E0B" />
                </linearGradient>
              </defs>

              {/* Grid lines */}
              <line x1="20" y1="20" x2="305" y2="20" stroke="var(--line2)" strokeDasharray="3 3" opacity="0.6" />
              <line x1="20" y1="58" x2="305" y2="58" stroke="var(--line2)" strokeDasharray="3 3" opacity="0.6" />
              <line x1="20" y1="95" x2="305" y2="95" stroke="var(--line2)" opacity="0.8" />

              {/* Area under curve */}
              <path
                d="M 20 95 C 110 92, 190 68, 305 20 L 305 95 Z"
                fill="url(#launchCurveGrad)"
              />

              {/* The Bonding Curve */}
              <path
                d="M 20 95 C 110 92, 190 68, 305 20"
                fill="none"
                stroke="url(#launchCurveLine)"
                strokeWidth="2.8"
                strokeLinecap="round"
              />

              {/* Curve progress markers */}
              {/* Fair launch */}
              <circle cx="20" cy="95" r="4.5" fill="#10B981" stroke="var(--panel)" strokeWidth="1.5" />
              <text x="20" y="110" fontSize="9" fill="var(--dim)" textAnchor="start" fontFamily="sans-serif" fontWeight="600">Opening price</text>

              {/* Sold on the curve */}
              <circle cx="180" cy="66" r="3.5" fill="var(--brand)" stroke="var(--panel)" strokeWidth="1.5" />
              <text x="180" y="58" fontSize="8.5" fill="var(--dim)" textAnchor="middle" fontFamily="sans-serif">5/7 of supply sold here</text>

              {/* Graduation Target */}
              <circle cx="305" cy="20" r="5" fill="#F59E0B" stroke="var(--panel)" strokeWidth="2" />
              <text x="305" y="12" fontSize="9.5" fill="#F59E0B" textAnchor="end" fontFamily="sans-serif" fontWeight="700">Graduation (Uniswap v4 pool)</text>
            </svg>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--dim)', marginTop: '6px' }}>
            <span>Sold on the curve: <b>5/7 of supply</b></span>
            <span>Graduation target: <b>{goal} {quoteAsset}</b></span>
          </div>
        </div>

        {/* Where the money goes */}
        <div style={{ marginTop: '16px', background: 'var(--subtle)', border: '1px solid var(--line)', borderRadius: '8px', padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={14} style={{ color: 'var(--green)' }} />
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)' }}>
                Where the money goes
              </span>
            </div>
          </div>

          {/* Trading fee split, locked for this token at launch */}
          <div style={{ width: '100%', height: '8px', borderRadius: '4px', background: 'var(--input)', overflow: 'hidden', display: 'flex', marginBottom: '10px' }}>
            <div style={{ width: '70%', height: '100%', background: 'var(--brand)' }} title="Creator: 70% of the 1% trading fee" />
            <div style={{ width: '15%', height: '100%', background: 'var(--green)' }} title="Platform: 15%" />
            <div style={{ width: '15%', height: '100%', background: '#ffb300' }} title="Competition: 15%" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11.5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--dim)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--brand)' }} />
                Trading fee to you (70%){creatorTax > 0 ? ` + ${creatorTax}% creator tax` : ''}:
              </span>
              <b style={{ color: 'var(--brand)' }}>On every trade, forever</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--dim)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '2px', background: 'var(--green)' }} />
                Platform (15%) · Competition (15%):
              </span>
              <b style={{ color: 'var(--green)' }}>Battle pots and weekly prizes</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--dim)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Lock size={11} style={{ color: 'var(--green)' }} />
                Liquidity at graduation:
              </span>
              <b style={{ color: 'var(--green)' }}>100% locked, permanently</b>
            </div>
          </div>
        </div>

        {/* What the launch actually does */}
        <div style={{ marginTop: '14px', borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--tx)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Lock size={12} style={{ color: 'var(--brand)' }} />
            <span>How your supply is used</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '11px' }}>
            <div style={{ background: 'var(--inset)', border: '1px solid var(--line)', borderRadius: '5px', padding: '6px 8px' }}>
              <div style={{ color: 'var(--dim)', fontSize: '10px' }}>Sold on the curve</div>
              <b style={{ color: 'var(--tx)' }}>5/7 of supply</b>
            </div>
            <div style={{ background: 'var(--inset)', border: '1px solid var(--line)', borderRadius: '5px', padding: '6px 8px' }}>
              <div style={{ color: 'var(--dim)', fontSize: '10px' }}>Seeds the pool</div>
              <b style={{ color: 'var(--tx)' }}>2/7 of supply</b>
            </div>
            <div style={{ background: 'var(--inset)', border: '1px solid var(--line)', borderRadius: '5px', padding: '6px 8px' }}>
              <div style={{ color: 'var(--dim)', fontSize: '10px' }}>Creator allocation</div>
              <b style={{ color: 'var(--green)' }}>None</b>
            </div>
            <div style={{ background: 'var(--inset)', border: '1px solid var(--line)', borderRadius: '5px', padding: '6px 8px' }}>
              <div style={{ color: 'var(--dim)', fontSize: '10px' }}>Launch fee</div>
              <b style={{ color: 'var(--brand)' }}>{launchFee ?? '—'}</b>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '14px', padding: '9px 12px', background: 'rgba(var(--brand-rgb), 0.08)', border: '1px solid rgba(var(--brand-rgb), 0.25)', borderRadius: '6px', fontSize: '11px', color: 'var(--tx)', lineHeight: 1.5 }}>
          🔒 <b>No creator allocation.</b> The entire supply goes to the bonding curve, so creator pre-mine and early liquidation are impossible. If a completed curve cannot graduate for 7 days, the admin can open proportional refunds for buyers.
        </div>
      </div>
    </div>
  )
}

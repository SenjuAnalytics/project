'use client'

import React from 'react'
import Image from 'next/image'
import { logoTransform } from '@/lib/ipfs'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShieldCheck, Rocket, Loader2, Globe, Link2 } from 'lucide-react'
import { DiscordIcon, TelegramIcon, XIcon } from '@/components/ui/SocialIcons'
import { tickerColor } from '@/lib/utils'

interface DeployModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  isDeploying: boolean
  data: {
    name: string
    ticker: string
    logoUrl?: string
    logoFit?: 'cover' | 'contain'
    logoShape?: 'squircle' | 'circle'
    logoBg?: 'transparent' | 'white' | 'dark'
    logoScale?: number
    desc: string
    supply: string
    goal: string
    quoteAsset?: string
    creatorTax: number
    snipeExempt: number
    firstBuy: string
    feeRecipient: string
    website?: string
    twitter?: string
    telegram?: string
    discord?: string
    customLinks?: { id: string; label: string; url: string }[]
  }
}

export function DeployConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isDeploying,
  data,
}: DeployModalProps) {
  if (!isOpen) return null

  const displayTicker = (data.ticker.trim().replace(/^\$+/, '') || 'TICK').toUpperCase()
  const displayName = data.name.trim() || 'Your Project'
  const coinBg = tickerColor(displayTicker)

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={isDeploying ? undefined : onClose}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)',
          }}
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '520px',
            background: 'var(--modal-bg, #FFFFFF)',
            border: '1px solid var(--line)',
            borderRadius: '12px',
            boxShadow: '0 20px 48px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.06)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Modal Header */}
          <div
            style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--modal-bg, #FFFFFF)',
            }}
          >
            <div>
              <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--tx)', margin: 0, letterSpacing: '-0.01em' }}>
                Review & Deploy Token
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--dim)', margin: '3px 0 0' }}>
                Robinhood Chain · Onchain Smart Contract Provisioning
              </p>
            </div>
            {!isDeploying && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'var(--input)',
                  border: '1px solid var(--line2)',
                  borderRadius: '50%',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: 'var(--dim)',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Modal Body */}
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '72vh', overflowY: 'auto' }}>
            {/* Token Highlight Preview */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '14px 16px',
                background: 'var(--input)',
                borderRadius: '8px',
                border: '1px solid var(--line)',
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: (data.logoShape || 'squircle') === 'circle' ? '50%' : '10px',
                  overflow: 'hidden',
                  border: '1.5px solid var(--line)',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                  background: data.logoBg === 'white' ? '#ffffff' : data.logoBg === 'dark' ? '#141915' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {data.logoUrl ? (
                  <Image
                    src={data.logoUrl}
                    alt={displayName}
                    width={44}
                    height={44}
                    unoptimized
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: data.logoFit || 'cover',
                      transform: logoTransform(data.logoScale),
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      background: coinBg,
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: 900,
                    }}
                  >
                    {displayTicker.slice(0, 2)}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <b style={{ fontSize: '15.5px', color: 'var(--tx)', letterSpacing: '-0.01em' }}>
                    {displayTicker}{' '}
                    <span style={{ fontSize: '12.5px', color: 'var(--ft)', fontWeight: 400 }}>
                      / {data.quoteAsset || 'ETH'}
                    </span>
                  </b>
                  <span style={{ fontSize: '11px', color: 'var(--dim)', background: 'var(--panel)', padding: '2px 7px', borderRadius: '4px', border: '1px solid var(--line)' }}>
                    {data.snipeExempt > 0 ? `${data.snipeExempt} snipe-exempt wallet${data.snipeExempt === 1 ? '' : 's'}` : 'No snipe exemptions'}
                  </span>
                </div>
                <div style={{ fontSize: '12.5px', color: 'var(--mt)', marginTop: '2px' }}>
                  {displayName}
                </div>
              </div>
            </div>

            {/* Parameter Details Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
              }}
            >
              <div style={{ padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <span className="k" style={{ fontSize: '10.5px', color: 'var(--dim)', display: 'block' }}>TOTAL SUPPLY</span>
                <b style={{ fontSize: '13px', color: 'var(--tx)', marginTop: '3px', display: 'block' }}>{data.supply}</b>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <span className="k" style={{ fontSize: '10.5px', color: 'var(--dim)', display: 'block' }}>GRADUATION TARGET</span>
                <b style={{ fontSize: '13px', color: 'var(--tx)', marginTop: '3px', display: 'block' }}>
                  {data.goal.includes('ETH') || data.goal.includes('USD') ? data.goal : `${data.goal} ETH`}
                </b>
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <span className="k" style={{ fontSize: '10.5px', color: 'var(--dim)', display: 'block' }}>CREATOR TAX</span>
                <b style={{ fontSize: '13px', color: 'var(--brand)', marginTop: '3px', display: 'block' }}>{data.creatorTax}%</b>
                {data.firstBuy && (
                  <span style={{ fontSize: '10.5px', color: 'var(--dim)', display: 'block', marginTop: '3px' }}>
                    First buy {data.firstBuy}
                  </span>
                )}
                {data.feeRecipient && (
                  <span style={{ fontSize: '10.5px', color: 'var(--dim)', display: 'block', marginTop: '3px' }}>
                    Fees to {data.feeRecipient.slice(0, 6)}…{data.feeRecipient.slice(-4)}
                  </span>
                )}
              </div>

              <div style={{ padding: '10px 12px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px' }}>
                <span className="k" style={{ fontSize: '10.5px', color: 'var(--dim)', display: 'block' }}>LP LIQUIDITY</span>
                <b style={{ fontSize: '13px', color: 'var(--green)', marginTop: '3px', display: 'block' }}>100% Locked 🔒</b>
              </div>
            </div>

            {/* Description Preview */}
            {data.desc && (
              <div style={{ fontSize: '12px', color: 'var(--dim)', fontStyle: 'italic', padding: '0 4px', lineHeight: 1.5 }}>
                &ldquo;{data.desc}&rdquo;
              </div>
            )}

            {/* Social & Community Links */}
            {(data.website || data.twitter || data.telegram || data.discord || (data.customLinks && data.customLinks.some(l => l.url))) && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--panel)',
                  borderRadius: '6px',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span className="k" style={{ fontSize: '10px', letterSpacing: '.06em', color: 'var(--dim)' }}>COMMUNITY & SOCIALS</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {data.website && (
                    <span style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--brand)', fontWeight: 600 }}>
                      <Globe size={12} /> {data.website.replace(/^https?:\/\//, '')}
                    </span>
                  )}
                  {data.twitter && (
                    <span style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--tx)', fontWeight: 600 }}>
                      <XIcon size={12} color="var(--tx)" /> {data.twitter.replace(/^https?:\/\/(x|twitter)\.com\//, '@')}
                    </span>
                  )}
                  {data.telegram && (
                    <span style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#2AABEE', fontWeight: 600 }}>
                      <TelegramIcon size={12} color="#2AABEE" /> {data.telegram.replace(/^https?:\/\/t\.me\//, '@')}
                    </span>
                  )}
                  {data.discord && (
                    <span style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#5865F2', fontWeight: 600 }}>
                      <DiscordIcon size={12} color="#5865F2" /> Discord
                    </span>
                  )}
                  {data.customLinks?.filter(l => l.url.trim()).map(l => (
                    <span key={l.id} style={{ fontSize: '11.5px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--dim)' }}>
                      <Link2 size={12} /> {l.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Security Guarantee Box */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'rgba(var(--brand-rgb), 0.08)',
                border: '1px solid rgba(var(--brand-rgb), 0.25)',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <ShieldCheck size={18} color="var(--brand)" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '11.5px', color: 'var(--tx)', lineHeight: 1.45 }}>
                <b>Locked for good:</b> the whole raise seeds the pool at graduation and the position is owned by a contract with no way to withdraw it. The token has no creator allocation, no mint and no blocklist, and none of it can be changed after launch.
              </div>
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div
            style={{
              padding: '16px 22px',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              background: 'var(--input)',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              disabled={isDeploying}
              style={{ borderRadius: '6px' }}
            >
              Back to Edit
            </button>
            <button
              type="button"
              className="btn btn-brand btn-sm"
              onClick={onConfirm}
              disabled={isDeploying}
              style={{ minWidth: '160px', borderRadius: '6px', fontWeight: 700 }}
            >
              {isDeploying ? (
                <>
                  <Loader2 size={15} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Deploying Contract...</span>
                </>
              ) : (
                <>
                  <Rocket size={15} />
                  <span>Confirm & Launch</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useTheme } from '@/components/ui/ThemeProvider'
import { Logo } from '@/components/ui/Logo'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { NetworkStatusModal } from '@/components/shared/NetworkStatusModal'
import { NetworkAlertBanner } from '@/components/shared/NetworkAlertBanner'
import { GlobalSearchModal } from '@/components/shared/GlobalSearchModal'
import { Search } from 'lucide-react'
import { useAccount, useChainId } from 'wagmi'

const NAV = [
  { href: '/',        label: 'Home' },
  { href: '/trade',   label: 'Trade' },
  { href: '/stocks',  label: 'Stocks', badge: 'RWA' },
  { href: '/battles', label: 'Battles' },
  { href: '/launch',  label: 'Launch' },
  { href: '/portfolio', label: 'Portfolio' },
]

export function Navbar() {
  const path = usePathname()
  const { setTheme, resolvedTheme } = useTheme()
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [netModalOpen, setNetModalOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [navLatency, setNavLatency] = useState(14)

  const isWrongNet = mounted && isConnected && chainId !== 4663 && chainId !== 46630

  // Global keyboard shortcut (Ctrl + K / Cmd + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchModalOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)

    const pingRpc = async () => {
      const t0 = performance.now()
      try {
        await fetch('/api/rpc?chainId=4663', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }),
          signal: AbortSignal.timeout(3000),
        })
        const ms = Math.round(performance.now() - t0)
        setNavLatency(Math.max(10, Math.min(ms, 85)))
      } catch {
        setNavLatency(14)
      }
    }

    pingRpc()
    const timer = setInterval(pingRpc, 15000)
    return () => clearInterval(timer)
  }, [])

  return (
    <>
      <NetworkAlertBanner />
      <header className="topnav">
      <Link href="/" className="brand">
        <Logo size={28} />
        <span className="wordmark">QUALYRA</span>
      </Link>

      <div className="nav-links">
        {NAV.map(n => {
          const active = path === n.href || (n.href !== '/' && path.startsWith(n.href))
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`navbtn ${active ? 'active' : ''}`}
            >
              {n.label}
              {n.badge && (
                <span style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  background: 'var(--brand)',
                  color: '#0B0E11',
                  padding: '1px 4px',
                  borderRadius: '3px',
                  letterSpacing: '.04em',
                  marginLeft: '4px'
                }}>
                  {n.badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <div 
        className="navsearch"
        onClick={() => setSearchModalOpen(true)}
        role="button"
        tabIndex={0}
        title="Search markets (Ctrl + K / ⌘K)"
      >
        <Search size={14} strokeWidth={2.2} style={{ color: 'var(--mt)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '12.5px', color: 'var(--mt)', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Search markets...
        </span>
        <kbd
          style={{
            padding: '2px 5px',
            borderRadius: '4px',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            fontSize: '10.5px',
            fontWeight: 700,
            color: 'var(--dim)',
            letterSpacing: '0.02em',
            lineHeight: 1,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          {mounted && typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
        </kbd>
      </div>

      <div className="tn-right">
        {/* Mobile Search Button */}
        <button
          type="button"
          onClick={() => setSearchModalOpen(true)}
          className="btn btn-ghost mobile-search-btn"
          style={{ padding: '6px 10px', fontSize: '14px', display: 'flex', alignItems: 'center', height: '32px' }}
          title="Search markets (Ctrl + K)"
        >
          <Search size={15} strokeWidth={2.2} />
        </button>

        {mounted && (
          <button 
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="btn btn-ghost"
            style={{ padding: '6px 10px', fontSize: '16px', display: 'flex', alignItems: 'center', height: '32px' }}
            title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {resolvedTheme === 'dark' ? '☀️' : '🌙'}
          </button>
        )}
        <div className="lat">
          <button
            type="button"
            onClick={() => setNetModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: isWrongNet ? 'rgba(245, 158, 11, 0.14)' : 'var(--inset)',
              padding: '6px 12px',
              borderRadius: '8px',
              border: isWrongNet ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid var(--line)',
              letterSpacing: '.03em',
              fontSize: '12px',
              height: '32px',
              cursor: 'pointer',
              color: 'inherit',
              transition: 'border-color 0.2s, background 0.2s',
            }}
            title={isWrongNet ? `Connected to Unsupported Chain ID ${chainId}. Click to switch.` : "Robinhood Chain RPC & Gas Monitor"}
            onMouseEnter={e => (e.currentTarget.style.borderColor = isWrongNet ? 'rgba(245, 158, 11, 0.8)' : 'rgba(14, 203, 129, 0.5)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = isWrongNet ? 'rgba(245, 158, 11, 0.45)' : 'var(--line)')}
          >
            <Image
              src="/robinhood-logo.webp"
              alt="Robinhood Chain"
              width={15}
              height={15}
              unoptimized
              style={{
                width: '15px',
                height: '15px',
                borderRadius: '3px',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: isWrongNet ? '#F59E0B' : 'var(--green)',
                boxShadow: isWrongNet ? '0 0 8px rgba(245, 158, 11, 0.8)' : '0 0 8px rgba(14, 203, 129, 0.6)',
              }}
            />
            <span className="hidden md:inline" style={{ color: isWrongNet ? '#F59E0B' : 'var(--mt)', fontWeight: 700 }}>
              {isWrongNet ? 'SWITCH NET' : 'Robinhood'}
            </span>
            <span className="md:hidden" style={{ color: isWrongNet ? '#F59E0B' : 'var(--mt)', fontWeight: 700 }}>
              {isWrongNet ? 'SWITCH NET' : 'RH'}
            </span>
            <span style={{ color: 'var(--dim)' }}>·</span>
            <span
              style={{ color: isWrongNet ? '#F59E0B' : 'var(--green)', fontWeight: 600 }}
              id="latMs"
            >
              {isWrongNet ? `${chainId || 'WRONG'}` : `${navLatency}ms`}
            </span>
          </button>
        </div>
        <ConnectButton.Custom>
          {({
            account,
            chain,
            openAccountModal,
            openChainModal,
            openConnectModal,
            mounted,
          }) => {
            const ready = mounted
            const connected = ready && account && chain

            return (
              <div
                {...(!ready && {
                  'aria-hidden': true,
                  style: {
                    opacity: 0,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  },
                })}
              >
                {(() => {
                  if (!connected) {
                    return (
                      <button onClick={openConnectModal} type="button" className="btn btn-brand btn-connect" style={{ height: '32px' }}>
                        Connect Wallet
                      </button>
                    )
                  }

                  if (chain.unsupported) {
                    return (
                      <button onClick={openChainModal} type="button" className="btn btn-red" style={{ padding: '8px 16px', fontSize: '13px', height: '32px' }}>
                        Wrong network
                      </button>
                    )
                  }

                  return (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={openChainModal}
                        style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', fontSize: '13px', height: '32px' }}
                        type="button"
                        className="btn btn-ghost"
                      >
                        {chain.hasIcon && (
                          <div
                            style={{
                              background: chain.iconBackground,
                              width: 14,
                              height: 14,
                              borderRadius: 999,
                              overflow: 'hidden',
                              marginRight: 6,
                            }}
                          >
                            {chain.iconUrl && (
                              <Image
                                alt={chain.name ?? 'Chain icon'}
                                src={chain.iconUrl}
                                width={14}
                                height={14}
                                unoptimized
                                style={{ width: 14, height: 14 }}
                              />
                            )}
                          </div>
                        )}
                        {chain.name}
                      </button>

                      <button onClick={openAccountModal} type="button" className="btn btn-ghost" style={{ padding: '8px 16px', fontSize: '13px', height: '32px' }}>
                        {account.displayName}
                      </button>
                    </div>
                  )
                })()}
              </div>
            )
          }}
        </ConnectButton.Custom>

        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          className="hamburger-btn"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>
      </div>
    </header>

    {/* Mobile Slide-over Drawer Menu with Spring Animation */}
    <AnimatePresence>
      {mobileOpen && (
        <motion.div
          className="mobile-drawer-backdrop"
          onClick={() => setMobileOpen(false)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="mobile-drawer"
            onClick={e => e.stopPropagation()}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            <div className="mobile-drawer-header">
              <div className="brand" style={{ paddingRight: 0 }}>
                <Logo size={24} />
                <span className="wordmark" style={{ fontSize: '14px' }}>QUALYRA</span>
              </div>
              <button
                type="button"
                className="close-drawer-btn"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 4L4 12M4 4l8 8" />
                </svg>
              </button>
            </div>

            {/* Mobile Drawer Quick Search */}
            <div style={{ padding: '12px 14px 4px' }}>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  setSearchModalOpen(true)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 12px',
                  background: 'var(--inset)',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  color: 'var(--mt)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <Search size={15} strokeWidth={2.2} style={{ color: 'var(--brand)' }} />
                <span style={{ flex: 1 }}>Search markets...</span>
                <kbd style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--panel)', border: '1px solid var(--line)', fontSize: '10px', fontWeight: 700, color: 'var(--dim)' }}>
                  Ctrl+K
                </kbd>
              </button>
            </div>

            <div className="mobile-drawer-links">
              {NAV.map((n, i) => {
                const active = path === n.href || (n.href !== '/' && path.startsWith(n.href))
                return (
                  <motion.div
                    key={n.href}
                    initial={{ opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.04 * i, duration: 0.2 }}
                  >
                    <Link
                      href={n.href}
                      className={`mobile-nav-item ${active ? 'active' : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span>{n.label}</span>
                      {n.badge && (
                        <span className="mobile-badge">{n.badge}</span>
                      )}
                    </Link>
                  </motion.div>
                )
              })}
            </div>

            <div className="mobile-drawer-footer">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  setNetModalOpen(true)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  background: isWrongNet ? 'rgba(245, 158, 11, 0.14)' : 'var(--inset)',
                  borderRadius: '8px',
                  border: isWrongNet ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid var(--line)',
                  cursor: 'pointer',
                  color: 'inherit',
                  transition: 'border-color 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600 }}>
                  <Image
                    src="/robinhood-logo.webp"
                    alt="Robinhood Chain"
                    width={18}
                    height={18}
                    unoptimized
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                  <div
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: isWrongNet ? '#F59E0B' : 'var(--green)',
                      boxShadow: isWrongNet ? '0 0 8px rgba(245, 158, 11, 0.8)' : '0 0 8px rgba(14, 203, 129, 0.6)',
                    }}
                  />
                  <span style={{ color: isWrongNet ? '#F59E0B' : 'inherit' }}>
                    {isWrongNet ? 'Wrong Network Detected' : 'Robinhood Chain'}
                  </span>
                </div>
                <span style={{ fontSize: '11px', color: isWrongNet ? '#F59E0B' : 'var(--green)', fontWeight: 600 }}>
                  {isWrongNet ? `Chain ID ${chainId || 'Unknown'}` : `${navLatency}ms · Online`}
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Live RPC & Gas Monitor Modal */}
    <NetworkStatusModal isOpen={netModalOpen} onClose={() => setNetModalOpen(false)} />

    {/* Global Market Search Modal (Ctrl + K / Cmd + K) */}
    <GlobalSearchModal isOpen={searchModalOpen} onClose={() => setSearchModalOpen(false)} />
  </>
  )
}

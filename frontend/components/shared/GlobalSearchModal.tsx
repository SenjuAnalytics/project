'use client'

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { 
  Search, 
  X, 
  ArrowRight, 
  Zap,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Project } from '@/lib/data'
import { useAllProjects } from '@/hooks/useAllProjects'
import { formatPrice, formatPercent, tickerColor } from '@/lib/utils'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'

interface GlobalSearchModalProps {
  isOpen: boolean
  onClose: () => void
}

type SearchCategory = 'all' | 'rwa' | 'bonding' | 'grad' | 'ai'

export function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<SearchCategory>('all')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const { projects } = useAllProjects()

  // Reset query and selected index when modal is opened
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen)
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen)
    if (isOpen) {
      setQuery('')
      setSelectedIdx(0)
    }
  }

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Reset selected index when query or category changes
  const [prevFilterKey, setPrevFilterKey] = useState('')
  const currentFilterKey = `${query}_${category}`
  if (currentFilterKey !== prevFilterKey) {
    setPrevFilterKey(currentFilterKey)
    setSelectedIdx(0)
  }

  // Filter projects based on query and category
  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase()
    return projects.filter(p => {
      // Category filter
      if (category === 'rwa' && !p.rwa) return false
      if (category === 'bonding' && (p.rwa || p.status === 'graduated')) return false
      if (category === 'grad' && p.status !== 'graduated') return false
      if (category === 'ai' && !(p.desc?.toLowerCase().includes('ai') || p.name.toLowerCase().includes('ai') || p.tick.toLowerCase().includes('ai'))) return false

      // Text query match
      if (!q) return true
      const matchTick = p.tick.toLowerCase().includes(q)
      const matchName = p.name.toLowerCase().includes(q)
      const matchId = p.id.toLowerCase().includes(q)
      const matchDesc = p.desc?.toLowerCase().includes(q) || false

      return matchTick || matchName || matchId || matchDesc
    })
  }, [projects, query, category])

  const handleSelectProject = useCallback((project: Project) => {
    router.push(`/trade?pair=${project.id}`)
    onClose()
  }, [router, onClose])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(prev => (filteredProjects.length > 0 ? (prev + 1) % filteredProjects.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(prev => (filteredProjects.length > 0 ? (prev - 1 + filteredProjects.length) % filteredProjects.length : 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredProjects.length > 0 && filteredProjects[selectedIdx]) {
          handleSelectProject(filteredProjects[selectedIdx])
        } else if (query.trim()) {
          // If no match, route to launch page
          router.push(`/launch?name=${encodeURIComponent(query.trim())}`)
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredProjects, selectedIdx, query, router, onClose, handleSelectProject])

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIdx] as HTMLElement | undefined
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
  }, [selectedIdx])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div 
        className="global-search-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          background: 'rgba(0, 0, 0, 0.48)',
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '8vh',
          paddingLeft: '16px',
          paddingRight: '16px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -10 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          onClick={e => e.stopPropagation()}
          className="global-search-dialog"
          style={{
            width: '100%',
            maxWidth: '640px',
            maxHeight: '84vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--modal-bg, #FFFFFF)',
            border: '1px solid var(--line2)',
            borderRadius: '16px',
            boxShadow: '0 24px 64px -12px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--line)',
            overflow: 'hidden',
          }}
        >
          {/* Top Search Input Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 18px',
              borderBottom: '1px solid var(--line)',
              background: 'var(--modal-bg, #FFFFFF)',
            }}
          >
            <Search size={18} strokeWidth={2.4} style={{ color: 'var(--brand)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search markets, tokens, stock tokens..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--tx)',
                letterSpacing: '-0.01em',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                style={{
                  background: 'var(--inset)',
                  border: '1px solid var(--line)',
                  borderRadius: '6px',
                  padding: '4px',
                  color: 'var(--dim)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s, border-color 0.15s',
                }}
                title="Clear search"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
            <kbd
              onClick={onClose}
              style={{
                padding: '3px 7px',
                borderRadius: '5px',
                background: 'var(--inset)',
                border: '1px solid var(--line)',
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--dim)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                letterSpacing: '0.04em',
              }}
            >
              ESC
            </kbd>
          </div>

          {/* Quick Category Filter Pills */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              background: 'var(--inset)',
              borderBottom: '1px solid var(--line)',
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--dim)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Filter:
            </span>
            {[
              { id: 'all', label: 'All Markets', count: projects.length },
              { id: 'rwa', label: 'RWA Equities', count: projects.filter(p => p.rwa).length },
              { id: 'bonding', label: 'Bonding Curve', count: projects.filter(p => !p.rwa && p.status !== 'graduated').length },
              { id: 'grad', label: 'Graduated', count: projects.filter(p => p.status === 'graduated').length },
              { id: 'ai', label: 'AI & Memes', count: projects.filter(p => p.desc?.toLowerCase().includes('ai') || p.name.toLowerCase().includes('ai') || p.tick.toLowerCase().includes('ai')).length },
            ].map(tab => {
              const active = category === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategory(tab.id as SearchCategory)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    fontSize: '11.5px',
                    fontWeight: active ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s ease',
                    background: active ? 'var(--brand)' : 'var(--panel2)',
                    color: active ? '#0B0E11' : 'var(--mt)',
                    border: active ? '1px solid var(--brand)' : '1px solid var(--line)',
                    boxShadow: active ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none',
                  }}
                >
                  <span>{tab.label}</span>
                  <span
                    style={{
                      fontSize: '10px',
                      opacity: active ? 0.85 : 0.6,
                      fontWeight: 700,
                    }}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Results List */}
          <div
            ref={listRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: '52vh',
              padding: '6px',
            }}
          >
            {filteredProjects.length === 0 ? (
              <div
                style={{
                  padding: '36px 20px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'var(--inset)',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--dim)',
                  }}
                >
                  <Search size={22} strokeWidth={1.8} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx)', marginBottom: '4px' }}>
                    No markets found
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--dim)', maxWidth: '300px' }}>
                    No tokens matching <strong style={{ color: 'var(--tx)' }}>&ldquo;{query}&rdquo;</strong> in this category.
                  </div>
                </div>
                {query.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      router.push(`/launch?name=${encodeURIComponent(query.trim())}`)
                      onClose()
                    }}
                    className="btn btn-brand"
                    style={{
                      fontSize: '12px',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '4px',
                    }}
                  >
                    <Zap size={13} strokeWidth={2.4} />
                    <span>Launch &ldquo;{query.trim().toUpperCase()}&rdquo; on Bonding Curve</span>
                  </button>
                )}
              </div>
            ) : (
              filteredProjects.map((p, idx) => {
                const isSelected = idx === selectedIdx
                const isPositive = p.chg >= 0

                return (
                  <div
                    key={p.id}
                    onClick={() => handleSelectProject(p)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'background 0.12s ease, border-color 0.12s ease, transform 0.12s ease',
                      background: isSelected ? 'var(--brand-dim)' : 'transparent',
                      border: isSelected ? '1px solid var(--brand)' : '1px solid transparent',
                      marginBottom: '2px',
                    }}
                  >
                    {/* Left: Avatar & Ticker / Name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ position: 'relative', display: 'inline-flex', width: '30px', height: '30px', flexShrink: 0 }}>
                        {p.rwa ? (
                          <RwaLogo ticker={p.tick} size={30} showChainBadge={false} />
                        ) : p.logoUrl && (p.logoUrl.startsWith('data:image') || p.logoUrl.startsWith('/') || p.logoUrl.startsWith('http')) ? (
                          <Image
                            src={p.logoUrl}
                            alt={p.tick}
                            unoptimized
                            width={30}
                            height={30}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                            style={{
                              width: '30px',
                              height: '30px',
                              borderRadius: '8px',
                              objectFit: 'cover',
                              border: '1px solid var(--line)',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <div
                            className="coin"
                            style={{
                              background: tickerColor(p.tick),
                              width: '30px',
                              height: '30px',
                              fontSize: '10px',
                              borderRadius: '8px',
                              flexShrink: 0,
                            }}
                          >
                            {p.tick.slice(0, 2)}
                          </div>
                        )}
                        <RobinhoodBadge size={12} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.02em' }}>
                            ${p.tick}
                          </span>
                          {p.rwa ? (
                            p.rwaType === 'stock' ? (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  color: '#60A5FA',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  letterSpacing: '0.02em',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                                  <polyline points="16 7 22 7 22 13" />
                                </svg>
                                STOCK
                              </span>
                            ) : p.rwaType === 'treasury' ? (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  color: '#34D399',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  letterSpacing: '0.02em',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                                </svg>
                                TREASURY
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '9px',
                                  fontWeight: 700,
                                  padding: '1px 5px',
                                  borderRadius: '4px',
                                  background: 'rgba(139, 92, 246, 0.14)',
                                  color: '#A78BFA',
                                  border: '1px solid rgba(139, 92, 246, 0.3)',
                                  letterSpacing: '0.02em',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                }}
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M2 10l10-7 10 7" />
                                </svg>
                                RWA
                              </span>
                            )
                          ) : p.status === 'graduated' ? (

                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(14, 203, 129, 0.12)',
                                color: '#0ECB81',
                                border: '1px solid rgba(14, 203, 129, 0.3)',
                              }}
                            >
                              GRAD
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '9px',
                                fontWeight: 700,
                                padding: '1px 5px',
                                borderRadius: '4px',
                                background: 'rgba(245, 158, 11, 0.12)',
                                color: '#F59E0B',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                              }}
                            >
                              BOND {p.progress || 0}%
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--dim)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: '1px',
                            maxWidth: '220px',
                          }}
                        >
                          {p.name}
                        </div>
                      </div>
                    </div>

                    {/* Right: Metrics & Arrow CTA */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.01em' }}>
                          ${formatPrice(p.price, !!p.rwa)}
                        </div>
                        <div
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            color: isPositive ? 'var(--green)' : 'var(--red)',
                            marginTop: '1px',
                          }}
                        >
                          {formatPercent(p.chg)}
                        </div>
                      </div>

                      <div
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isSelected ? 'var(--brand)' : 'var(--inset)',
                          color: isSelected ? '#0B0E11' : 'var(--dim)',
                          border: isSelected ? '1px solid var(--brand)' : '1px solid var(--line)',
                          transition: 'all 0.12s ease',
                        }}
                      >
                        <ArrowRight size={12} strokeWidth={2.6} />
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Bottom Footer Shortcuts Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '9px 16px',
              borderTop: '1px solid var(--line)',
              background: 'var(--inset)',
              fontSize: '11px',
              color: 'var(--dim)',
              fontWeight: 500,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <kbd style={{ padding: '2px 5px', borderRadius: '4px', background: 'var(--panel2)', border: '1px solid var(--line)', fontSize: '10px', fontWeight: 700 }}>↑↓</kbd>
                <span>Navigate</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <kbd style={{ padding: '2px 5px', borderRadius: '4px', background: 'var(--panel2)', border: '1px solid var(--line)', fontSize: '10px', fontWeight: 700 }}>↵</kbd>
                <span>Select</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <kbd style={{ padding: '2px 5px', borderRadius: '4px', background: 'var(--panel2)', border: '1px solid var(--line)', fontSize: '10px', fontWeight: 700 }}>ESC</kbd>
                <span>Close</span>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mt)' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--brand)' }} />
              <span>Robinhood Chain Markets</span>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

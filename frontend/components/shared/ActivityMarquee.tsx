'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ChevronUp, ChevronDown, Zap } from 'lucide-react'
import { useActivityFeed, type ActivityKind } from '@/lib/useActivityFeed'

const emptySubscribe = () => () => {}
function useIsMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

const BADGE: Record<ActivityKind, { label: string; icon: string }> = {
  launch: { label: 'LAUNCH', icon: '🚀' },
  buy: { label: 'BUY', icon: '🟢' },
  sell: { label: 'SELL', icon: '🔴' },
  graduate: { label: 'GRADUATED', icon: '🎓' },
  battle: { label: 'BATTLE', icon: '⚔️' },
  burn: { label: 'BURN', icon: '🔥' },
}

export function ActivityMarquee() {
  const { items } = useActivityFeed()
  const mounted = useIsMounted()
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem('qualyra_marquee_collapsed') === 'true'
    } catch {
      return false
    }
  })

  // No events yet means no bar, and the page gets its 32px back.
  const hasItems = items.length > 0

  useEffect(() => {
    document.documentElement.style.setProperty('--marquee-h', hasItems && !isCollapsed ? '32px' : '0px')
  }, [hasItems, isCollapsed])

  const toggleCollapse = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    try {
      localStorage.setItem('qualyra_marquee_collapsed', String(next))
    } catch {
      // Storage can be blocked. The bar still toggles for this visit.
    }
  }

  // Rendered twice so the CSS loop wraps without a gap.
  const loop = useMemo(() => [...items, ...items], [items])

  if (!mounted || !hasItems) return null

  if (isCollapsed) {
    return (
      <div className="activity-marquee-collapsed-bar" role="region" aria-label="Activity feed (collapsed)">
        <button
          type="button"
          onClick={toggleCollapse}
          className="activity-marquee-expand-trigger"
          title="Show the activity feed"
          aria-label="Show the activity feed"
        >
          <span className="marquee-pulse-dot" />
          <span className="expand-label">LIVE FEED</span>
          <ChevronDown size={11} strokeWidth={2} className="expand-chevron" />
        </button>
      </div>
    )
  }

  return (
    <div className="activity-marquee-container" role="region" aria-label="Activity feed">
      <div className="activity-marquee-beacon">
        <span className="marquee-pulse-dot" />
        <span className="beacon-title">LIVE FEED</span>
        <Zap size={11} className="beacon-zap-icon" />
      </div>

      <div className="activity-marquee-track-wrapper">
        <div className="activity-marquee-track">
          {loop.map((item, idx) => (
            <Link
              key={`${item.id}-${idx}`}
              href={item.link}
              className="marquee-chip"
              title={`${item.title} · ${new Date(item.timestamp * 1000).toLocaleString()}`}
            >
              <span className="chip-icon">{BADGE[item.kind].icon}</span>
              <span className={`chip-badge badge-${item.kind}`}>{BADGE[item.kind].label}</span>
              <span className="chip-title">{item.title}</span>
              {item.detail && <span className="chip-detail">{item.detail}</span>}
            </Link>
          ))}
        </div>
      </div>

      <div className="activity-marquee-controls">
        <button
          type="button"
          onClick={toggleCollapse}
          className="marquee-collapse-btn"
          title="Hide the activity feed"
          aria-label="Hide the activity feed"
        >
          <ChevronUp size={13} />
        </button>
      </div>
    </div>
  )
}

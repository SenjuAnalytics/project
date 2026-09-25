'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

// Robinhood mints and redeems stock tokens from Monday 02:00 to Saturday 02:00, Central European time.
// Outside that window nobody can create or redeem them, so the on-chain price can drift from the share.
const ISSUER_TIME_ZONE = 'Europe/Berlin'

const weekdayAndHour = new Intl.DateTimeFormat('en-US', {
  timeZone: ISSUER_TIME_ZONE,
  weekday: 'short',
  hour: 'numeric',
  hourCycle: 'h23',
})

/** Checks the weekly schedule only. */
function isOutsideWindow(date: Date): boolean {
  const parts = weekdayAndHour.formatToParts(date)
  const day = parts.find(p => p.type === 'weekday')?.value
  const hour = Number(parts.find(p => p.type === 'hour')?.value)
  if (day === 'Sun') return true
  if (day === 'Mon') return hour < 2
  if (day === 'Sat') return hour >= 2
  return false
}

export function StockHoursBar() {
  // Set after mount. The page is prerendered, so a status computed during render would be the build's.
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    const update = () => setClosed(isOutsideWindow(new Date()))
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className="panel"
      style={{
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: '28px',
        flexWrap: 'wrap',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Clock size={14} style={{ color: 'var(--dim)' }} />
        <span style={{ fontSize: '13px', fontWeight: 600 }}>Mint &amp; redeem</span>
        {closed && (
          <span style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 600 }}>CLOSED</span>
        )}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ft)' }}>
        Window: <b style={{ color: 'var(--mt)' }}>Mon 02:00 – Sat 02:00 CET/CEST</b>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ft)' }}>
        Outside it, token prices on-chain can drift away from the share price.
      </div>
    </div>
  )
}

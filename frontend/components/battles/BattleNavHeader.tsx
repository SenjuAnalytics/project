'use client'

import { type BattleTabType } from '@/hooks/battles/useBattleState'

interface BattleNavHeaderProps {
  battleTab: BattleTabType
  setBattleTab: (tab: BattleTabType) => void
  hasUnclaimed?: boolean
}

export function BattleNavHeader({ battleTab, setBattleTab, hasUnclaimed }: BattleNavHeaderProps) {
  return (
    <div className="battle-nav-bar">
      <div className="battle-tabs-track">
        <button
          type="button"
          onClick={() => setBattleTab('live')}
          className={`battle-tab-pill ${battleTab === 'live' ? 'active' : ''}`}
        >
          <span className="tab-icon">🔥</span>
          <span>Token Duels</span>
          <span className="tab-badge badge-live">LIVE</span>
        </button>

        <button
          type="button"
          onClick={() => setBattleTab('trader')}
          className={`battle-tab-pill ${battleTab === 'trader' ? 'active' : ''}`}
        >
          <span className="tab-icon">🏆</span>
          <span>Trader League</span>
          {hasUnclaimed ? (
            <span className="tab-badge" style={{ background: '#22c55e', color: '#fff' }}>🎁 CLAIM</span>
          ) : (
            <span className="tab-badge" style={{ background: 'rgba(var(--brand-rgb), 0.18)', color: 'var(--brand)' }}>WEEKLY POOL</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setBattleTab('results')}
          className={`battle-tab-pill ${battleTab === 'results' ? 'active' : ''}`}
        >
          <span className="tab-icon">🏛️</span>
          <span>Results &amp; Burns</span>
          <span className="tab-badge badge-hof">HISTORY</span>
        </button>
      </div>

      <div className="battle-chain-badge">
        <span className="chain-shield">🛡️</span>
        <span>Verified Onchain on</span>
        <span className="chain-name">Robinhood Chain</span>
      </div>
    </div>
  )
}

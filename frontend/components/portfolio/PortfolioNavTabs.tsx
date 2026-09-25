'use client'

export type PortfolioTabType = 'positions' | 'history' | 'battles' | 'created'

interface PortfolioNavTabsProps {
  activeTab: PortfolioTabType
  setActiveTab: (tab: PortfolioTabType) => void
  positionCount: number
  fillsCount: number
  createdCount: number
}

export function PortfolioNavTabs({
  activeTab,
  setActiveTab,
  positionCount,
  fillsCount,
  createdCount,
}: PortfolioNavTabsProps) {
  return (
    <div className="markets-toolbar">
      <div className="markets-toolbar-left">
        <div className="markets-title-group">
          <h3 className="markets-title">Portfolio Assets</h3>
          <span className="markets-badge">
            <span className="markets-dot" />
            {positionCount} Positions
          </span>
        </div>

        <div className="markets-divider" />

        <div className="markets-tabs">
          <button
            type="button"
            className={`markets-tab-btn ${activeTab === 'positions' ? 'active' : ''}`}
            onClick={() => setActiveTab('positions')}
          >
            Holdings ({positionCount})
          </button>
          <button
            type="button"
            className={`markets-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            Recent Fills ({fillsCount})
          </button>
          <button
            type="button"
            className={`markets-tab-btn ${activeTab === 'battles' ? 'active' : ''}`}
            onClick={() => setActiveTab('battles')}
          >
            Competitions &amp; Battles
          </button>
          <button
            type="button"
            className={`markets-tab-btn ${activeTab === 'created' ? 'active' : ''}`}
            onClick={() => setActiveTab('created')}
          >
            🚀 Launched Tokens ({createdCount})
          </button>
        </div>
      </div>
    </div>
  )
}

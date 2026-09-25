'use client'

import { useRouter } from 'next/navigation'
import { PortfolioHeroBanner } from '@/components/portfolio/PortfolioHeroBanner'
import { PortfolioNavTabs } from '@/components/portfolio/PortfolioNavTabs'
import { PositionsTab } from '@/components/portfolio/tabs/PositionsTab'
import { TradeHistoryTab } from '@/components/portfolio/tabs/TradeHistoryTab'
import { BattleRewardsTab } from '@/components/portfolio/tabs/BattleRewardsTab'
import { CreatedTokensTab } from '@/components/portfolio/tabs/CreatedTokensTab'
import { SharePnlModal } from '@/components/trade/SharePnlModal'
import { usePortfolioData } from '@/hooks/portfolio/usePortfolioData'

export default function PortfolioPage() {
  const router = useRouter()
  const {
    address,
    isConnected,
    activeTab,
    setActiveTab,
    positions,
    fills,
    projects,
    usdgNumber,
    currentWeekNumber,
    liveEthPrice,
    ethNumber,
    ethValueUsd,
    posValueUsd,
    totalNetWorth,
    creatorProjects,
    creatorFeeMap,
    totalClaimableFeesUsd,
    claimingToken,
    handleClaimFees,
  } = usePortfolioData()

  return (
    <div className="wrap" style={{ padding: '20px 16px' }}>
      <PortfolioHeroBanner
        isConnected={isConnected}
        address={address}
        totalNetWorth={totalNetWorth}
        usdgNumber={usdgNumber}
        ethNumber={ethNumber}
        ethValueUsd={ethValueUsd}
        posValueUsd={posValueUsd}
        positionCount={positions.length}
        totalClaimableFeesUsd={totalClaimableFeesUsd}
        creatorProjectsCount={creatorProjects.length}
      />

      <div className="sec">
        <div className="panel">
          <PortfolioNavTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            positionCount={positions.length}
            fillsCount={fills.length}
            createdCount={creatorProjects.length}
          />

          {activeTab === 'positions' && (
            <PositionsTab
              positions={positions}
              projects={projects}
              liveEthPrice={liveEthPrice}
              onSelectPair={(id) => router.push(`/trade?pair=${id}`)}
            />
          )}

          {activeTab === 'history' && (
            <TradeHistoryTab
              fills={fills}
              isConnected={isConnected}
              onSelectPair={(id) => router.push(`/trade?pair=${id}`)}
            />
          )}

          {activeTab === 'battles' && (
            <BattleRewardsTab creatorProjects={creatorProjects} currentWeekNumber={currentWeekNumber} />
          )}

          {activeTab === 'created' && (
            <CreatedTokensTab
              creatorProjects={creatorProjects}
              creatorFeeMap={creatorFeeMap}
              liveEthPrice={liveEthPrice}
              claimingToken={claimingToken}
              address={address}
              onClaimFees={handleClaimFees}
            />
          )}
        </div>
      </div>

      <SharePnlModal />
    </div>
  )
}

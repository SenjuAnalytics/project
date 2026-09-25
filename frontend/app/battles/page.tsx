'use client'

import { useRouter } from 'next/navigation'
import { useBattleState } from '@/hooks/battles/useBattleState'
import { BattleNavHeader } from '@/components/battles/BattleNavHeader'
import { TournamentHeroBanner } from '@/components/battles/TournamentHeroBanner'
import { CompetitionPotsCards } from '@/components/battles/CompetitionPotsCards'
import { PairAssetFilter } from '@/components/battles/PairAssetFilter'
import { LiveDuelCard } from '@/components/battles/LiveDuelCard'
import { LeaderboardSection } from '@/components/battles/LeaderboardSection'
import { BattleResultsSection } from '@/components/battles/BattleResultsSection'
import { TraderLeagueSection } from '@/components/battles/TraderLeagueSection'
import { formatCryptoAmount } from '@/lib/utils'

export default function BattlesPage() {
  const router = useRouter()
  const {
    battleTab,
    setBattleTab,
    assetFilter,
    setAssetFilter,
    cd,
    duels,
    filteredDuels,
    openDuels,
    openPotUsd,
    battlePoints,
    competition,
  } = useBattleState()

  // Open pots per pair asset, e.g. "0.12 ETH, 40 USDG".
  const potByAsset = new Map<string, number>()
  for (const b of competition.battles) {
    if (b.finalized || b.status === 'upcoming' || b.pot <= 0) continue
    potByAsset.set(b.assetSymbol, (potByAsset.get(b.assetSymbol) ?? 0) + b.pot)
  }
  const nativeBreakdown = [...potByAsset].map(([symbol, amount]) => formatCryptoAmount(amount, symbol, 7)).join(', ')

  return (
    <div className="wrap" style={{ padding: '24px 16px', maxWidth: '1240px' }}>
      <BattleNavHeader
        battleTab={battleTab}
        setBattleTab={setBattleTab}
        hasUnclaimed={competition.userClaimable.length > 0}
      />

      {battleTab === 'trader' && <TraderLeagueSection competition={competition} cd={cd} />}

      {battleTab === 'live' && (
        <>
          <TournamentHeroBanner
            potUsd={openPotUsd}
            nativeBreakdown={nativeBreakdown || undefined}
            openCount={openDuels.length}
            userBattleCount={openDuels.filter(d => d.isUserBattle).length}
            cd={cd}
          />

          <div className="sec">
            <CompetitionPotsCards />
          </div>

          <div className="sec">
            <div style={{ marginBottom: '32px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Token Duels</h3>
                  <p className="dim" style={{ fontSize: '12.5px', margin: '3px 0 0' }}>
                    Booked on-chain ahead of time and run from 00:00 to 24:00 UTC. The winner&apos;s pot buys back
                    and burns its token.
                  </p>
                </div>

                <PairAssetFilter value={assetFilter} onChange={setAssetFilter} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredDuels.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--panel)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚔️</div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx)', marginBottom: '4px' }}>
                      {duels.length === 0 ? 'No battles scheduled yet' : `No ${assetFilter} battles`}
                    </div>
                    <div style={{ fontSize: '12.5px', color: 'var(--dim)', maxWidth: '520px', margin: '0 auto', lineHeight: 1.6 }}>
                      {duels.length === 0
                        ? 'Battles pair graduated tokens that qualified, on the same pair asset. Each one is written on-chain before it starts, so it shows up here as soon as it is scheduled.'
                        : 'Pick another pair asset or show all duels.'}
                    </div>
                  </div>
                ) : (
                  filteredDuels.map(m => (
                    <LiveDuelCard
                      key={m.id}
                      m={m}
                      onFinalize={competition.finalizeBattle}
                      isPendingFinalize={competition.isPendingTx}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <LeaderboardSection
            rows={battlePoints}
            week={competition.currentWeekNum}
            onSelectToken={id => router.push(`/trade?pair=${id}`)}
          />
        </>
      )}

      {battleTab === 'results' && <BattleResultsSection />}
    </div>
  )
}

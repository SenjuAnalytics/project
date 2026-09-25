'use client'

// Battle pots and the Trader League pool, side by side. Both come from useCompetitionPots, which reads
// QualyraCompetitionVault directly.

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useCompetitionPots, type ActiveBattlePot, type PotAmount } from '@/hooks/useCompetitionPots'
import { usePrizeShares } from '@/hooks/useCompetition'
import { formatCryptoAmount } from '@/lib/formatters'
import { SubCentUsd } from '@/components/shared/SubCentUsd'

const row: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '9px 12px',
  borderRadius: '8px',
  background: 'var(--inset)',
  border: '1px solid var(--line)',
}

const label: CSSProperties = {
  fontSize: '10.5px',
  fontWeight: 700,
  color: 'var(--dim)',
  letterSpacing: '.08em',
  textTransform: 'uppercase',
}

const note: CSSProperties = { fontSize: '11.5px', color: 'var(--dim)', lineHeight: 1.55, margin: 0 }

const pill = (color: string, background: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '2px 8px',
  borderRadius: '999px',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '.06em',
  color,
  background,
})

function Amounts({ pools }: { pools: PotAmount[] }) {
  if (pools.length === 0) return <span style={{ color: 'var(--dim)' }}>—</span>
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '2px 10px' }}>
      {pools.map(p => (
        <span key={p.asset} className="mono" style={{ whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--tx)' }}>
          {formatCryptoAmount(p.amount, p.symbol)}
        </span>
      ))}
    </span>
  )
}

function Usd({ amount }: { amount: number }) {
  return (
    <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
      <SubCentUsd amount={amount} prefix="$" />
    </div>
  )
}

function Card({ icon, title, totalUsd, badge, children }: {
  icon: string
  title: string
  totalUsd: number
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span aria-hidden="true">{icon}</span>
          <h3 style={{ fontSize: '14px', fontWeight: 800, margin: 0, color: 'var(--tx)' }}>{title}</h3>
          {badge}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--brand)' }}>
            <SubCentUsd amount={totalUsd} prefix="$" />
          </div>
          <div style={label}>Total value</div>
        </div>
      </header>
      {children}
    </section>
  )
}

/** Counts down to `endTime`; shows `done` instead once it has passed, when given. */
function Countdown({ endTime, done }: { endTime: number; done?: string }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])
  const left = Math.max(0, endTime - now)
  if (left === 0 && done) return <>{done}</>
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <span className="mono">
      {pad(Math.floor(left / 3600))}:{pad(Math.floor((left % 3600) / 60))}:{pad(left % 60)}
    </span>
  )
}

/** Says how much of a balance is still in the pool hook. Renders nothing when all of it has been swept. */
function UnsweptNote({ usd, where }: { usd: number; where: string }) {
  if (usd <= 0) return null
  return (
    <p style={note}>
      Includes <SubCentUsd amount={usd} prefix="$" /> the pool hook still holds. {where}
    </p>
  )
}

/** When an open battle's pot moves next: its start, its end, or its settlement. */
function OpenBattleTiming({ pot }: { pot: ActiveBattlePot }) {
  if (pot.phase === 'booked') return <>Starts in <Countdown endTime={pot.startTime} /></>
  if (pot.phase === 'live') return <>Ends in <Countdown endTime={pot.endTime} /></>
  if (pot.settlesAt === 0) return <>Over, result being posted</>
  return <>Settles in <Countdown endTime={pot.settlesAt} done="settling now" /></>
}

/** Pots of booked, live and settling battles, plus the battle share each token holds until its battle is booked. */
export function BattlePotCard() {
  const {
    deployed,
    isLoading,
    activeBattlePots,
    activeTotalUsd,
    activeUnsweptUsd,
    pendingBattlePots,
    pendingTotalUsd,
    pendingUnsweptUsd,
    pendingLoading,
    pendingSupported,
  } = useCompetitionPots()

  if (!deployed) {
    return (
      <Card icon="🥊" title="Battle Pots" totalUsd={0}>
        <p style={note}>The competition vault isn&apos;t deployed on this network.</p>
      </Card>
    )
  }

  return (
    <Card
      icon="🥊"
      title="Battle Pots"
      totalUsd={activeTotalUsd + pendingTotalUsd}
      badge={
        activeBattlePots.some(b => b.live) ? (
          <span style={pill('var(--red)', 'var(--red-dim)')}>
            <span className="livedot" style={{ margin: 0 }} /> LIVE
          </span>
        ) : null
      }
    >
      {isLoading && <p style={note}>Reading the vault…</p>}

      {activeBattlePots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={label}>Booked, live and settling</span>
          {activeBattlePots.map(b => (
            <div key={b.battleId} style={row}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>
                  ${b.tickA} <span style={{ color: 'var(--dim)', fontWeight: 500 }}>vs</span> ${b.tickB}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
                  <OpenBattleTiming pot={b} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>
                  {formatCryptoAmount(b.amount, b.assetSymbol)}
                </div>
                <Usd amount={b.usd} />
              </div>
            </div>
          ))}
          <UnsweptNote usd={activeUnsweptUsd} where="Finalizing the battle sweeps it into the pot." />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={label}>Held for upcoming battles</span>
          {pendingSupported !== false && (
            <span style={{ fontSize: '11px', color: 'var(--dim)' }}>
              <SubCentUsd amount={pendingTotalUsd} prefix="$" />
            </span>
          )}
        </div>

        {pendingSupported === false ? (
          <p style={note}>
            The vault on this network predates per-token battle pots. Balances show up here once the current
            contracts are deployed.
          </p>
        ) : pendingLoading ? (
          <p style={note}>Loading…</p>
        ) : pendingBattlePots.length === 0 ? (
          <p style={note}>Nothing held yet.</p>
        ) : (
          pendingBattlePots.map(t => (
            <div key={t.token} style={row}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {t.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.logoUrl} alt="" width={22} height={22} style={{ borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--line)', flexShrink: 0 }} />
                )}
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>${t.tick}</span>
              </div>
              <div style={{ textAlign: 'right', fontSize: '13px' }}>
                <Amounts pools={t.amounts} />
                <Usd amount={t.totalUsd} />
              </div>
            </div>
          ))
        )}

        <UnsweptNote usd={pendingUnsweptUsd} where="The daily sweep moves it here." />

        <p style={note}>
          Until its battle is booked, 70% of a token&apos;s competition share waits here and seeds the pot. It goes
          to the treasury instead if the token is disqualified before its battle is booked, or hasn&apos;t started
          qualifying within 30 days of launch.
        </p>
        <p style={note}>
          Battles run from 00:00 to 24:00 UTC. Once the result clears its 24-hour challenge window the battle settles
          on its own, and the first buyback tranche runs in the same transaction.
        </p>
      </div>
    </Card>
  )
}

/** Trader League prize pool: the week in progress, weeks already funded, or the bootstrap pool. */
export function LeaguePotCard() {
  const {
    deployed,
    isLoading,
    currentLeaguePot,
    upcomingLeaguePots,
    bootstrapPot,
    leagueStarted,
    leagueTotalUsd,
    leagueUnsweptUsd,
  } = useCompetitionPots()
  const prizeShares = usePrizeShares()

  if (!deployed) {
    return (
      <Card icon="🏆" title="Trader League Pool" totalUsd={0}>
        <p style={note}>The competition vault isn&apos;t deployed on this network.</p>
      </Card>
    )
  }

  const split = prizeShares.join(' / ')
  const isEmpty = !bootstrapPot && !(leagueStarted && currentLeaguePot?.pools.length) && upcomingLeaguePots.length === 0

  return (
    <Card icon="🏆" title="Trader League Pool" totalUsd={leagueTotalUsd}>
      {isLoading && <p style={note}>Reading the vault…</p>}

      {bootstrapPot && (
        <div style={row}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>🌱 Bootstrap pool</div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>
              Spread over the first four league weeks
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '13px' }}>
            <Amounts pools={bootstrapPot.pools} />
            <Usd amount={bootstrapPot.totalUsd} />
          </div>
        </div>
      )}

      {leagueStarted && currentLeaguePot && (
        <div style={row}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx)' }}>Week #{currentLeaguePot.week}</span>
            <span style={pill('var(--green)', 'var(--green-dim)')}>THIS WEEK</span>
          </div>
          <div style={{ textAlign: 'right', fontSize: '13px' }}>
            <Amounts pools={currentLeaguePot.pools} />
            <Usd amount={currentLeaguePot.totalUsd} />
          </div>
        </div>
      )}

      {upcomingLeaguePots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={label}>Already funded</span>
          {upcomingLeaguePots.map(w => (
            <div key={w.week} style={row}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx)' }}>Week #{w.week}</span>
              <div style={{ textAlign: 'right', fontSize: '13px' }}>
                <Amounts pools={w.pools} />
                <Usd amount={w.totalUsd} />
              </div>
            </div>
          ))}
        </div>
      )}

      {isEmpty && !isLoading && (
        <p style={note}>Nothing in the pool yet. It fills from trading fees as the week goes.</p>
      )}

      <UnsweptNote
        usd={leagueUnsweptUsd}
        where={leagueStarted ? "It joins this week's pool when swept." : 'It joins the bootstrap pool when swept.'}
      />

      <p style={note}>
        30% of every token&apos;s competition share outside its battle. The top {prizeShares.length} wallets by
        qualified volume split each asset {split}%.
      </p>
    </Card>
  )
}

export function CompetitionPotsCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
      <BattlePotCard />
      <LeaguePotCard />
    </div>
  )
}

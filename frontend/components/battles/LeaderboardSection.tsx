'use client'

import Link from 'next/link'
import { BattleTokenLogo } from '@/components/battles/BattleTokenLogo'
import { type BattlePointsRow } from '@/hooks/battles/useBattleState'

interface LeaderboardSectionProps {
  rows: BattlePointsRow[]
  week: number
  onSelectToken: (id: string) => void
}

const RULES = [
  {
    title: 'Points',
    body: 'Win +3, draw +1, loss 0. Points rank tokens for the week and help pick opponents. They carry no prize money.',
  },
  {
    title: 'Who can battle',
    body: "A graduated token qualifies once its market cap has held $100,000 or more for 24 hours. Market cap uses the pool's 30-minute average price, converted to USD through Chainlink. From the moment it first reaches $100,000 until its battle ends, a token that stays below it for 30 minutes is disqualified for good, and a short bounce back above doesn't reset that clock. Each token gets one battle, against a token on the same pair asset.",
  },
  {
    title: 'Scoring',
    body: "70% share of qualified volume plus 30% share of unique buyers inside the 24 hours. Creator wallets don't count, and a gap under one point is a draw. A token disqualified before or during its battle loses it.",
  },
  {
    title: 'Settlement',
    body: "Battles run from 00:00 to 24:00 UTC. The result is posted on-chain afterwards and can be challenged for 24 hours, then the battle settles on its own: the pot buys back the winner in four tranches 30 minutes apart, the first one right away, and the tokens are burned. On a draw or a void, each token's own contribution buys back and burns that token.",
  },
]

export function LeaderboardSection({ rows, week, onSelectToken }: LeaderboardSectionProps) {
  return (
    <>
      <div className="sec">
        <div className="panel">
          <div className="markets-toolbar">
            <div className="markets-toolbar-left">
              <div className="markets-title-group">
                <h3 className="markets-title">Battle Points</h3>
                <span className="markets-badge">
                  <span className="markets-dot" />
                  {week > 0 ? `Week #${week}` : 'This week'}
                </span>
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', fontSize: '12.5px', color: 'var(--dim)' }}>
              No battle has been finalized this week yet.
            </div>
          ) : (
            <div className="tbl-scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>Rank</th>
                    <th>Token</th>
                    <th>Played</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>Points</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const p = row.token
                    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`
                    return (
                      <tr key={p.id} className="row" onClick={() => onSelectToken(p.id)}>
                        <td>
                          <span style={{ fontSize: idx < 3 ? '14px' : '12.5px', fontWeight: 700, color: idx < 3 ? 'var(--brand)' : 'var(--dim)' }}>
                            {medal}
                          </span>
                        </td>
                        <td>
                          <div className="pair">
                            <BattleTokenLogo p={p} size={32} />
                            <div>
                              <div className="pn" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <span>{p.tick}</span>
                                {p.quoteAsset && (
                                  <span style={{ color: 'var(--dim)', fontSize: '11px' }}>/{p.quoteAsset}</span>
                                )}
                              </div>
                              <div className="ps">{p.name}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: '13px' }}>{row.played}</td>
                        <td className="up" style={{ fontSize: '13px', fontWeight: 600 }}>{row.wins}</td>
                        <td style={{ fontSize: '13px', color: 'var(--mt)' }}>{row.draws}</td>
                        <td className="dn" style={{ fontSize: '13px', fontWeight: 600 }}>{row.losses}</td>
                        <td>
                          <b style={{ fontSize: '14px', color: 'var(--brand)' }}>{row.points}</b>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <Link href={`/trade?pair=${p.id}`} className="btn btn-brand btn-sm">
                            Trade
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="sec">
        <div className="sec-hd"><h3>How Battles Are Decided</h3></div>
        <div className="panel rules">
          {RULES.map((rule, i) => (
            <div key={rule.title} className="rule">
              <span className="n">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <b>{rule.title}</b>
                <p>{rule.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

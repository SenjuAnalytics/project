'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { currentWeekEnd, weekOf } from '@/lib/competitionTime'
import { type Project } from '@/lib/data'
import { useCompetition, type BattleStatus, type BattleTokenInfo } from '@/hooks/useCompetition'
import { useAllProjects } from '@/hooks/useAllProjects'
import { formatCryptoAmount } from '@/lib/utils'

export type BattleTabType = 'live' | 'trader' | 'results'

/** One scheduled battle, joined with the market data of both tokens. */
export type DuelView = {
  id: number
  title: string
  a: Project
  b: Project
  /** Pot in USD. */
  pot: number
  /** Pot in the pair asset, formatted. */
  nativePot?: string
  assetSymbol: string
  startTime: number
  status: BattleStatus
  /** When the posted result can be finalized, or zero while none is posted. */
  settlesAt: number
  canFinalize: boolean
  /** The keeper is late settling it, so the card offers the permissionless call. */
  settleOverdue: boolean
  outcome: number
  finalized: boolean
  winnerSide: 'A' | 'B' | null
  /** One of the two tokens was launched by the connected wallet. */
  isUserBattle: boolean
}

export type BattlePointsRow = {
  token: Project
  played: number
  wins: number
  draws: number
  losses: number
  points: number
}

/** Mirrors QualyraCompetitionVault.Outcome. */
const DRAW = 3
const VOID = 6

export function useBattleState() {
  const competition = useCompetition()
  const { projects } = useAllProjects()
  const { address } = useAccount()

  const [battleTab, setBattleTab] = useState<BattleTabType>('live')
  // 'all' or a pair asset symbol. Tokens only ever battle on the same pair asset.
  const [assetFilter, setAssetFilter] = useState('all')

  // Countdown to the vault's week end. Battle Points and the Trader League both reset there.
  const [cd, setCd] = useState({ d: '00', h: '00', m: '00', s: '00' })

  useEffect(() => {
    const updateCd = () => {
      const now = Math.floor(Date.now() / 1000)
      const endsAt = competition.currentWeek?.endsAt || currentWeekEnd(now)
      const diff = Math.max(0, endsAt - now)
      const d = Math.floor(diff / 86400)
      const h = Math.floor((diff % 86400) / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setCd({
        d: String(d).padStart(2, '0'),
        h: String(h).padStart(2, '0'),
        m: String(m).padStart(2, '0'),
        s: String(s).padStart(2, '0'),
      })
    }

    updateCd()
    const t = setInterval(updateCd, 1000)
    return () => clearInterval(t)
  }, [competition.currentWeek?.endsAt])

  const duels: DuelView[] = useMemo(() => {
    const wallet = address?.toLowerCase()
    const byAddress = new Map<string, Project>()
    projects.forEach(p => {
      if (p.address) byAddress.set(p.address.toLowerCase(), p)
    })

    // A token the markets list hasn't loaded yet still gets a card, with what the vault knows about it.
    const fallback = (token: BattleTokenInfo): Project => ({
      id: token.id || token.address.toLowerCase(),
      name: token.name,
      tick: token.tick,
      desc: '',
      creator: '',
      price: token.price || 0,
      mcap: 0,
      raised: 0,
      goal: 1,
      progress: 100,
      holders: 0,
      vol24: 0,
      raw: 0,
      ret: '',
      chg: 0,
      seed: 0,
      status: 'graduated',
      battle: 0,
      rwa: !!token.rwa,
      creatorTax: 0,
      entry: 0,
      hi: token.price || 0,
      lo: token.price || 0,
      logoUrl: token.logoUrl,
      address: token.address,
    })

    return competition.battles.map(b => {
      const a = byAddress.get(b.tokenA.address.toLowerCase()) ?? fallback(b.tokenA)
      const bb = byAddress.get(b.tokenB.address.toLowerCase()) ?? fallback(b.tokenB)
      const mine = (p: Project) => !!wallet && p.creatorAddress?.toLowerCase() === wallet
      return {
        id: b.id,
        title: `BATTLE #${b.id} · ${b.tokenA.tick} VS ${b.tokenB.tick}`,
        a,
        b: bb,
        pot: b.potUsd || 0,
        nativePot: b.pot > 0 ? formatCryptoAmount(b.pot, b.assetSymbol, 7) : undefined,
        assetSymbol: b.assetSymbol,
        startTime: b.startTime,
        status: b.status,
        settlesAt: b.settlesAt,
        canFinalize: b.canFinalize,
        settleOverdue: b.settleOverdue,
        outcome: b.outcome,
        finalized: b.finalized,
        winnerSide: b.winnerSide,
        isUserBattle: mine(a) || mine(bb),
      }
    })
  }, [competition.battles, projects, address])

  const filteredDuels = useMemo(
    () => (assetFilter === 'all' ? duels : duels.filter(d => d.assetSymbol === assetFilter)),
    [duels, assetFilter],
  )

  // Pots still in play: running, waiting for a result, or inside the challenge window.
  const openDuels = useMemo(() => duels.filter(d => !d.finalized && d.status !== 'upcoming'), [duels])
  const openPotUsd = openDuels.reduce((sum, d) => sum + d.pot, 0)

  // Win 3, draw 1, loss 0, from finalized results only. A battle counts toward the week it started in.
  const battlePoints = useMemo(() => {
    const week = competition.currentWeekNum
    const rows = new Map<string, BattlePointsRow>()
    const rowFor = (token: Project) => {
      const key = token.id.toLowerCase()
      let row = rows.get(key)
      if (!row) {
        row = { token, played: 0, wins: 0, draws: 0, losses: 0, points: 0 }
        rows.set(key, row)
      }
      return row
    }

    for (const d of duels) {
      if (!d.finalized || d.outcome === VOID || weekOf(d.startTime) !== week) continue
      const a = rowFor(d.a)
      const b = rowFor(d.b)
      a.played++
      b.played++
      if (d.outcome === DRAW) {
        a.draws++
        b.draws++
        a.points += 1
        b.points += 1
      } else if (d.winnerSide === 'A') {
        a.wins++
        b.losses++
        a.points += 3
      } else if (d.winnerSide === 'B') {
        b.wins++
        a.losses++
        b.points += 3
      }
    }

    return [...rows.values()].sort((x, y) => y.points - x.points || y.wins - x.wins || x.played - y.played)
  }, [duels, competition.currentWeekNum])

  return {
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
  }
}

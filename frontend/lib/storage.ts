'use client'

import { INITIAL_PROJECTS, Project, RWA_PROJECTS } from './data'
import { cleanPrice } from './formatters'

const STORAGE_KEY_PROJECTS = 'qualyra_custom_projects'
const STORAGE_KEY_POSITIONS = 'qualyra_user_positions'
const STORAGE_KEY_FILLS = 'qualyra_trade_fills'

export interface UserPosition {
  id: string
  tick: string
  name: string
  balance: number
  entry: number
  price: number
  quoteAsset?: string
  logoUrl?: string
  logoFit?: 'cover' | 'contain'
  logoShape?: 'squircle' | 'circle'
  logoBg?: 'transparent' | 'white' | 'dark'
  logoScale?: number
  isCreator?: boolean
  rwa?: boolean
}

export interface TradeFill {
  id: string
  time: string
  timestamp: number
  pair: string
  side: 'BUY' | 'SELL'
  price: number
  amount: number
  total: number
  fee: number
  tx: string
  tick?: string
}

export const INITIAL_USER_POSITIONS: UserPosition[] = []

export const INITIAL_TRADE_FILLS: TradeFill[] = []

export function getStoredProjects(): Project[] {
  const baseList = [...INITIAL_PROJECTS, ...(RWA_PROJECTS || [])]
  if (typeof window === 'undefined') return baseList
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS)
    if (!raw) return baseList
    const parsed: Project[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return baseList
    const initialIds = new Set(baseList.map(p => p.id.toLowerCase()))
    const custom = parsed.filter(p => p && p.id && !initialIds.has(p.id.toLowerCase()))
    return [...custom, ...baseList]
  } catch (err) {
    console.error('Failed to parse custom projects from localStorage', err)
    return baseList
  }
}

export function saveCustomProject(project: Project): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROJECTS)
    const existing: Project[] = raw ? JSON.parse(raw) : []
    const updated = [project, ...(Array.isArray(existing) ? existing.filter(p => p.id.toLowerCase() !== project.id.toLowerCase()) : [])]
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('qualyra:projects-updated', { detail: project }))
  } catch (err) {
    console.error('Failed to save custom project to localStorage', err)
  }
}

export function getUserPositions(): UserPosition[] {
  if (typeof window === 'undefined') return []
  try {
    // One-time cleanup of initial hardcoded development mock positions (ROBAI 25k, SAW 50k, TRSY 10k)
    const MOCK_CLEAN_KEY = 'qualyra_cleared_mock_positions_v2'
    if (!localStorage.getItem(MOCK_CLEAN_KEY)) {
      try {
        const existingRaw = localStorage.getItem(STORAGE_KEY_POSITIONS)
        if (existingRaw) {
          const parsed = JSON.parse(existingRaw)
          // Keep only custom tokens actually deployed by the user
          const kept = Array.isArray(parsed) ? parsed.filter((p: UserPosition) => p.isCreator) : []
          if (kept.length > 0) {
            localStorage.setItem(STORAGE_KEY_POSITIONS, JSON.stringify(kept))
          } else {
            localStorage.removeItem(STORAGE_KEY_POSITIONS)
          }
        }
        localStorage.removeItem(STORAGE_KEY_FILLS)
      } catch {}
      localStorage.setItem(MOCK_CLEAN_KEY, 'true')
    }

    const allProjects = getStoredProjects()
    const projectMap = new Map<string, Project>()
    allProjects.forEach(p => {
      projectMap.set(p.id.toLowerCase(), p)
      projectMap.set(p.tick.toLowerCase(), p)
    })

    const raw = localStorage.getItem(STORAGE_KEY_POSITIONS)
    let positions: UserPosition[] = []
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          positions = parsed.filter(p => p && p.balance > 0)
        }
      } catch (e) {
        console.error('Failed to parse positions', e)
      }
    }

    // Also ensure any custom deployed token by the user is represented as a creator allocation (10%)
    const rawProjects = localStorage.getItem(STORAGE_KEY_PROJECTS)
    if (rawProjects) {
      const parsedProjects: Project[] = JSON.parse(rawProjects)
      if (Array.isArray(parsedProjects)) {
        parsedProjects.forEach(cp => {
          const exists = positions.some(pos => pos.id.toLowerCase() === cp.id.toLowerCase())
          if (!exists) {
            positions.unshift({
              id: cp.id,
              tick: cp.tick,
              name: cp.name,
              balance: 100000000, // 10% creator allocation
              entry: cp.entry || cp.price || 0.0001,
              price: cp.price || 0.0001,
              quoteAsset: cp.quoteAsset,
              logoUrl: cp.logoUrl,
              logoFit: cp.logoFit,
              logoShape: cp.logoShape,
              logoBg: cp.logoBg,
              logoScale: cp.logoScale,
              isCreator: true,
              rwa: cp.rwa,
            })
          }
        })
      }
    }

    // Refresh current price from project map
    return positions.map(pos => {
      const proj = projectMap.get(pos.id.toLowerCase())
      return {
        ...pos,
        price: proj ? proj.price : pos.price,
      }
    })
  } catch (err) {
    console.error('Failed to get user positions from localStorage', err)
    return []
  }
}

export function saveUserPositions(positions: UserPosition[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_POSITIONS, JSON.stringify(positions))
  } catch (err) {
    console.error('Failed to save user positions', err)
  }
}

export function getTradeFills(): TradeFill[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FILLS)
    if (!raw) return []
    const parsed: TradeFill[] = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch (err) {
    console.error('Failed to get trade fills', err)
    return []
  }
}

export function saveTradeFill(fill: TradeFill): void {
  if (typeof window === 'undefined') return
  try {
    const existing = getTradeFills()
    const updated = [fill, ...existing].slice(0, 100)
    localStorage.setItem(STORAGE_KEY_FILLS, JSON.stringify(updated))
  } catch (err) {
    console.error('Failed to save trade fill', err)
  }
}

// ================= WALLET BALANCES (USDG, ETH & NVDA) =================
const STORAGE_KEY_WALLET_BALANCES = 'qualyra_wallet_balances_v1'

export interface WalletBalances {
  usdg: number
  eth: number
  qlra?: number
  nvda?: number
  pons?: number
  ai?: number
}

// LEVEL 1 (on-chain migration): demo/simulated seed balances removed.
// All quote balances now default to 0 so that on-chain sources (useBalance / balanceOf)
// become the effective source of truth. The simulated fields are kept (as 0) only so the
// existing WalletBalances structure and executeTrade() bookkeeping keep compiling until
// Phase 2 (real on-chain transactions) + the indexer land.
export const INITIAL_WALLET_BALANCES: WalletBalances = {
  usdg: 0,
  eth: 0,
  qlra: 0,
  nvda: 0,
  pons: 0,
  ai: 0,
}

export function getWalletBalances(): WalletBalances {
  if (typeof window === 'undefined') return INITIAL_WALLET_BALANCES
  try {
    // LEVEL 1 one-time cleanup: wipe legacy demo seed balances (25k USDG / 10 ETH / 50k QLRA...)
    // left over in localStorage from before the on-chain migration, so returning users also
    // fall through to on-chain balances instead of stale simulated cash.
    const DEMO_SEED_CLEAN_KEY = 'qualyra_cleared_demo_balances_v1'
    if (!localStorage.getItem(DEMO_SEED_CLEAN_KEY)) {
      localStorage.removeItem(STORAGE_KEY_WALLET_BALANCES)
      localStorage.setItem(DEMO_SEED_CLEAN_KEY, 'true')
    }

    const raw = localStorage.getItem(STORAGE_KEY_WALLET_BALANCES)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_WALLET_BALANCES, JSON.stringify(INITIAL_WALLET_BALANCES))
      return INITIAL_WALLET_BALANCES
    }
    const parsed = JSON.parse(raw)
    return {
      usdg: typeof parsed.usdg === 'number' ? parsed.usdg : INITIAL_WALLET_BALANCES.usdg,
      eth: typeof parsed.eth === 'number' ? parsed.eth : INITIAL_WALLET_BALANCES.eth,
      qlra: typeof parsed.qlra === 'number' ? parsed.qlra : (INITIAL_WALLET_BALANCES.qlra ?? 50000),
      nvda: typeof parsed.nvda === 'number' ? parsed.nvda : (INITIAL_WALLET_BALANCES.nvda ?? 25.0),
    }
  } catch {
    return INITIAL_WALLET_BALANCES
  }
}

export function saveWalletBalances(balances: WalletBalances): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY_WALLET_BALANCES, JSON.stringify(balances))
    window.dispatchEvent(new CustomEvent('qualyra:balances-updated', { detail: balances }))
  } catch (err) {
    console.error('Failed to save wallet balances', err)
  }
}

export interface ExecuteTradeParams {
  projectId: string
  side: 'BUY' | 'SELL'
  amount: number
  price: number
  quoteAmount: number
  fee: number
  project: Project
}

export function executeTrade(params: ExecuteTradeParams): TradeFill {
  const { projectId, side, amount, price, quoteAmount, fee, project } = params
  const now = new Date()
  const timeStr = now.toTimeString().split(' ')[0]
  const txHash = '0x' + Math.random().toString(16).slice(2, 10) + '…' + Math.random().toString(16).slice(2, 6)

  const fill: TradeFill = {
    id: `fill-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: timeStr,
    timestamp: Date.now(),
    pair: `${project.tick} / ${project.quoteAsset || 'ETH'}`,
    side,
    price,
    amount,
    total: quoteAmount,
    fee,
    tx: txHash,
    tick: project.tick,
  }

  // 1. Record Fill
  saveTradeFill(fill)

  // 2. Update User Position
  const positions = getUserPositions()
  const existingIdx = positions.findIndex(p => p.id.toLowerCase() === projectId.toLowerCase())

  if (side === 'BUY') {
    if (existingIdx >= 0) {
      const prev = positions[existingIdx]
      const totalQty = prev.balance + amount
      const blendedEntry = totalQty > 0 ? (prev.entry * prev.balance + price * amount) / totalQty : price
      positions[existingIdx] = {
        ...prev,
        balance: totalQty,
        entry: cleanPrice(blendedEntry, !!project.rwa),
        price: cleanPrice(price, !!project.rwa),
      }
    } else {
      positions.unshift({
        id: project.id,
        tick: project.tick,
        name: project.name,
        balance: amount,
        entry: cleanPrice(price, !!project.rwa),
        price: cleanPrice(price, !!project.rwa),
        quoteAsset: project.quoteAsset,
        logoUrl: project.logoUrl,
        logoFit: project.logoFit,
        logoShape: project.logoShape,
        logoBg: project.logoBg,
        logoScale: project.logoScale,
        rwa: project.rwa,
      })
    }
  } else {
    // SELL
    if (existingIdx >= 0) {
      const prev = positions[existingIdx]
      positions[existingIdx] = {
        ...prev,
        balance: Math.max(0, prev.balance - amount),
        price: cleanPrice(price, !!project.rwa),
      }
    }
  }
  saveUserPositions(positions)

  // 3. Update Wallet Balances (Quote Asset: ETH, NVDA, or USDG)
  const currentBalances = getWalletBalances()
  const quote = (project.quoteAsset || 'ETH').toUpperCase()
  if (side === 'BUY') {
    if (quote === 'ETH') {
      currentBalances.eth = Math.max(0, +(currentBalances.eth - quoteAmount).toFixed(4))
    } else if (quote === 'NVDA') {
      currentBalances.nvda = Math.max(0, +((currentBalances.nvda ?? 25.0) - quoteAmount).toFixed(4))
    } else {
      currentBalances.usdg = Math.max(0, +(currentBalances.usdg - quoteAmount).toFixed(2))
    }
  } else {
    // SELL
    if (quote === 'ETH') {
      currentBalances.eth = +(currentBalances.eth + quoteAmount - fee).toFixed(4)
    } else if (quote === 'NVDA') {
      currentBalances.nvda = +((currentBalances.nvda ?? 25.0) + quoteAmount - fee).toFixed(4)
    } else {
      currentBalances.usdg = +(currentBalances.usdg + quoteAmount - fee).toFixed(2)
    }
  }
  saveWalletBalances(currentBalances)

  // 4. Update Bonding Curve if applicable
  if (!project.rwa && project.status === 'bonding') {
    const deltaRaised = side === 'BUY' ? quoteAmount : -quoteAmount * 0.95
    const newRaised = Math.max(0, +(project.raised + deltaRaised).toFixed(2))
    const newProgress = Math.min(100, Math.round((newRaised / project.goal) * 100))
    const updatedProject: Project = {
      ...project,
      raised: newRaised,
      progress: newProgress,
      holders: side === 'BUY' ? project.holders + 1 : project.holders,
      vol24: Math.round((project.vol24 ?? 0) + quoteAmount * 3200),
      status: newProgress >= 100 ? 'graduated' : 'bonding',
    }
    saveCustomProject(updatedProject)
  }

  // 5. Dispatch events for cross-tab and cross-component live sync
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qualyra:trade-executed', { detail: fill }))
  }

  return fill
}

// =========================================================
// LIMIT ORDERS & TAKE-PROFIT / STOP-LOSS (TP/SL) ENGINE
// =========================================================

export interface LimitOrder {
  id: string
  pairId: string
  tick: string
  side: 'BUY' | 'SELL'
  type: 'LIMIT' | 'TP' | 'SL'
  limitPrice: number
  amount: number
  totalQuote: number
  quoteAsset: string
  status: 'OPEN' | 'FILLED' | 'CANCELLED'
  createdAt: number
  time: string
  triggerCondition: 'LTE' | 'GTE'
  parentOrderId?: string
  tpPrice?: number
  slPrice?: number
  tx?: string
}

const STORAGE_KEY_OPEN_ORDERS = 'qualyra_open_orders_v1'

export function getOpenOrders(): LimitOrder[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPEN_ORDERS)
    if (!raw) return []
    const parsed: LimitOrder[] = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(o => o && o.status === 'OPEN') : []
  } catch (err) {
    console.error('Failed to get open orders from localStorage', err)
    return []
  }
}

export function saveOpenOrder(order: LimitOrder): void {
  if (typeof window === 'undefined') return
  try {
    const existing = getOpenOrders()
    const updated = [order, ...existing.filter(o => o.id !== order.id)]
    localStorage.setItem(STORAGE_KEY_OPEN_ORDERS, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('qualyra:orders-updated', { detail: updated }))
    window.dispatchEvent(new Event('storage'))
  } catch (err) {
    console.error('Failed to save open order', err)
  }
}

export function cancelOpenOrder(id: string): LimitOrder | null {
  if (typeof window === 'undefined') return null
  try {
    const existing = getOpenOrders()
    const target = existing.find(o => o.id === id)
    if (!target) return null
    const updated = existing.filter(o => o.id !== id)
    localStorage.setItem(STORAGE_KEY_OPEN_ORDERS, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('qualyra:orders-updated', { detail: updated }))
    window.dispatchEvent(new Event('storage'))
    return target
  } catch (err) {
    console.error('Failed to cancel open order', err)
    return null
  }
}

export function cancelAllOpenOrders(pairId?: string): number {
  if (typeof window === 'undefined') return 0
  try {
    const existing = getOpenOrders()
    let updated: LimitOrder[]
    let count = 0
    if (pairId) {
      const q = pairId.toLowerCase()
      updated = existing.filter(o => o.pairId.toLowerCase() !== q)
      count = existing.length - updated.length
    } else {
      count = existing.length
      updated = []
    }
    localStorage.setItem(STORAGE_KEY_OPEN_ORDERS, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent('qualyra:orders-updated', { detail: updated }))
    window.dispatchEvent(new Event('storage'))
    return count
  } catch (err) {
    console.error('Failed to cancel all open orders', err)
    return 0
  }
}

export function executeTriggeredOrder(order: LimitOrder, currentPrice: number, project: Project): TradeFill {
  // Cancel/remove from open orders
  cancelOpenOrder(order.id)

  const fee = !!project.rwa
    ? +(order.totalQuote * 0.001).toFixed(2)
    : +(order.totalQuote * 0.01).toFixed(4)

  const fill = executeTrade({
    projectId: project.id,
    side: order.side,
    amount: order.amount,
    price: cleanPrice(currentPrice, !!project.rwa),
    quoteAmount: order.totalQuote,
    fee,
    project,
  })

  // If order had child TP or SL attached and it was a BUY, attach them now
  if (order.side === 'BUY') {
    if (order.tpPrice && order.tpPrice > currentPrice) {
      saveOpenOrder({
        id: `tp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        pairId: project.id.toLowerCase(),
        tick: project.tick,
        side: 'SELL',
        type: 'TP',
        limitPrice: order.tpPrice,
        amount: order.amount,
        totalQuote: +(order.amount * order.tpPrice).toFixed(2),
        quoteAsset: project.quoteAsset || 'USDG',
        status: 'OPEN',
        createdAt: Date.now(),
        time: new Date().toTimeString().split(' ')[0],
        triggerCondition: 'GTE',
        parentOrderId: order.id,
      })
    }
    if (order.slPrice && order.slPrice < currentPrice) {
      saveOpenOrder({
        id: `sl-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        pairId: project.id.toLowerCase(),
        tick: project.tick,
        side: 'SELL',
        type: 'SL',
        limitPrice: order.slPrice,
        amount: order.amount,
        totalQuote: +(order.amount * order.slPrice).toFixed(2),
        quoteAsset: project.quoteAsset || 'USDG',
        status: 'OPEN',
        createdAt: Date.now(),
        time: new Date().toTimeString().split(' ')[0],
        triggerCondition: 'LTE',
        parentOrderId: order.id,
      })
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('qualyra:order-triggered', { detail: { order, fill } }))
  }

  return fill
}

// =========================================================
// LIVE COMMUNITY TROLLBOX (Chat Stream & Trade Alerts)
// =========================================================

export interface TrollboxMessage {
  id: string
  pairId: string
  sender: string
  senderShort: string
  role?: 'creator' | 'whale' | 'holder' | 'trader' | 'bot'
  text: string
  time: string
  isUser?: boolean
  holding?: number
  isTradeAlert?: boolean
}

export const INITIAL_TROLLBOX_SEED: Record<string, TrollboxMessage[]> = {}

export function getStoredTrollboxMessages(pairId: string): TrollboxMessage[] {
  const p = pairId.toLowerCase()
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = localStorage.getItem(`qualyra_trollbox_${p}`)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.error(e)
  }
  return []
}

export function saveTrollboxMessage(pairId: string, msg: TrollboxMessage): TrollboxMessage[] {
  const p = pairId.toLowerCase()
  const existing = getStoredTrollboxMessages(p)
  const updated = [...existing, msg].slice(-80) // keep last 80 messages

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`qualyra_trollbox_${p}`, JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent('qualyra:trollbox-updated', { detail: { pairId: p, message: msg } }))
    } catch (e) {
      console.error(e)
    }
  }
  return updated
}

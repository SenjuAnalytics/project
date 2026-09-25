/** Shapes exchanged between the trade page, its panels and the /api routes behind them. */

/** One fill shown in the Recent Trades panel. */
export interface TradeItem {
  id: string
  txHash?: string
  price: number
  priceQuote?: number
  amount: number
  totalQuote?: number
  volumeUsd?: number
  time: string
  timestamp?: number
  isBuy: boolean
  trader?: string
  blockNumber?: number
}

/** One row of /api/holders, already ranked and formatted for display. */
export interface TokenHolderItem {
  rank: number
  address: string
  label?: string
  isContract: boolean
  balanceFormatted: string
  percentage: number
  explorerUrl: string
}

/** One row of /api/transfers, read off the Robinhood Chain event stream. */
export interface TokenTransferItem {
  id: string
  txHash: string
  from: string
  to: string
  valueFormatted: string
  blockNumber: number
  timeAgo: string
  explorerUrl: string
}

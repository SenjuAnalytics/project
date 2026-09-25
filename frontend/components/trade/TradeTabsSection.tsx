'use client'

import React, { Dispatch, SetStateAction } from 'react'
import type { Project } from '@/lib/data'
import type { LimitOrder, UserPosition } from '@/lib/storage'
import type { TradeItem, TokenTransferItem, TokenHolderItem } from '@/lib/trade/types'
import type { TokenMarket } from '@/lib/useQualyraTrade'
import { PositionsPanel } from '@/components/trade/panels/PositionsPanel'
import { OpenOrdersPanel } from '@/components/trade/panels/OpenOrdersPanel'
import { RecentTradesPanel } from '@/components/trade/panels/RecentTradesPanel'
import { ShieldPanel } from '@/components/trade/panels/ShieldPanel'
import { ActivityPanel } from '@/components/trade/panels/ActivityPanel'
import { HoldersPanel } from '@/components/trade/panels/HoldersPanel'
import { Trollbox } from '@/components/trade/Trollbox'
import { SoonBadge } from '@/components/ui/SoonBadge'

interface TradeTabsSectionProps {
  bTab: 'pos' | 'orders' | 'trades' | 'trollbox' | 'shield' | 'act' | 'hold'
  setBTab: Dispatch<SetStateAction<'pos' | 'orders' | 'trades' | 'trollbox' | 'shield' | 'act' | 'hold'>>
  curProject: Project
  currentPosition: UserPosition | null
  pairOpenOrders: LimitOrder[]
  trades: TradeItem[]
  tradesLoading: boolean
  isRwa: boolean
  quote: string
  quoteUsdPrice: number
  explorerBase: string
  currentHolding: number
  isCreator: boolean
  loadingTransfers: boolean
  onchainTransfers: TokenTransferItem[]
  loadingHolders: boolean
  onchainHolders: TokenHolderItem[]
  totalHoldersCount: number
  market: TokenMarket
}

/** Bottom tab navigation and panel router in the center column. */
export function TradeTabsSection({
  bTab,
  setBTab,
  curProject,
  currentPosition,
  pairOpenOrders,
  trades,
  tradesLoading,
  isRwa,
  quote,
  quoteUsdPrice,
  explorerBase,
  currentHolding,
  isCreator,
  loadingTransfers,
  onchainTransfers,
  loadingHolders,
  onchainHolders,
  totalHoldersCount,
  market,
}: TradeTabsSectionProps) {
  return (
    <div style={{ background: 'var(--panel)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="btabs" style={{ flexShrink: 0, borderTop: '1px solid var(--line)', background: 'var(--panel)' }}>
        <button
          type="button"
          className={bTab === 'pos' ? 'active' : ''}
          onClick={() => setBTab('pos')}
        >
          Positions & Fills
        </button>
        <button
          type="button"
          disabled
          title="Resting orders need the limit order contract. Not live yet."
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'not-allowed', opacity: 0.6 }}
        >
          Open Orders <SoonBadge />
        </button>
        <button
          type="button"
          className={bTab === 'trades' ? 'active' : ''}
          onClick={() => setBTab('trades')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <span className="livedot" style={{ margin: 0 }} />
          <span>Live Trades</span>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 700,
              background: 'var(--subtle)',
              border: '1px solid var(--line)',
              padding: '1px 6px',
              borderRadius: '10px',
              color: 'var(--tx)',
            }}
          >
            {trades.length}
          </span>
        </button>
        <button
          type="button"
          disabled
          title="Chat needs a shared backend. Messages are not stored anywhere yet."
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'not-allowed', opacity: 0.6 }}
        >
          Community Chat <SoonBadge />
        </button>
        <button
          type="button"
          className={bTab === 'shield' ? 'active' : ''}
          onClick={() => setBTab('shield')}
        >
          Liquidity Lock
        </button>
        <button
          type="button"
          className={bTab === 'act' ? 'active' : ''}
          onClick={() => setBTab('act')}
        >
          Activity
        </button>
        <button
          type="button"
          className={bTab === 'hold' ? 'active' : ''}
          onClick={() => setBTab('hold')}
        >
          Holders ({totalHoldersCount > 0 ? totalHoldersCount : (onchainHolders.length > 0 ? onchainHolders.length : (curProject.holders || 0))})
        </button>
      </div>

      <div
        className="btabbody"
        data-scroll="btabbody"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: bTab === 'trades' ? 'hidden' : 'auto',
          overscrollBehavior: 'contain',
          padding: bTab === 'trades' ? 0 : '14px 18px 24px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {bTab === 'pos' && (
          <PositionsPanel
            curProject={curProject}
            currentPosition={currentPosition}
          />
        )}

        {bTab === 'orders' && (
          <OpenOrdersPanel
            curProject={curProject}
            isRwa={isRwa}
            pairOpenOrders={pairOpenOrders}
          />
        )}

        {bTab === 'trades' && (
          <RecentTradesPanel
            curProject={curProject}
            explorerBase={explorerBase}
            isRwa={isRwa}
            quote={quote}
            quoteUsdPrice={quoteUsdPrice}
            trades={trades}
            tradesLoading={tradesLoading}
          />
        )}

        {bTab === 'trollbox' && (
          <div style={{ height: '360px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--line)' }}>
            <Trollbox
              pairId={curProject.id}
              pairTick={curProject.tick}
              userHolding={currentHolding}
              isCreator={isCreator}
            />
          </div>
        )}

        {bTab === 'shield' && (
          <ShieldPanel
            curProject={curProject}
            currentHolding={currentHolding}
            explorerBase={explorerBase}
            quote={quote}
            market={market}
          />
        )}

        {bTab === 'act' && (
          <ActivityPanel
            curProject={curProject}
            explorerBase={explorerBase}
            loadingTransfers={loadingTransfers}
            onchainTransfers={onchainTransfers}
          />
        )}

        {bTab === 'hold' && (
          <HoldersPanel
            curProject={curProject}
            explorerBase={explorerBase}
            loadingHolders={loadingHolders}
            onchainHolders={onchainHolders}
            totalHoldersCount={totalHoldersCount}
          />
        )}
      </div>
    </div>
  )
}

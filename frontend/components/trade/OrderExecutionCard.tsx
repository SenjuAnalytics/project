'use client'

import React, { Dispatch, SetStateAction } from 'react'
import {
  Zap,
  Settings,
  Target,
  ArrowLeftRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ArrowDownRight,
  ArrowUpRight,
  ShieldCheck,
} from 'lucide-react'
import { formatUnits } from 'viem'
import { TradeBridgePanel } from '@/components/trade/TradeBridgePanel'
import { SoonBadge } from '@/components/ui/SoonBadge'
import type { Project } from '@/lib/data'
import type { WalletBalances } from '@/lib/storage'
import { px7, cleanPriceNum, formatPriceWithUnit } from '@/lib/utils'
import type { useTokenMarket, useTradeActions, useCurveQuote } from '@/lib/useQualyraTrade'

interface OrderExecutionCardProps {
  mobileView: 'chart' | 'trades' | 'markets'
  orderType: 'MARKET' | 'LIMIT' | 'BRIDGE'
  setOrderType: Dispatch<SetStateAction<'MARKET' | 'LIMIT' | 'BRIDGE'>>
  orderSide: 'BUY' | 'SELL'
  setOrderSide: Dispatch<SetStateAction<'BUY' | 'SELL'>>
  isRwaStock: boolean
  isRwaPaired: boolean
  curProject: Project
  quote: string
  quoteUsdPrice?: number
  slippage: number
  setShowSlippageModal: (open: boolean) => void
  limitPrice: number
  setLimitPrice: Dispatch<SetStateAction<number>>
  effectiveEthBalance: number
  balances: WalletBalances
  currentHolding: number
  onchainEth: number | null
  formattedQuoteBalance: string
  bAmt: number
  setBAmt: Dispatch<SetStateAction<number>>
  sAmt: number
  setSAmt: Dispatch<SetStateAction<number>>
  isRwa: boolean
  attachTpSl: boolean
  setAttachTpSl: Dispatch<SetStateAction<boolean>>
  tpSlInputMode: 'percent' | 'price'
  setTpSlInputMode: Dispatch<SetStateAction<'percent' | 'price'>>
  customTpPrice: string
  setCustomTpPrice: Dispatch<SetStateAction<string>>
  calculatedTpPrice: number
  customSlPrice: string
  setCustomSlPrice: Dispatch<SetStateAction<string>>
  calculatedSlPrice: number
  effectiveTpPct: number
  tpPct: number
  setTpPct: Dispatch<SetStateAction<number>>
  effectiveSlPct: number
  slPct: number
  setSlPct: Dispatch<SetStateAction<number>>
  effectivePrice: number
  projectedTpGainUsdg: number
  projectedSlLossUsdg: number
  riskRewardRatio: string | number
  quotePending: boolean
  receiveEstBuy: number
  receiveEstSell: number
  tokenLabel: (n: number) => string
  quoteLabel: (n: number) => string
  liveTrading: boolean
  minReceivedBuy: number
  minReceivedSell: number
  curveBuyQuote?: ReturnType<typeof useCurveQuote>
  dynamicPriceImpact: number
  isWrongChain: boolean
  chainId: number
  handleSwitchToRobinhoodChain: () => Promise<void>
  isSwitchingChain: boolean
  market: ReturnType<typeof useTokenMarket>
  onChainTrade: ReturnType<typeof useTradeActions>
  handleLimitSubmit: () => void
  handleBuy: () => void
  handleSell: () => void
}

/** Right-column card: Order Form (Swap/Limit/Bridge), Buy/Sell inputs, TP/SL, and action CTA. */
export function OrderExecutionCard({
  mobileView,
  orderType,
  setOrderType,
  orderSide,
  setOrderSide,
  isRwaStock,
  isRwaPaired,
  curProject,
  quote,
  quoteUsdPrice,
  slippage,
  setShowSlippageModal,
  limitPrice,
  setLimitPrice,
  effectiveEthBalance,
  balances,
  currentHolding,
  onchainEth,
  formattedQuoteBalance,
  bAmt,
  setBAmt,
  sAmt,
  setSAmt,
  isRwa,
  attachTpSl,
  tpSlInputMode,
  setTpSlInputMode,
  customTpPrice,
  setCustomTpPrice,
  calculatedTpPrice,
  customSlPrice,
  setCustomSlPrice,
  calculatedSlPrice,
  effectiveTpPct,
  tpPct,
  setTpPct,
  effectiveSlPct,
  slPct,
  setSlPct,
  effectivePrice,
  projectedTpGainUsdg,
  projectedSlLossUsdg,
  riskRewardRatio,
  quotePending,
  receiveEstBuy,
  receiveEstSell,
  tokenLabel,
  quoteLabel,
  liveTrading,
  minReceivedBuy,
  minReceivedSell,
  curveBuyQuote,
  dynamicPriceImpact,
  isWrongChain,
  chainId,
  handleSwitchToRobinhoodChain,
  isSwitchingChain,
  market,
  onChainTrade,
  handleLimitSubmit,
  handleBuy,
  handleSell,
}: OrderExecutionCardProps) {
  const isQuoteUsd = quote === 'USDG' || quote === 'USD' || quote === 'USDC'
  const effectiveQuoteUsd = (quoteUsdPrice && quoteUsdPrice > 0) ? quoteUsdPrice : (quote === 'ETH' ? 2400 : 1)
  const isChainToken = /^0x[0-9a-fA-F]{40}$/.test(curProject.id)
  const marketPriceUsd = isChainToken ? (isQuoteUsd ? curProject.price : curProject.price * effectiveQuoteUsd) : curProject.price
  const limitPriceUsd = isChainToken ? (isQuoteUsd ? limitPrice : limitPrice * effectiveQuoteUsd) : limitPrice

  return (
            <div className={`trade-order-card ${mobileView === 'trades' ? 'mobile-card-hidden' : ''}`} style={{ padding: '14px 14px 16px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              {/* Pro Trading Mode Header (Swap & Limit Mode) */}
              {orderType !== 'BRIDGE' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: 'var(--green)',
                        display: 'inline-block',
                        boxShadow: '0 0 6px var(--green)',
                      }}
                    />
                    <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--tx)' }}>
                      {isRwaStock
                        ? 'Instant RWA Swap'
                        : isRwaPaired
                        ? 'RWA Paired Swap'
                        : curProject.status === 'graduated' || curProject.poolAddress
                        ? 'DEX Pool Swap'
                        : 'Curve Execution'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSlippageModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      color: slippage > 3 ? 'var(--red)' : slippage < 0.2 ? '#F59E0B' : 'var(--tx)',
                      background: slippage > 3 ? 'rgba(239, 68, 68, 0.12)' : slippage < 0.2 ? 'rgba(245, 158, 11, 0.12)' : 'var(--input)',
                      padding: '3px 8px',
                      borderRadius: '5px',
                      border: `1px solid ${slippage > 3 ? 'rgba(239, 68, 68, 0.35)' : slippage < 0.2 ? 'rgba(245, 158, 11, 0.35)' : 'var(--line)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title="Configure Slippage Tolerance & Fair Sequencer Settings"
                  >
                    <Zap size={10} style={{ color: 'var(--brand)' }} />
                    <span>{slippage}% Slip</span>
                    <Settings size={10} style={{ color: 'var(--dim)', marginLeft: '1px' }} />
                  </button>
                </div>
              )}

              {/* Order Type Switcher: Swap vs Limit vs Bridge */}
              <div className="order-type-tabs">
                <button
                  type="button"
                  onClick={() => setOrderType('MARKET')}
                  className={`order-type-tab ${orderType === 'MARKET' ? 'active-market' : ''}`}
                >
                  <Zap
                    size={12}
                    strokeWidth={2.4}
                    style={{
                      color: orderType === 'MARKET' ? '#10B981' : 'var(--dim)',
                      transition: 'color 0.18s ease',
                    }}
                  />
                  <span>Swap</span>
                </button>
                <button
                  type="button"
                  disabled
                  className="order-type-tab"
                  title="Limit orders need an order contract and a keeper. Not live yet."
                  style={{ cursor: 'not-allowed', opacity: 0.6 }}
                >
                  <Target size={12} strokeWidth={2.4} style={{ color: 'var(--dim)' }} />
                  <span>Limit</span>
                  <SoonBadge />
                </button>
                <button
                  type="button"
                  disabled
                  className="order-type-tab"
                  title="Bridging will go through an existing bridge. Not wired up yet."
                  style={{ cursor: 'not-allowed', opacity: 0.6 }}
                >
                  <ArrowLeftRight size={12} strokeWidth={2.4} style={{ color: 'var(--dim)' }} />
                  <span>Bridge</span>
                  <SoonBadge />
                </button>
              </div>

              {orderType === 'BRIDGE' ? (
                <TradeBridgePanel />
              ) : (
                <>
                  {/* Segmented Buy / Sell Switcher */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  padding: '3px',
                  background: 'var(--inset)',
                  borderRadius: '8px',
                  border: '1px solid var(--line)',
                  marginBottom: '10px',
                  gap: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setOrderSide('BUY')}
                  style={{
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 0',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    background: orderSide === 'BUY' ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'transparent',
                    color: orderSide === 'BUY' ? '#FFFFFF' : 'var(--dim)',
                    boxShadow: orderSide === 'BUY' ? '0 2px 8px rgba(16, 185, 129, 0.28)' : 'none',
                  }}
                >
                  Buy
                </button>
                <button
                  type="button"
                  onClick={() => setOrderSide('SELL')}
                  style={{
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 0',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    background: orderSide === 'SELL' ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)' : 'transparent',
                    color: orderSide === 'SELL' ? '#FFFFFF' : 'var(--dim)',
                    boxShadow: orderSide === 'SELL' ? '0 2px 8px rgba(239, 68, 68, 0.28)' : 'none',
                  }}
                >
                  Sell
                </button>
              </div>

              {/* Dedicated Limit Price Input (Active in LIMIT mode) */}
              {orderType === 'LIMIT' && (
                <div
                  style={{
                    background: 'var(--inset)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '8px',
                    padding: '8px 11px',
                    marginBottom: '10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🎯</span> Limit Price Target
                    </span>
                    <span style={{ fontSize: '10.5px', color: 'var(--ft)' }}>
                      Market: ${px7(marketPriceUsd)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--dim)', fontSize: isQuoteUsd ? '15px' : '12px', fontWeight: 700 }}>
                      {isQuoteUsd ? '$' : quote}
                    </span>
                    <input
                      type="number"
                      step={curProject.price >= 100 ? "0.01" : curProject.price >= 1 ? "0.001" : "any"}
                      className="no-spin"
                      value={limitPrice || ''}
                      placeholder={px7(curProject.price)}
                      onChange={e => setLimitPrice(parseFloat(e.target.value) || 0)}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'var(--tx)',
                        fontSize: '16px',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 0,
                      }}
                    />
                    {!isQuoteUsd && limitPrice > 0 && (
                      <span style={{ fontSize: '11px', color: 'var(--dim)', fontWeight: 500, marginRight: '4px', whiteSpace: 'nowrap' }}>
                        ≈ ${px7(limitPriceUsd)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setLimitPrice(cleanPriceNum(curProject.price))}
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'var(--input)',
                        border: '1px solid var(--line)',
                        fontSize: '10px',
                        color: 'var(--dim)',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      Current
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
                    {[-5, -1, 1, 5].map(pct => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          const base = curProject.price
                          const newP = cleanPriceNum(base * (1 + pct / 100))
                          setLimitPrice(newP)
                        }}
                        style={{
                          padding: '3px 0',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: 'var(--input)',
                          border: '1px solid var(--line)',
                          color: pct < 0 ? 'var(--red)' : 'var(--green)',
                        }}
                      >
                        {pct > 0 ? `+${pct}%` : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Available Balance Row */}
              <div
                onClick={() => {
                  if (orderSide === 'BUY') {
                    setBAmt(
                      quote === 'ETH'
                        ? +effectiveEthBalance.toFixed(4)
                        : quote === 'NVDA'
                        ? +(balances.nvda ?? 25.0).toFixed(2)
                        : Math.floor(balances.usdg)
                    )
                  } else {
                    setSAmt(currentHolding > 0 ? currentHolding : 0)
                  }
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                  padding: '2px 1px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                title="Click to use max balance"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--dim)', fontSize: '11.5px' }}>
                  <Wallet size={12} style={{ color: 'var(--ft)' }} />
                  <span>Available</span>
                  {orderSide === 'BUY' && quote === 'ETH' && (
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: onchainEth !== null ? 'rgba(16, 185, 129, 0.15)' : 'var(--panel)',
                        color: onchainEth !== null ? 'var(--green)' : 'var(--dim)',
                        border: `1px solid ${onchainEth !== null ? 'rgba(16, 185, 129, 0.35)' : 'var(--line)'}`,
                      }}
                      title={onchainEth !== null ? 'Live onchain balance synced from Robinhood Chain' : 'Simulated balance'}
                    >
                      {onchainEth !== null ? 'ONCHAIN' : 'DEMO'}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx)' }}>
                    {orderSide === 'BUY'
                      ? formattedQuoteBalance
                      : (currentHolding > 0
                          ? `${currentHolding.toLocaleString('en-US')} $${curProject.tick}`
                          : `0 $${curProject.tick}`)}
                  </span>
                  <span
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 700,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: 'var(--brand-dim)',
                      color: 'var(--brand)',
                      border: '1px solid rgba(var(--brand-rgb), 0.3)',
                      letterSpacing: '0.04em',
                    }}
                  >
                    MAX
                  </span>
                </div>
              </div>

              {/* Quote Amount Input Card */}
              <div
                style={{
                  background: 'var(--inset)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--dim)', fontWeight: 500 }}>
                    {orderSide === 'BUY' ? 'You Pay' : 'You Sell'}
                  </span>
                  <span style={{ fontSize: '10.5px', color: 'var(--ft)' }}>
                    {orderSide === 'BUY'
                      ? `Bal: ${formattedQuoteBalance}`
                      : `Holding: ${currentHolding > 0 ? currentHolding.toLocaleString('en-US') : 0}`}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    className="no-spin"
                    value={orderSide === 'BUY' ? bAmt : sAmt}
                    min="0"
                    step={orderSide === 'BUY' ? (quote === 'ETH' ? '0.01' : quote === 'NVDA' ? '0.1' : '10') : (isRwa && quote === 'USDG' ? '0.01' : '100')}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0
                      if (orderSide === 'BUY') setBAmt(val)
                      else setSAmt(val)
                    }}
                    placeholder="0.00"
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      color: 'var(--tx)',
                      fontSize: '18px',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 0,
                    }}
                  />
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--tx)' }}>
                      {orderSide === 'BUY' ? quote : `$${curProject.tick}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', margin: '9px 0 10px' }}>
                {orderSide === 'BUY' ? (
                  (quote === 'ETH' ? [0.25, 0.5, 1.0, 2.5] : quote === 'NVDA' ? [0.5, 1.0, 2.5, 5.0] : [50, 250, 1000, 5000]).map(v => {
                    const isActive = bAmt === v
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setBAmt(v)}
                        style={{
                          padding: '6px 0',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: isActive ? 'var(--brand-dim)' : 'var(--input)',
                          border: `1px solid ${isActive ? 'var(--brand)' : 'var(--line)'}`,
                          color: isActive ? 'var(--brand)' : 'var(--dim)',
                        }}
                      >
                        {quote === 'USDG' ? `$${v.toLocaleString('en-US')}` : `${v} ${quote}`}
                      </button>
                    )
                  })
                ) : (
                  [25, 50, 75, 100].map(pct => {
                    const baseBal = currentHolding > 0 ? currentHolding : 0
                    const targetVal = +((baseBal * pct) / 100).toFixed(isRwa && quote === 'USDG' ? 2 : 0)
                    const isActive = sAmt > 0 && sAmt === targetVal
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setSAmt(targetVal)}
                        style={{
                          padding: '6px 0',
                          borderRadius: '6px',
                          fontSize: '11.5px',
                          fontWeight: isActive ? 700 : 500,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          background: isActive ? 'var(--brand-dim)' : 'var(--input)',
                          border: `1px solid ${isActive ? 'var(--brand)' : 'var(--line)'}`,
                          color: isActive ? 'var(--brand)' : 'var(--dim)',
                        }}
                      >
                        {pct === 100 ? 'Max' : `${pct}%`}
                      </button>
                    )
                  })
                )}
              </div>

              {/* TP / SL Target Order Configuration */}
              <div
                style={{
                  background: attachTpSl ? 'var(--inset)' : 'var(--subtle)',
                  borderRadius: '8px',
                  border: `1px solid ${attachTpSl ? 'rgba(var(--brand-rgb), 0.3)' : 'var(--line)'}`,
                  padding: '9px 11px',
                  marginBottom: '10px',
                  transition: 'all 0.2s ease',
                }}
              >
                <div
                  title="Take-profit and stop-loss run on the same order contract as limits. Not live yet."
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'not-allowed',
                    userSelect: 'none',
                    opacity: 0.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <input
                      type="checkbox"
                      checked={false}
                      disabled
                      readOnly
                      style={{ cursor: 'not-allowed', accentColor: 'var(--brand)' }}
                    />
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--tx)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>🎯</span> Take-Profit / Stop-Loss
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {attachTpSl && (
                      <div
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: 'inline-flex',
                          padding: '1px',
                          background: 'var(--panel)',
                          borderRadius: '4px',
                          border: '1px solid var(--line)',
                          fontSize: '9.5px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setTpSlInputMode('percent')}
                          style={{
                            border: 'none',
                            background: tpSlInputMode === 'percent' ? 'var(--brand-dim)' : 'transparent',
                            color: tpSlInputMode === 'percent' ? 'var(--brand)' : 'var(--dim)',
                            padding: '2px 5px',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontWeight: tpSlInputMode === 'percent' ? 700 : 500,
                          }}
                        >
                          % Gain
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTpSlInputMode('price')
                            if (!customTpPrice) setCustomTpPrice(calculatedTpPrice.toString())
                            if (!customSlPrice) setCustomSlPrice(calculatedSlPrice.toString())
                          }}
                          style={{
                            border: 'none',
                            background: tpSlInputMode === 'price' ? 'var(--brand-dim)' : 'transparent',
                            color: tpSlInputMode === 'price' ? 'var(--brand)' : 'var(--dim)',
                            padding: '2px 5px',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontWeight: tpSlInputMode === 'price' ? 700 : 500,
                          }}
                        >
                          $ Target
                        </button>
                      </div>
                    )}
                    <SoonBadge />
                  </div>
                </div>

                {attachTpSl && (
                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {/* Take-Profit Row */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--green)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <TrendingUp size={12} /> Take Profit (+{effectiveTpPct}%)
                        </span>
                        <span style={{ color: 'var(--tx)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          ${px7(calculatedTpPrice)}
                        </span>
                      </div>

                      {tpSlInputMode === 'percent' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                          {[10, 25, 50, 100].map(pct => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setTpPct(pct)}
                              style={{
                                padding: '4px 0',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: tpPct === pct ? 700 : 500,
                                cursor: 'pointer',
                                background: tpPct === pct ? 'rgba(16, 185, 129, 0.22)' : 'var(--input)',
                                border: `1px solid ${tpPct === pct ? '#10B981' : 'var(--line)'}`,
                                color: tpPct === pct ? '#10B981' : 'var(--dim)',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              +{pct}%
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 8px' }}>
                          <span style={{ color: 'var(--dim)', fontSize: '12px', fontWeight: 600 }}>$</span>
                          <input
                            type="number"
                            step={curProject.price >= 100 ? "0.01" : curProject.price >= 1 ? "0.001" : "any"}
                            value={customTpPrice}
                            onChange={e => setCustomTpPrice(e.target.value)}
                            placeholder={px7(calculatedTpPrice)}
                            className="no-spin"
                            style={{
                              flex: 1,
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--tx)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                          <span style={{ fontSize: '10px', color: 'var(--green)', fontWeight: 600 }}>+{effectiveTpPct}%</span>
                        </div>
                      )}
                    </div>

                    {/* Stop-Loss Row */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--red)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <TrendingDown size={12} /> Stop Loss (-{effectiveSlPct}%)
                        </span>
                        <span style={{ color: 'var(--tx)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          ${px7(calculatedSlPrice)}
                        </span>
                      </div>

                      {tpSlInputMode === 'percent' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                          {[5, 10, 15, 25].map(pct => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => setSlPct(pct)}
                              style={{
                                padding: '4px 0',
                                borderRadius: '4px',
                                fontSize: '10px',
                                fontWeight: slPct === pct ? 700 : 500,
                                cursor: 'pointer',
                                background: slPct === pct ? 'rgba(239, 68, 68, 0.22)' : 'var(--input)',
                                border: `1px solid ${slPct === pct ? '#EF4444' : 'var(--line)'}`,
                                color: slPct === pct ? '#EF4444' : 'var(--dim)',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              -{pct}%
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 8px' }}>
                          <span style={{ color: 'var(--dim)', fontSize: '12px', fontWeight: 600 }}>$</span>
                          <input
                            type="number"
                            step={curProject.price >= 100 ? "0.01" : curProject.price >= 1 ? "0.001" : "any"}
                            value={customSlPrice}
                            onChange={e => setCustomSlPrice(e.target.value)}
                            placeholder={px7(calculatedSlPrice)}
                            className="no-spin"
                            style={{
                              flex: 1,
                              background: 'transparent',
                              border: 'none',
                              outline: 'none',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: 'var(--tx)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          />
                          <span style={{ fontSize: '10px', color: 'var(--red)', fontWeight: 600 }}>-{effectiveSlPct}%</span>
                        </div>
                      )}
                    </div>

                    {/* ===== INSTITUTIONAL TRIGGER PREVIEW CARD ===== */}
                    <div
                      style={{
                        padding: '10px',
                        borderRadius: '7px',
                        background: 'var(--panel)',
                        border: '1px solid var(--line)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {/* Price Bracket Visualizer */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--dim)', marginBottom: '3px' }}>
                          <span style={{ color: 'var(--red)', fontWeight: 600 }}>SL: ${px7(calculatedSlPrice)}</span>
                          <span style={{ color: 'var(--tx)', fontWeight: 700 }}>Entry: ${px7(effectivePrice)}</span>
                          <span style={{ color: 'var(--green)', fontWeight: 600 }}>TP: ${px7(calculatedTpPrice)}</span>
                        </div>
                        {/* Bracket Range Bar */}
                        <div style={{ height: '6px', borderRadius: '3px', background: 'var(--input)', display: 'flex', overflow: 'hidden', position: 'relative' }}>
                          <div style={{ width: '40%', height: '100%', background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.8), rgba(239, 68, 68, 0.2))' }} />
                          <div style={{ width: '2px', height: '100%', background: 'var(--tx)', zIndex: 2 }} />
                          <div style={{ width: '60%', height: '100%', background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.8))' }} />
                        </div>
                      </div>

                      {/* 2-Column PnL Projections */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '10.5px' }}>
                        <div style={{ padding: '6px 8px', borderRadius: '5px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                          <div style={{ fontSize: '9.5px', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ color: 'var(--green)' }}>●</span> Projected Profit
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--green)', marginTop: '2px' }}>
                            +${projectedTpGainUsdg.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDG
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--dim)' }}>
                            Trigger: Price ≥ ${px7(calculatedTpPrice)}
                          </div>
                        </div>

                        <div style={{ padding: '6px 8px', borderRadius: '5px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                          <div style={{ fontSize: '9.5px', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <span style={{ color: 'var(--red)' }}>●</span> Maximum Risk
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--red)', marginTop: '2px' }}>
                            -${projectedSlLossUsdg.toLocaleString('en-US', { minimumFractionDigits: 2 })} USDG
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--dim)' }}>
                            Trigger: Price ≤ ${px7(calculatedSlPrice)}
                          </div>
                        </div>
                      </div>

                      {/* Risk/Reward Ratio & Engine Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', borderTop: '1px solid var(--line)', paddingTop: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ color: 'var(--dim)' }}>R:R Ratio:</span>
                          <b style={{ color: 'var(--tx)' }}>{riskRewardRatio} : 1</b>
                          <span
                            style={{
                              padding: '1px 5px',
                              borderRadius: '3px',
                              fontSize: '9px',
                              fontWeight: 700,
                              background: +riskRewardRatio >= 2 ? 'rgba(16, 185, 129, 0.15)' : +riskRewardRatio >= 1 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: +riskRewardRatio >= 2 ? 'var(--green)' : +riskRewardRatio >= 1 ? '#F59E0B' : 'var(--red)',
                            }}
                          >
                            {+riskRewardRatio >= 2 ? 'Favorable' : +riskRewardRatio >= 1 ? 'Balanced' : 'High Risk'}
                          </span>
                        </div>
                        <div style={{ color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '9px', fontWeight: 600 }}>
                          <Zap size={9} />
                          <span>Robinhood Sequencer Triggers</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Order Breakdown / Summary Card */}
              <div
                style={{
                  margin: '6px 0 12px',
                  padding: '9px 11px',
                  borderRadius: '8px',
                  background: 'var(--inset)',
                  border: '1px solid var(--line)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '11.5px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--dim)', fontWeight: 500 }}>
                    Receive (est.)
                  </span>
                  <b
                    style={{
                      color: orderSide === 'BUY' ? 'var(--green)' : 'var(--tx)',
                      fontSize: '13px',
                      opacity: quotePending ? 0.55 : 1,
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    {quotePending && (orderSide === 'BUY' ? !receiveEstBuy : !receiveEstSell)
                      ? 'calculating\u2026'
                      : '~' + (orderSide === 'BUY' ? tokenLabel(receiveEstBuy) : quoteLabel(receiveEstSell))}
                  </b>
                </div>
                <div style={{ height: '1px', background: 'var(--line)', opacity: 0.7 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ft)' }}>
                  <span>Price ({orderType === 'LIMIT' ? 'Limit' : 'Market'})</span>
                  <span style={{ color: 'var(--mt)', fontWeight: 500 }}>
                    {isRwa && quote === 'USDG'
                      ? `$${effectivePrice.toFixed(2)} USDG`
                      : formatPriceWithUnit(effectivePrice, liveTrading ? quote : '$')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ft)' }}>
                  <span>Slippage Tolerance</span>
                  <span style={{ color: slippage > 3 ? 'var(--red)' : 'var(--mt)', fontWeight: 600 }}>
                    {slippage}% {slippage > 3 && '(High Risk)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ft)' }}>
                  <span>Min. Received</span>
                  <span style={{ color: 'var(--mt)', fontWeight: 500 }}>
                    ~{orderSide === 'BUY' ? tokenLabel(minReceivedBuy) : quoteLabel(minReceivedSell)}
                  </span>
                </div>
                {orderSide === 'BUY' && !!curveBuyQuote && curveBuyQuote.refund > 0n && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ft)' }}>
                    <span>Returned (over target)</span>
                    <span style={{ color: '#F59E0B', fontWeight: 600 }}>
                      {quoteLabel(Number(formatUnits(curveBuyQuote.refund, market.quoteDecimals)))}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ft)' }}>
                  <span>Tax</span>
                  <span style={{ color: (isRwaStock ? 0 : (curProject.creatorTax ?? 0)) === 0 ? 'var(--green)' : 'var(--mt)', fontWeight: 500 }}>
                    {`${isRwaStock ? 0 : (curProject.creatorTax ?? 0)}%`}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--ft)' }}>
                  <span>Price Impact</span>
                  <span style={{
                    color: dynamicPriceImpact > 3 ? 'var(--red)' : dynamicPriceImpact > 1 ? '#F59E0B' : 'var(--green)',
                    fontWeight: 600,
                    opacity: quotePending ? 0.55 : 1,
                    transition: 'opacity 120ms ease',
                  }}>
                    {dynamicPriceImpact < 0.05 ? '< 0.05%' : `${dynamicPriceImpact}%`}
                  </span>
                </div>
                {attachTpSl && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--dim)', borderTop: '1px dashed var(--line)', paddingTop: '4px', marginTop: '2px' }}>
                    <span>Attached Triggers</span>
                    <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                      TP: ${px7(calculatedTpPrice)} · SL: ${px7(calculatedSlPrice)}
                    </span>
                  </div>
                )}
              </div>

              {/* Wrong Network Warning Notice */}
              {isWrongChain && (
                <div
                  style={{
                    marginBottom: '10px',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    color: '#F59E0B',
                  }}
                >
                  <ShieldAlert size={14} style={{ flexShrink: 0 }} />
                  <span>Wallet on Chain ID {chainId}. Switch to Robinhood Chain (ID: 4663) to trade.</span>
                </div>
              )}

              {/* Big CTA Action Button */}
              {isWrongChain ? (
                <button
                  type="button"
                  onClick={handleSwitchToRobinhoodChain}
                  disabled={isSwitchingChain}
                  style={{
                    width: '100%',
                    height: '42px',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '13px',
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                    color: '#000000',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                    boxShadow: '0 4px 14px rgba(245, 158, 11, 0.32)',
                  }}
                >
                  <Zap size={16} strokeWidth={2.4} />
                  <span>{isSwitchingChain ? 'Switching Network...' : 'Switch to Robinhood Chain (ID: 4663)'}</span>
                </button>
              ) : (
                <>
                {liveTrading && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      marginBottom: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--green)',
                    }}
                    title={
                      market.graduated
                        ? 'Swaps go through QualyraSwapRouter into the Uniswap v4 pool.'
                        : 'Buys and sells go straight to this token\u2019s bonding curve.'
                    }
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)' }} />
                    <span>
                      Live on chain &middot; {market.graduated ? 'pool swap' : 'bonding curve'}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={onChainTrade.isPending || onChainTrade.swapUnavailable}
                  onClick={
                    orderType === 'LIMIT'
                      ? handleLimitSubmit
                      : (orderSide === 'BUY' ? handleBuy : handleSell)
                  }
                style={{
                  width: '100%',
                  height: '42px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  color: '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: orderType === 'LIMIT'
                    ? (orderSide === 'BUY'
                        ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                        : 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)')
                    : (orderSide === 'BUY'
                        ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)'
                        : 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'),
                  boxShadow: orderType === 'LIMIT'
                    ? '0 4px 14px rgba(245, 158, 11, 0.28)'
                    : (orderSide === 'BUY'
                        ? '0 4px 14px rgba(16, 185, 129, 0.28)'
                        : '0 4px 14px rgba(239, 68, 68, 0.28)'),
                }}
              >
                {orderType === 'LIMIT' ? (
                  <>
                    <Zap size={16} strokeWidth={2.4} />
                    <span>Place Limit {orderSide === 'BUY' ? 'Buy' : 'Sell'} (${curProject.tick})</span>
                  </>
                ) : (
                  orderSide === 'BUY' ? (
                    <>
                      <ArrowDownRight size={16} strokeWidth={2.4} />
                      <span>Buy ${curProject.tick}</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpRight size={16} strokeWidth={2.4} />
                      <span>Sell ${curProject.tick}</span>
                    </>
                  )
                )}
              </button>
                </>
            )}

              {/* Security Footnote */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '5px',
                  marginTop: '10px',
                  fontSize: '10.5px',
                  color: 'var(--dim)',
                }}
              >
                <ShieldCheck size={12} style={{ color: 'var(--green)', flexShrink: 0 }} />
                <span>
                  {isRwaStock
                    ? 'Robinhood stock token · priced per share × multiplier'
                    : curProject.status === 'graduated' || curProject.poolAddress
                    ? 'Non-custodial · Uniswap v4 pool, liquidity locked'
                    : 'Non-custodial · sell back to the curve any time'}
                </span>
              </div>
                </>
              )}
            </div>
  )
}

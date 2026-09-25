'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import {
  ArrowDown,
  ArrowLeftRight,
  ShieldCheck,
  Loader2,
  ChevronDown,
  Check,
  Wallet,
} from 'lucide-react'
import { useAccount } from 'wagmi'
import { useToast } from '@/components/ui/Toast'
import { getWalletBalances, saveWalletBalances } from '@/lib/storage'
import { formatPrice } from '@/lib/formatters'

export type OriginChainId = 'arbitrum' | 'ethereum' | 'base'
export type BridgeAsset = 'ETH' | 'USDG' | 'USDC'

interface OriginChainConfig {
  name: string
  short: string
  color: string
  timeEst: string
}

const ORIGIN_CHAINS: Record<OriginChainId, OriginChainConfig> = {
  arbitrum: {
    name: 'Arbitrum One',
    short: 'Arbitrum',
    color: '#12AAFF',
    timeEst: '~12s (Fast Confirmation)',
  },
  ethereum: {
    name: 'Ethereum Mainnet',
    short: 'Ethereum',
    color: '#627EEA',
    timeEst: '~2–4 min (L1 Blocks)',
  },
  base: {
    name: 'Base',
    short: 'Base',
    color: '#0052FF',
    timeEst: '~15s (Fast Relay)',
  },
}

const ASSET_INFO: Record<BridgeAsset, { name: string; defaultPrice: number; symbol: string }> = {
  ETH: { name: 'Ether', defaultPrice: 2800, symbol: 'ETH' },
  USDG: { name: 'Robinhood Global Dollar', defaultPrice: 1.0, symbol: 'USDG' },
  USDC: { name: 'USD Coin', defaultPrice: 1.0, symbol: 'USDC' },
}

export function AssetLogo({
  asset,
  chain,
  size = 18,
}: {
  asset: BridgeAsset
  chain?: OriginChainId
  size?: number
}) {
  const renderIcon = () => {
    if (asset === 'ETH') {
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
          <circle cx="16" cy="16" r="16" fill="#627EEA" />
          <path d="M16 4L15.8 4.7V20.2L16 20.4L23.4 16L16 4Z" fill="white" fillOpacity="0.85" />
          <path d="M16 4L8.6 16L16 20.4V4Z" fill="white" />
          <path d="M16 21.8L15.9 22V27.7L16 28L23.4 17.5L16 21.8Z" fill="white" fillOpacity="0.85" />
          <path d="M16 28V21.8L8.6 17.5L16 28Z" fill="white" />
          <path d="M16 20.4L23.4 16L16 12.7V20.4Z" fill="white" fillOpacity="0.5" />
          <path d="M8.6 16L16 20.4V12.7L8.6 16Z" fill="white" fillOpacity="0.85" />
        </svg>
      )
    }

    if (asset === 'USDG') {
      return (
        <Image
          src="/usdg-logo.png"
          alt="USDG"
          width={size}
          height={size}
          unoptimized
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
      )
    }

    // USDC (Official Circle USD Coin Vector Emblem)
    return (
      <svg width={size} height={size} viewBox="0 0 2000 2000" fill="none" style={{ flexShrink: 0 }}>
        <path
          d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z"
          fill="#2775CA"
        />
        <path
          d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z"
          fill="#FFFFFF"
        />
        <path
          d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z"
          fill="#FFFFFF"
        />
      </svg>
    )
  }

  if (!chain) {
    return renderIcon()
  }

  const badgeSize = Math.max(9, Math.round(size * 0.46))

  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {renderIcon()}
      <div
        style={{
          position: 'absolute',
          bottom: '-2px',
          right: '-2px',
          width: `${badgeSize + 3}px`,
          height: `${badgeSize + 3}px`,
          borderRadius: '50%',
          background: 'var(--panel, #FFFFFF)',
          border: '1.5px solid var(--panel, #FFFFFF)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
          zIndex: 2,
          overflow: 'hidden',
        }}
        title={`Network: ${ORIGIN_CHAINS[chain].name}`}
      >
        <ChainLogo chain={chain} size={badgeSize} />
      </div>
    </div>
  )
}

export function ChainLogo({ chain, size = 18 }: { chain: OriginChainId | 'robinhood'; size?: number }) {
  if (chain === 'robinhood') {
    return (
      <Image
        src="/robinhood-logo.webp"
        alt="Robinhood"
        width={size}
        height={size}
        unoptimized
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '4px',
          objectFit: 'contain',
          flexShrink: 0,
        }}
      />
    )
  }

  if (chain === 'arbitrum') {
    return (
      <svg width={size} height={size} viewBox="0 0 2500 2500" fill="none" style={{ flexShrink: 0 }}>
        {/* Navy Shield Base */}
        <path
          d="M226,760v980c0,63,33,120,88,152l849,490c54,31,121,31,175,0l849-490c54-31,88-89,88-152V760c0-63-33-120-88-152l-849-490c-54-31-121-31-175,0L314,608c-54,31-87,89-87,152H226z"
          fill="#213147"
        />
        {/* Light Blue Hexagon Rim */}
        <path
          d="M1250,155c6,0,12,2,17,5l918,530c11,6,17,18,17,30v1060c0,12-7,24-17,30l-918,530c-5,3-11,5-17,5s-12-2-17-5l-918-530c-11-6-17-18-17-30V719c0-12,7-24,17-30l918-530c5-3,11-5,17-5l0,0V155z M1250,0c-33,0-65,8-95,25L237,555c-59,34-95,96-95,164v1060c0,68,36,130,95,164l918,530c29,17,62,25,95,25s65-8,95-25l918-530c59-34,95-96,95-164V719c0-68-36-130-95-164L1344,25c-29-17-62-25-95-25l0,0H1250z"
          fill="#9DCCED"
        />
        {/* Electric Blue Chevrons */}
        <path
          d="M1435,1440l-121,332c-3,9-3,19,0,29l208,571l241-139l-289-793C1467,1422,1442,1422,1435,1440z"
          fill="#12AAFF"
        />
        <path
          d="M1678,882c-7-18-32-18-39,0l-121,332c-3,9-3,19,0,29l341,935l241-139L1678,883V882z"
          fill="#12AAFF"
        />
        {/* Navy Shield Inner Cutout */}
        <polygon points="642,2179 727,1947 897,2088 738,2234" fill="#213147" />
        {/* Official White Interlocking Ribbon Stripes (Arbitrum 'A') */}
        <path
          d="M1172,644H939c-17,0-33,11-39,27L401,2039l241,139l550-1507c5-14-5-28-19-28L1172,644z"
          fill="#FFFFFF"
        />
        <path
          d="M1580,644h-233c-17,0-33,11-39,27L738,2233l241,139l620-1701c5-14-5-28-19-28V644z"
          fill="#FFFFFF"
        />
      </svg>
    )
  }

  if (chain === 'ethereum') {
    return (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="16" cy="16" r="16" fill="#627EEA" />
        <path d="M16 6L15.8 6.5V20.2L16 20.4L22 16.5L16 6Z" fill="white" fillOpacity="0.85" />
        <path d="M16 6L10 16.5L16 20.4V6Z" fill="white" />
        <path d="M16 21.5L15.9 21.7V26.5L16 26.7L22 18L16 21.5Z" fill="white" fillOpacity="0.85" />
        <path d="M16 26.7V21.5L10 18L16 26.7Z" fill="white" />
      </svg>
    )
  }

  // Base
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="16" cy="16" r="16" fill="#0052FF" />
      <path
        d="M16 23.5C20.1421 23.5 23.5 20.1421 23.5 16C23.5 11.8579 20.1421 8.5 16 8.5C12.0239 8.5 8.77026 11.6025 8.51556 15.5137H18.5663V16.4863H8.51556C8.77026 20.3975 12.0239 23.5 16 23.5Z"
        fill="white"
      />
    </svg>
  )
}

export function TradeBridgePanel() {
  const { toast } = useToast()
  const { isConnected } = useAccount()

  const [originChain, setOriginChain] = useState<OriginChainId>('arbitrum')
  const [asset, setAsset] = useState<BridgeAsset>('ETH')
  const [amount, setAmount] = useState<string>('0.5')
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [stepMessage, setStepMessage] = useState('')

  // Dropdown states
  const [chainDropdownOpen, setChainDropdownOpen] = useState(false)
  const [assetDropdownOpen, setAssetDropdownOpen] = useState(false)
  const chainRef = useRef<HTMLDivElement>(null)
  const assetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chainRef.current && !chainRef.current.contains(e.target as Node)) {
        setChainDropdownOpen(false)
      }
      if (assetRef.current && !assetRef.current.contains(e.target as Node)) {
        setAssetDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Simulated origin balances on external chain
  const originBalance = asset === 'ETH' ? 4.85 : 5000.0

  const numericAmount = parseFloat(amount) || 0
  const usdValue = numericAmount * ASSET_INFO[asset].defaultPrice
  const estFee = asset === 'ETH' ? 0.000018 : 0.05
  const receiveAmount = Math.max(0, numericAmount - (asset === 'ETH' ? estFee : 0.05))

  const setPercent = (pct: number) => {
    const val = (originBalance * pct).toFixed(asset === 'ETH' ? 4 : 2)
    setAmount(val)
  }

  const handleExecuteBridge = async () => {
    if (!isConnected) {
      toast({ title: 'Wallet Not Connected', message: 'Please connect your wallet first to bridge assets.', type: 'error' })
      return
    }
    if (!numericAmount || numericAmount <= 0) {
      toast({ title: 'Invalid Amount', message: 'Please enter a valid amount to bridge.', type: 'error' })
      return
    }

    if (numericAmount > originBalance) {
      toast({ title: 'Insufficient Balance', message: `Your ${ORIGIN_CHAINS[originChain].name} balance is insufficient.`, type: 'error' })
      return
    }

    setIsProcessing(true)
    setCurrentStep(1)
    setStepMessage(`Dispatching transfer from ${ORIGIN_CHAINS[originChain].name}...`)

    // Stage 1: Origin chain dispatch
    await new Promise(r => setTimeout(r, 1200))
    setCurrentStep(2)
    setStepMessage('Origin fast soft-confirmation verified...')

    // Stage 2: Sequencer verification
    await new Promise(r => setTimeout(r, 1400))
    setCurrentStep(3)
    setStepMessage('Crediting balance to Robinhood Chain (ID: 4663)...')

    // Stage 3: Complete & update wallet state
    await new Promise(r => setTimeout(r, 900))

    try {
      const current = getWalletBalances()
      if (asset === 'ETH') {
        saveWalletBalances({ ...current, eth: current.eth + numericAmount })
      } else {
        saveWalletBalances({ ...current, usdg: current.usdg + numericAmount })
      }
    } catch (e) {
      console.error('Failed to update local balances', e)
    }

    setIsProcessing(false)

    toast({
      title: 'Bridge Deposit Confirmed',
      message: `Successfully bridged +${numericAmount} ${asset} to Robinhood Chain!`,
      type: 'success',
    })
  }

  return (
    <div className="trade-bridge-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* From Network Box (With Dropdown Selector) */}
      <div
        ref={chainRef}
        style={{
          background: 'var(--inset)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '9px 10px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--dim)', fontWeight: 600 }}>From Origin Network</span>
          <span style={{ fontSize: '10.5px', color: 'var(--dim)' }}>
            Balance: <strong suppressHydrationWarning style={{ color: 'var(--tx)' }}>{originBalance.toLocaleString('en-US', { minimumFractionDigits: asset === 'ETH' ? 2 : 0, maximumFractionDigits: 4 })} {asset}</strong>
          </span>
        </div>

        {/* Chain Selector Trigger Button */}
        <button
          type="button"
          onClick={() => setChainDropdownOpen(prev => !prev)}
          disabled={isProcessing}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--panel)',
            border: chainDropdownOpen ? '1px solid var(--brand)' : '1px solid var(--line)',
            borderRadius: '7px',
            padding: '7px 10px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            transition: 'all 0.18s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ChainLogo chain={originChain} size={19} />
            <div style={{ textAlign: 'left' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--tx)', display: 'block' }}>
                {ORIGIN_CHAINS[originChain].name}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--dim)', display: 'block' }}>
                {ORIGIN_CHAINS[originChain].timeEst}
              </span>
            </div>
          </div>
          <ChevronDown
            size={14}
            style={{
              color: 'var(--dim)',
              transition: 'transform 0.2s ease',
              transform: chainDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </button>

        {/* Chain Selection Dropdown Menu */}
        {chainDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              right: 0,
              background: 'var(--modal-bg, #FFFFFF)',
              border: '1px solid var(--line)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
              zIndex: 50,
              padding: '4px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}
          >
            {(Object.keys(ORIGIN_CHAINS) as OriginChainId[]).map(chainKey => {
              const cfg = ORIGIN_CHAINS[chainKey]
              const active = originChain === chainKey
              return (
                <button
                  key={chainKey}
                  type="button"
                  onClick={() => {
                    setOriginChain(chainKey)
                    setChainDropdownOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: active ? 'rgba(var(--brand-rgb), 0.12)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget.style.background = 'var(--panel2)')
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget.style.background = 'transparent')
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ChainLogo chain={chainKey} size={20} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '12px', fontWeight: active ? 700 : 600, color: 'var(--tx)' }}>
                        {cfg.name}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--dim)' }}>
                        {cfg.timeEst}
                      </div>
                    </div>
                  </div>
                  {active && <Check size={14} style={{ color: 'var(--brand)' }} />}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Flow Direction Indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0' }}>
        <div
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
            zIndex: 2,
          }}
        >
          <ArrowDown size={12} strokeWidth={2.4} />
        </div>
      </div>

      {/* To Destination Box (With Official Robinhood Logo) */}
      <div
        style={{
          background: 'var(--inset)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: '10.5px', color: 'var(--dim)', fontWeight: 600 }}>To Destination</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px' }}>
            <ChainLogo chain="robinhood" size={20} />
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--tx)' }}>
              Robinhood Chain
            </span>
            <span
              className="mono"
              style={{
                fontSize: '9.5px',
                color: 'var(--dim)',
                background: 'var(--panel)',
                padding: '1px 5px',
                borderRadius: '4px',
                border: '1px solid var(--line)',
              }}
            >
              ID: 4663
            </span>
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '10px', color: 'var(--dim)' }}>Expected Finality</div>
          <div className="mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--brand)' }}>
            {ORIGIN_CHAINS[originChain].timeEst.split(' ')[0]}
          </div>
        </div>
      </div>

      {/* Asset Selection & Amount Input (With Interactive Token Dropdown) */}
      <div
        ref={assetRef}
        style={{
          background: 'var(--inset)',
          border: '1px solid var(--line)',
          borderRadius: '8px',
          padding: '9px 10px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', color: 'var(--dim)', fontWeight: 600 }}>Deposit Amount</span>
          <span style={{ fontSize: '10.5px', color: 'var(--dim)' }}>
            Available: <strong suppressHydrationWarning style={{ color: 'var(--tx)' }}>{originBalance.toLocaleString('en-US', { minimumFractionDigits: asset === 'ETH' ? 2 : 0, maximumFractionDigits: 4 })} {asset}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="number"
            min="0"
            step={asset === 'ETH' ? '0.01' : '1'}
            value={amount}
            disabled={isProcessing}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.0"
            style={{
              flex: 1,
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: '6px',
              padding: '8px 10px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: 'var(--tx)',
              outline: 'none',
              minWidth: 0,
            }}
          />

          {/* Asset Dropdown Trigger Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setAssetDropdownOpen(prev => !prev)}
              disabled={isProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--panel)',
                border: assetDropdownOpen ? '1px solid var(--brand)' : '1px solid var(--line)',
                borderRadius: '7px',
                padding: '6px 10px',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                transition: 'all 0.18s ease',
              }}
              title="Select Asset to Bridge"
            >
              <AssetLogo asset={asset} chain={originChain} size={21} />
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)' }}>{asset}</span>
              <ChevronDown
                size={13}
                style={{
                  color: 'var(--dim)',
                  transition: 'transform 0.2s ease',
                  transform: assetDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              />
            </button>

            {/* Asset Selection Dropdown Menu */}
            {assetDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  right: 0,
                  width: '220px',
                  background: 'var(--modal-bg, #FFFFFF)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                  zIndex: 60,
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {(['ETH', 'USDG', 'USDC'] as BridgeAsset[]).map(a => {
                  const info = ASSET_INFO[a]
                  const active = asset === a
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => {
                        setAsset(a)
                        setAssetDropdownOpen(false)
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '7px 9px',
                        borderRadius: '6px',
                        border: 'none',
                        background: active ? 'rgba(var(--brand-rgb), 0.12)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        if (!active) (e.currentTarget.style.background = 'var(--panel2)')
                      }}
                      onMouseLeave={e => {
                        if (!active) (e.currentTarget.style.background = 'transparent')
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AssetLogo asset={a} chain={originChain} size={22} />
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '12px', fontWeight: active ? 800 : 700, color: 'var(--tx)' }}>
                            {a}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--dim)' }}>
                            {info.name} · on {ORIGIN_CHAINS[originChain].short}
                          </div>
                        </div>
                      </div>
                      {active && <Check size={13} style={{ color: 'var(--brand)' }} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* USD Equivalent Preview */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <span style={{ fontSize: '10.5px', color: 'var(--dim)' }}>
            ≈ ${formatPrice(usdValue, false)} USD
          </span>
        </div>

        {/* Quick Percent Chips */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '6px' }}>
          {[
            { label: '25%', val: 0.25 },
            { label: '50%', val: 0.5 },
            { label: '75%', val: 0.75 },
            { label: 'MAX', val: 1.0 },
          ].map(chip => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setPercent(chip.val)}
              disabled={isProcessing}
              style={{
                border: '1px solid var(--line)',
                background: 'var(--panel)',
                color: 'var(--tx)',
                borderRadius: '5px',
                padding: '4px 0',
                fontSize: '10px',
                fontWeight: 600,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sequencer & Gas Fee Info Box */}
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '7px',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '11px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--dim)' }}>
          <span>Est. Receive Amount</span>
          <strong style={{ color: 'var(--tx)' }}>
            {receiveAmount > 0 ? receiveAmount.toFixed(asset === 'ETH' ? 4 : 2) : '0.00'} {asset}
          </strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--dim)' }}>
          <span>Robinhood Sequencer Fee</span>
          <span className="mono" style={{ color: 'var(--brand)', fontWeight: 600 }}>
            ~{estFee} {asset === 'ETH' ? 'ETH ($0.05)' : 'USDG'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--dim)' }}>
          <span>Estimated Speed</span>
          <span style={{ color: 'var(--tx)', fontWeight: 500 }}>
            {ORIGIN_CHAINS[originChain].timeEst}
          </span>
        </div>
      </div>

      {/* Stepper Progress Bar (when processing) */}
      {isProcessing && (
        <div
          style={{
            background: 'var(--inset)',
            border: '1px solid var(--brand)',
            borderRadius: '8px',
            padding: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Loader2 size={13} className="spin" style={{ color: 'var(--brand)' }} />
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--tx)' }}>
              {stepMessage}
            </span>
          </div>

          {/* 3 Step Visual Meter */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', height: '4px' }}>
            <div style={{ borderRadius: '2px', background: 'var(--brand)' }} />
            <div style={{ borderRadius: '2px', background: currentStep >= 2 ? 'var(--brand)' : 'var(--line)' }} />
            <div style={{ borderRadius: '2px', background: currentStep >= 3 ? 'var(--brand)' : 'var(--line)' }} />
          </div>
        </div>
      )}

      {/* Main Bridge Execution Button */}
      <button
        type="button"
        onClick={handleExecuteBridge}
        disabled={isProcessing || !numericAmount || numericAmount <= 0}
        className="btn btn-brand"
        style={{
          width: '100%',
          height: '42px',
          borderRadius: '8px',
          fontWeight: 800,
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          cursor: isProcessing || !numericAmount || numericAmount <= 0 ? 'not-allowed' : 'pointer',
          opacity: isProcessing || !numericAmount || numericAmount <= 0 ? 0.6 : 1,
          boxShadow: '0 4px 14px rgba(var(--brand-rgb), 0.28)',
          marginTop: '2px',
        }}
      >
        {!isConnected ? (
          <>
            <Wallet size={14} />
            <span>Connect Wallet to Bridge</span>
          </>
        ) : isProcessing ? (
          <>
            <Loader2 size={14} className="spin" />
            <span>Processing Deposit...</span>
          </>
        ) : (
          <>
            <ArrowLeftRight size={14} strokeWidth={2.4} />
            <span>Bridge {asset} to Robinhood Chain</span>
          </>
        )}
      </button>

      {/* Security note */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', color: 'var(--dim)', fontSize: '10px' }}>
        <ShieldCheck size={11} style={{ color: 'var(--brand)' }} />
        <span>Private Sequencer FIFO · MEV Protected · Fast Finality</span>
      </div>
    </div>
  )
}

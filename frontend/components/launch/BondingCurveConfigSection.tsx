'use client'

import { type RefObject, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown } from 'lucide-react'
import { RwaLogo } from '@/components/stocks/RwaLogo'

interface BondingCurveConfigSectionProps {
  pairAssets: Array<{ symbol: string; address: string; graduationTarget: number }>
  pairAssetsLive: boolean
  chainId: number
  quoteAsset: string
  setQuoteAssetPick: (sym: string) => void
  pairOpen: boolean
  setPairOpen: Dispatch<SetStateAction<boolean>>
  pairRef: RefObject<HTMLDivElement | null>
  goal: string
  displayTicker: string
  firstBuy: string
  setFirstBuy: (v: string) => void
}

export function BondingCurveConfigSection({
  pairAssets,
  pairAssetsLive,
  chainId,
  quoteAsset,
  setQuoteAssetPick,
  pairOpen,
  setPairOpen,
  pairRef,
  goal,
  displayTicker,
  firstBuy,
  setFirstBuy,
}: BondingCurveConfigSectionProps) {
  return (
    <div className="fsec">
      <h4><span className="n">02</span> Bonding Curve</h4>
      <p>Two-way curve trading until graduation. Price is mathematically determined.</p>
      <div className="f2">
        <div className="fi">
          <label>Total Supply</label>
          <div
            className="inp"
            style={{ background: 'var(--inset)', display: 'flex', alignItems: 'center', fontWeight: 600 }}
            title="Every Qualyra token mints exactly 1 billion, with no owner and no mint function."
          >
            1,000,000,000
          </div>
        </div>
        <div className="fi">
          <label style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
            <span>Trading Pair / Quote Asset</span>
            <span
              style={{ fontSize: '11px', fontWeight: 600, color: pairAssetsLive ? 'var(--green)' : 'var(--dim)' }}
              title={
                pairAssetsLive
                  ? `Read from the factory on chain ${chainId}, so it follows whatever the timelock has listed.`
                  : `No Qualyra factory is configured for chain ${chainId}. Connect a wallet on a chain where it is deployed, or set its address in .env.local and restart the dev server.`
              }
            >
              {pairAssetsLive ? 'from contract' : `not on chain ${chainId}`}
            </span>
          </label>
          <div ref={pairRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="inp"
              onClick={() => setPairOpen(o => !o)}
              aria-haspopup="listbox"
              aria-expanded={pairOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                fontWeight: 600,
              }}
            >
              <RwaLogo ticker={quoteAsset} size={22} />
              <span>{quoteAsset}</span>
              <ChevronDown
                size={15}
                style={{ marginLeft: 'auto', color: 'var(--dim)', transform: pairOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}
              />
            </button>

            {pairOpen && (
              <div
                role="listbox"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  zIndex: 30,
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderRadius: '8px',
                  padding: '4px',
                  boxShadow: '0 8px 24px rgba(0,0,0,.28)',
                }}
              >
                {pairAssets.map(asset => (
                  <button
                    key={asset.address}
                    type="button"
                    role="option"
                    aria-selected={asset.symbol === quoteAsset}
                    onClick={() => {
                      setQuoteAssetPick(asset.symbol)
                      setPairOpen(false)
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--tx)',
                      background: asset.symbol === quoteAsset ? 'var(--brand-dim)' : 'transparent',
                    }}
                  >
                    <RwaLogo ticker={asset.symbol} size={22} />
                    <span>{asset.symbol}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="f2" style={{ marginTop: '12px' }}>
        <div className="fi">
          <label>Graduation target ({quoteAsset})</label>
          <div
            className="inp"
            style={{ background: 'var(--inset)', display: 'flex', alignItems: 'center', fontWeight: 600 }}
            title="Set by the factory per pair asset, the same for every launch. Creators do not choose it."
          >
            {goal} {quoteAsset}
          </div>
        </div>
        <div className="fi">
          <label>Market Pair</label>
          <div
            className="inp"
            style={{
              background: 'var(--inset)',
              display: 'flex',
              alignItems: 'center',
              fontWeight: 600,
              userSelect: 'none',
            }}
          >
            <span style={{ color: 'var(--tx)' }}>{displayTicker}</span>
            <span style={{ color: 'var(--dim)', margin: '0 6px' }}>/</span>
            <span style={{ color: 'var(--brand)' }}>{quoteAsset}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '12px' }}>
        <div className="fi" style={{ marginBottom: '6px' }}>
          <label>Your first buy <span className="dim">(optional)</span></label>
          <div style={{ position: 'relative' }}>
            <input
              className="inp"
              inputMode="decimal"
              placeholder="0.0"
              value={firstBuy}
              onChange={e => setFirstBuy(e.target.value.replace(/[^0-9.]/g, ''))}
              style={{ paddingRight: '58px', fontWeight: 600 }}
            />
            <span
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--dim)',
                pointerEvents: 'none',
              }}
            >
              {quoteAsset}
            </span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ft)' }}>
        Bought through the launch router in the same transaction as the launch, so nobody can buy before
        you and there is no slippage to set. The snipe tax never applies to you; the 1% trading fee still does.
      </div>
    </div>
  )
}

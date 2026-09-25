'use client'

import { Wallet } from 'lucide-react'
import { RwaLogo } from '@/components/stocks/RwaLogo'

interface StocksHeroBannerProps {
  assetCount: number
  /** Listed tokens the factory accepts as pair assets on this network. Null until the list is read. */
  pairCount: number | null
  isConnected: boolean
  address?: string
  ethBalance?: { formatted?: string }
  isEthLoading: boolean
  /** Null until read from the chain. */
  usdgBalance: number | null
}

export function StocksHeroBanner({
  assetCount,
  pairCount,
  isConnected,
  address,
  ethBalance,
  isEthLoading,
  usdgBalance,
}: StocksHeroBannerProps) {
  return (
    <div className="sec">
      <div
        className="panel rwa-hero-grid"
        style={{
          padding: '28px 34px',
          background: 'linear-gradient(135deg,var(--panel) 60%,rgba(var(--brand-rgb),.08))',
          borderColor: 'rgba(var(--brand-rgb),.35)',
        }}
      >
        <div>
          <div className="k" style={{ color: 'var(--brand)', letterSpacing: '.14em', marginBottom: '10px' }}>
            🏦 ROBINHOOD CHAIN · STOCK TOKENS
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px', letterSpacing: '-0.02em' }}>
            Stock Tokens as Launch Pairs
          </h2>
          <p style={{ color: 'var(--mt)', fontSize: '14.5px', lineHeight: 1.7, maxWidth: '780px' }}>
            Robinhood issues tokens for US stocks and ETFs on Robinhood Chain. Qualyra lists the official
            contracts as pair assets, so you can launch a token priced in a stock like NVDA: trades, fees and
            the pool after graduation all settle in that stock token. Pairing only sets the unit of price. It
            doesn&apos;t back the token or put a floor under it.
          </p>
          <div className="rwa-stats-grid">
            <div
              className="panel"
              style={{
                padding: '16px 20px',
                borderRadius: '10px',
                textAlign: 'center',
                minWidth: '140px',
                flex: '1 1 140px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                {assetCount}
              </div>
              <div className="k" style={{ fontSize: '10.5px' }}>Tokens Listed</div>
            </div>

            <div
              className="panel"
              style={{
                padding: '16px 20px',
                borderRadius: '10px',
                textAlign: 'center',
                minWidth: '140px',
                flex: '1 1 140px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                {pairCount ?? '—'}
              </div>
              <div
                className="k"
                style={{ fontSize: '10.5px', color: 'var(--ft)' }}
                title="Stock tokens on this page that the factory accepts as pair assets on this network"
              >
                Launch Pairs
              </div>
            </div>

            <div
              className="panel"
              style={{
                padding: '16px 20px',
                borderRadius: '10px',
                textAlign: 'center',
                minWidth: '140px',
                flex: '1 1 140px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <RwaLogo ticker="USDG" size={19} showChainBadge={true} />
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--tx)' }}>USDG</span>
                </div>
                <span style={{ color: 'var(--dim)', fontSize: '12px', fontWeight: 600 }}>/</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <RwaLogo ticker="ETH" size={19} showChainBadge={true} />
                  <span style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--tx)' }}>ETH</span>
                </div>
              </div>
              <div className="k" style={{ fontSize: '10.5px', color: 'var(--green)' }}>Other Pair Assets</div>
            </div>

            <div
              className="panel"
              style={{
                padding: '16px 20px',
                borderRadius: '10px',
                textAlign: 'center',
                minWidth: '140px',
                flex: '1 1 140px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--brand)', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                24/5
              </div>
              <div className="k" style={{ fontSize: '10.5px', color: 'var(--brand)' }} title="Monday 02:00 to Saturday 02:00 CET/CEST">
                Mint &amp; Redeem
              </div>
            </div>
          </div>
        </div>

        <div
          className="panel"
          style={{
            borderRadius: '14px',
            padding: '22px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minWidth: '270px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'linear-gradient(90deg, var(--brand), #0ECB81)' }} />
          
          <div
            style={{
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '52px',
              height: '52px',
              borderRadius: '12px',
              background: 'rgba(var(--brand-rgb), 0.12)',
              border: '1px solid rgba(var(--brand-rgb), 0.25)',
              color: 'var(--brand)',
            }}
          >
            <Wallet size={28} strokeWidth={2.2} />
          </div>

          <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx)', marginBottom: '3px', letterSpacing: '0.04em', textAlign: 'center' }}>
            YOUR WALLET
          </div>

          <div style={{ fontSize: '11px', color: 'var(--brand)', fontWeight: 700, marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            PAIR ASSET BALANCES
          </div>

          <div style={{ fontSize: '11.5px', color: 'var(--mt)', lineHeight: 1.6, textAlign: 'center', width: '100%' }}>
            <div
              style={{
                fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                background: 'var(--inset)',
                border: '1px solid var(--line)',
                padding: '8px 12px',
                borderRadius: '7px',
                fontSize: '11px',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ color: 'var(--ft)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {isConnected ? 'ONCHAIN WALLET' : 'WALLET'}
                </span>
                <span style={{ color: isConnected ? '#0ECB81' : 'var(--ft)', fontSize: '10px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  {isConnected ? (
                    <>
                      <span className="livedot" style={{ width: '5px', height: '5px', margin: 0 }} />
                      {address?.slice(0, 6)}...{address?.slice(-4)}
                    </>
                  ) : (
                    <>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--ft)' }} />
                      Disconnected
                    </>
                  )}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--dim)', fontSize: '11px' }}>
                  {isConnected ? 'ETH Balance:' : 'Your Balance:'}
                </span>
                <b style={{ color: isConnected ? 'var(--brand)' : 'var(--dim)', fontSize: '11.5px' }}>
                  {!isConnected
                    ? '—'
                    : isEthLoading
                    ? '...'
                    : `${parseFloat(ethBalance?.formatted || '0').toFixed(4)} ETH`}
                </b>
              </div>

              {isConnected && usdgBalance !== null && usdgBalance > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3px' }}>
                  <span style={{ color: 'var(--dim)', fontSize: '10.5px' }}>USDG Balance:</span>
                  <b style={{ color: 'var(--tx)', fontSize: '11px' }}>
                    {usdgBalance.toLocaleString('en-US')} USDG
                  </b>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

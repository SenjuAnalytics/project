'use client'

import { useChainId } from 'wagmi'
import { SoonBadge } from '@/components/ui/SoonBadge'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { explorerUrl, resolveTargetChainId } from '@/lib/contracts'
import { 
  Zap, 
  Award, 
  ArrowUpRight, 
  TrendingUp, 
  ArrowLeftRight 
} from 'lucide-react'

interface PortfolioHeroBannerProps {
  isConnected: boolean
  address?: string
  totalNetWorth: number
  usdgNumber: number
  ethNumber: number
  ethValueUsd: number
  posValueUsd: number
  positionCount: number
  totalClaimableFeesUsd: number
  creatorProjectsCount: number
}

export function PortfolioHeroBanner({
  isConnected,
  address,
  totalNetWorth,
  usdgNumber,
  ethNumber,
  ethValueUsd,
  posValueUsd,
  positionCount,
  totalClaimableFeesUsd,
  creatorProjectsCount,
}: PortfolioHeroBannerProps) {
  const explorer = explorerUrl(resolveTargetChainId(useChainId()))

  return (
    <div className="sec">
      <div className="sec-hd">
        <div>
          <h3>Portfolio Dashboard</h3>
          <p className="dim" style={{ fontSize: '13px', marginTop: '4px' }}>
            Real-time onchain analytics, asset allocation, and rewards on Robinhood Chain.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn"
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              height: '34px',
              fontSize: '12.5px',
              padding: '0 14px',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'not-allowed',
              opacity: 0.6,
            }}
            title="Bridging will go through an existing bridge. Not wired up yet."
          >
            <ArrowLeftRight size={13} strokeWidth={2.4} />
            <span>Bridge Assets</span>
            <SoonBadge />
          </button>
          {isConnected && address && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="livedot" />
              <a
                href={`${explorer}/address/${address}`}
                target="_blank"
                rel="noreferrer"
                className="link mono"
                style={{ fontSize: '12.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <span>{address.slice(0, 6)}…{address.slice(-4)}</span>
                <ArrowUpRight size={13} strokeWidth={2} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Not connected alert */}
      {!isConnected && (
        <div
          className="panel"
          style={{
            padding: '16px 20px',
            marginBottom: '16px',
            background: 'linear-gradient(135deg, var(--panel) 70%, rgba(var(--brand-rgb),.1))',
            borderColor: 'rgba(var(--brand-rgb),.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <div>
            <b style={{ color: 'var(--brand)', fontSize: '14px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Zap size={15} />
              <span>Wallet Not Connected</span>
            </b>
            <p style={{ fontSize: '12.5px', color: 'var(--mt)', marginTop: '2px' }}>
              Connect your Web3 wallet to load your live Robinhood Chain balances, active positions, and claimable fee rewards. Showing preview data below.
            </p>
          </div>
          <ConnectButton />
        </div>
      )}

      {/* 4 Portfolio Overview Cards */}
      <div className="stat4">
        <div className="panel" style={{ padding: '20px' }}>
          <div className="k" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <TrendingUp size={13} style={{ color: 'var(--brand)' }} />
            <span>EST. TOTAL NET WORTH</span>
          </div>
          <div className="v" style={{ fontSize: '26px', fontWeight: 700, color: 'var(--brand)', marginTop: '6px' }}>
            ${isConnected ? totalNetWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--dim)', fontWeight: 600, marginTop: '4px' }}>
            {isConnected ? 'Real-time onchain valuation' : 'Connect wallet to load balances'}
          </div>
        </div>

        <div className="panel" style={{ padding: '20px' }}>
          <div className="k">LIQUID CASH &amp; ETH</div>
          <div className="v" style={{ fontSize: '22px', fontWeight: 700, marginTop: '6px' }}>
            ${isConnected ? usdgNumber.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}{' '}
            <span style={{ fontSize: '13px', color: 'var(--dim)', fontWeight: 600 }}>USDG</span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--dim)', marginTop: '4px' }}>
            + {isConnected ? ethNumber.toFixed(4) : '0.0000'} ETH (≈ ${isConnected ? Math.round(ethValueUsd).toLocaleString('en-US') : '0'})
          </div>
        </div>

        <div className="panel" style={{ padding: '20px' }}>
          <div className="k">ACTIVE TOKEN HOLDINGS</div>
          <div className="v" style={{ fontSize: '22px', fontWeight: 700, marginTop: '6px' }}>
            ${isConnected ? posValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}{' '}
            <span style={{ fontSize: '13px', color: 'var(--dim)', fontWeight: 600 }}>USD</span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--dim)', marginTop: '4px' }}>
            Across {positionCount} active token position{positionCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="panel" style={{ padding: '20px' }}>
          <div className="k" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Award size={13} style={{ color: 'var(--brand)' }} />
            <span>CLAIMABLE CREATOR FEES</span>
          </div>
          <div className="v" style={{ fontSize: '22px', fontWeight: 700, color: totalClaimableFeesUsd > 0 ? '#10B981' : 'var(--tx)', marginTop: '6px' }}>
            ${totalClaimableFeesUsd.toFixed(2)}{' '}
            <span style={{ fontSize: '13px', color: 'var(--dim)', fontWeight: 600 }}>USD</span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--dim)', marginTop: '4px' }}>
            From {creatorProjectsCount} launched token{creatorProjectsCount === 1 ? '' : 's'} in Fee Vault
          </div>
        </div>
      </div>
    </div>
  )
}

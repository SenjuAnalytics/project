'use client'

import { useLaunchFee } from '@/lib/useQualyraLaunch'

interface DeployReviewSectionProps {
  isWrongChain: boolean
  chainId: number
  switchChainAsync?: (args: { chainId: number }) => Promise<unknown>
  isSwitchingChain: boolean
  creatorTax: number
  blockingIssue: string
  handleDeploy: () => void
}

export function DeployReviewSection({
  isWrongChain,
  chainId,
  switchChainAsync,
  isSwitchingChain,
  creatorTax,
  blockingIssue,
  handleDeploy,
}: DeployReviewSectionProps) {
  const launchFee = useLaunchFee()
  const handleSwitchNetwork = async () => {
    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: 4663 })
      }
    } catch (err: unknown) {
      const errCode = (err as { code?: number })?.code
      if (errCode === 4902 || String(err).includes('4902')) {
        if (typeof window !== 'undefined' && (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }).ethereum) {
          await (window as unknown as { ethereum: { request: (args: unknown) => Promise<unknown> } }).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x1237',
              chainName: 'Robinhood Chain',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.mainnet.chain.robinhood.com'],
              blockExplorerUrls: ['https://robinhoodchain.blockscout.com'],
            }],
          })
        }
      }
    }
  }

  return (
    <div className="fsec">
      <h4><span className="n">05</span> Deploy to Robinhood Chain</h4>
      <p>Transparent protocol fees. Zero hidden slippage.</p>

      {isWrongChain && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            marginBottom: '16px',
            fontSize: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#F59E0B', fontWeight: 700 }}>
            <span>Unsupported Network (Chain ID: {chainId})</span>
          </div>
          <div style={{ color: 'var(--mt)' }}>
            Your wallet is currently connected to another network. Please switch to Robinhood Chain (ID: 4663) to deploy tokens.
          </div>
          <button
            type="button"
            onClick={handleSwitchNetwork}
            disabled={isSwitchingChain}
            className="btn"
            style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              color: '#000000',
              fontWeight: 800,
              border: 'none',
              padding: '8px 14px',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {isSwitchingChain ? 'Switching...' : 'Switch to Robinhood Chain (ID: 4663)'}
          </button>
        </div>
      )}

      <div className="fee-tbl" style={{ marginBottom: '18px' }}>
        <div className="cstat">
          <span className="l">Launch Fee</span>
          <span className="v">{launchFee ?? '—'}</span>
        </div>
        <div className="cstat">
          <span className="l">Trading Fee</span>
          <span className="v">1% (70% creator / 15% platform / 15% competition)</span>
        </div>
        <div className="cstat">
          <span className="l">Creator Tax</span>
          <span className="v">{creatorTax}% (0-5%, locked at launch)</span>
        </div>
        <div className="cstat">
          <span className="l">Liquidity You Provide</span>
          <span className="v">None (the curve raises it)</span>
        </div>
      </div>
      <button
        type="button"
        className="btn btn-brand btn-block"
        onClick={isWrongChain || blockingIssue ? undefined : handleDeploy}
        disabled={isWrongChain || !!blockingIssue}
        style={isWrongChain || blockingIssue ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
      >
        {isWrongChain ? 'Switch Network to Deploy' : blockingIssue || 'Deploy Token Now'}
      </button>
    </div>
  )
}

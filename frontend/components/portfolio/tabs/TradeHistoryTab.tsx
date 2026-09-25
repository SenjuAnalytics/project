'use client'

import { ArrowUpRight } from 'lucide-react'
import { useChainId } from 'wagmi'
import { explorerUrl, resolveTargetChainId } from '@/lib/contracts'
import { tickerColor, px7, formatTokenAmount } from '@/lib/utils'
import { RwaLogo } from '@/components/stocks/RwaLogo'
import { RobinhoodBadge } from '@/components/shared/RobinhoodBadge'
import { type TradeFill } from '@/lib/storage'

interface TradeHistoryTabProps {
  fills: TradeFill[]
  isConnected: boolean
  onSelectPair: (id: string) => void
}

export function TradeHistoryTab({
  fills,
  isConnected,
  onSelectPair,
}: TradeHistoryTabProps) {
  const explorer = explorerUrl(resolveTargetChainId(useChainId()))

  return (
    <div className="tbl-scroll">
      <table>
        <thead>
          <tr>
            <th style={{ width: '100px' }}>Time</th>
            <th>Pair</th>
            <th style={{ width: '90px' }}>Side</th>
            <th>Price</th>
            <th>Amount</th>
            <th>Total Value</th>
            <th>1% Fee</th>
            <th style={{ textAlign: 'right' }}>TX Hash</th>
          </tr>
        </thead>
        <tbody>
          {fills.map(f => {
            const tick = (f.tick || f.pair.split(' ')[0] || '').replace('$', '').trim()
            const isRwaFill = tick.startsWith('r')
            const tokenName = tick === 'PONS' ? 'Pons' : tick === 'AI' ? 'Artificial Inu' : tick
            const quote = f.pair.includes('/') ? f.pair.split('/')[1].trim() : 'USD'

            return (
              <tr key={f.id} className="row" onClick={() => onSelectPair(tick.toLowerCase())}>
                <td>
                  <span className="mono" style={{ color: 'var(--dim)', fontSize: '12.5px' }}>
                    {f.time}
                  </span>
                </td>
                <td>
                  <div className="pair" style={{ gap: '10px' }}>
                    <div style={{ position: 'relative', display: 'inline-flex', width: '28px', height: '28px', flexShrink: 0 }}>
                      {isRwaFill ? (
                        <RwaLogo ticker={tick} size={28} showChainBadge={false} />
                      ) : (
                        <div
                          className="coin"
                          style={{
                            background: tickerColor(tick),
                            width: '28px',
                            height: '28px',
                            fontSize: '10.5px',
                            borderRadius: '7px',
                          }}
                        >
                          {tick.slice(0, 2)}
                        </div>
                      )}
                      <RobinhoodBadge size={11} />
                    </div>
                    <div>
                      <div className="pn">
                        ${tick} <span style={{ color: 'var(--dim)', fontSize: '11px', fontWeight: 400 }}>/ {quote}</span>
                      </div>
                      <div className="ps" style={{ fontSize: '11px' }}>{tokenName}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={`chip ${f.side === 'BUY' ? 'up' : 'dn'}`}
                    style={{
                      fontWeight: 600,
                      fontSize: '11px',
                      minWidth: '56px',
                      height: '22px',
                      padding: '0 8px',
                      borderRadius: '4px',
                    }}
                  >
                    {f.side}
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--mt)', fontSize: '13px' }}>
                    ${px7(f.price, quote === 'USD')}
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--mt)', fontSize: '13px' }}>
                    {formatTokenAmount(f.amount, quote === 'USD')}
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--mt)', fontSize: '13px' }}>
                    {quote === 'USD' ? `$${f.total.toFixed(2)}` : `${f.total.toFixed(4)} ${quote}`}
                  </span>
                </td>
                <td>
                  <span style={{ fontWeight: 600, color: 'var(--dim)', fontSize: '13px' }}>
                    {quote === 'USD' ? `$${f.fee.toFixed(2)}` : `${f.fee.toFixed(4)} ${quote}`}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                  <a
                    href={f.tx && f.tx.startsWith('0x') ? `${explorer}/tx/${f.tx}` : explorer}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 600,
                      color: 'var(--brand)',
                      background: 'var(--input)',
                      padding: '4px 8px',
                      borderRadius: '5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      border: '1px solid var(--line)',
                      textDecoration: 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{f.tx}</span>
                    <ArrowUpRight size={12} style={{ color: 'var(--dim)' }} />
                  </a>
                </td>
              </tr>
            )
          })}
          {fills.length === 0 && (
            <tr>
              <td colSpan={8} style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--dim)' }}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📜</div>
                <div style={{ fontWeight: 600, color: 'var(--tx)', fontSize: '14px', marginBottom: '4px' }}>
                  No Trade Fills Recorded Yet
                </div>
                <div style={{ fontSize: '12px', maxWidth: '380px', margin: '0 auto' }}>
                  {isConnected
                    ? 'Trades executed with this wallet on the bonding curve or AMM will appear here.'
                    : 'Connect your wallet to view your onchain trade history.'}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

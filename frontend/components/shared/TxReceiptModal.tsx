'use client'

// Receipt for a transaction this app just sent. The caller only hands over the hash and a title; every
// other field is read back from the chain, so what the modal shows is what actually happened.

import React, { useEffect, useState } from 'react'
import { useBlock, useChainId, useWaitForTransactionReceipt } from 'wagmi'
import { decodeEventLog, erc20Abi, formatEther, type Abi, type Log } from 'viem'
import { AlertTriangle, ArrowRight, Check, Copy, ExternalLink, Layers, Loader2, X } from 'lucide-react'
import {
  explorerUrl,
  resolveTargetChainId,
  qualyraBondingCurveAbi,
  qualyraBuybackBurnerAbi,
  qualyraCompetitionVaultAbi,
  qualyraFactoryAbi,
  qualyraFeeVaultAbi,
  qualyraHookAbi,
  qualyraLaunchRouterAbi,
  qualyraSwapRouterAbi,
} from '@/lib/contracts'

export type TxReceiptRequest = {
  txHash: `0x${string}`
  actionTitle: string
}

export function openTxReceipt(request: TxReceiptRequest) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('qualyra:open-receipt', { detail: request }))
}

// Every event the platform emits, plus ERC-20 transfers and approvals, to name the logs.
const EVENTS = [
  ...qualyraFactoryAbi,
  ...qualyraBondingCurveAbi,
  ...qualyraCompetitionVaultAbi,
  ...qualyraFeeVaultAbi,
  ...qualyraBuybackBurnerAbi,
  ...qualyraHookAbi,
  ...qualyraLaunchRouterAbi,
  ...qualyraSwapRouterAbi,
  ...erc20Abi,
].filter(item => item.type === 'event') as Abi

const short = (value: string) => (value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value)

function describeLog(log: Log): { name: string; params: [string, string][] } {
  try {
    const decoded = decodeEventLog({ abi: EVENTS, data: log.data, topics: log.topics })
    const args = decoded.args ?? {}
    const entries = Array.isArray(args) ? args.map((v, i) => [String(i), v] as const) : Object.entries(args)
    return {
      name: decoded.eventName ?? 'Unknown',
      params: entries.map(([k, v]) => [k, typeof v === 'string' && v.startsWith('0x') ? short(v) : String(v)]),
    }
  } catch {
    return { name: log.topics[0] ? `Unknown ${log.topics[0].slice(0, 10)}` : 'Unknown', params: [] }
  }
}

const row: React.CSSProperties = {
  padding: '10px 14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--line2)',
  gap: '10px',
}

export function TxReceiptModal() {
  const [request, setRequest] = useState<TxReceiptRequest | null>(null)
  const [copied, setCopied] = useState(false)
  const chainId = resolveTargetChainId(useChainId())
  const explorer = explorerUrl(chainId)

  const { data: receipt, isError } = useWaitForTransactionReceipt({
    hash: request?.txHash,
    chainId,
    query: { enabled: !!request },
  })
  const { data: block } = useBlock({
    blockNumber: receipt?.blockNumber,
    chainId,
    query: { enabled: receipt !== undefined },
  })

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<TxReceiptRequest>).detail
      if (detail?.txHash) {
        setRequest(detail)
        setCopied(false)
      }
    }
    window.addEventListener('qualyra:open-receipt', handleOpen)
    return () => window.removeEventListener('qualyra:open-receipt', handleOpen)
  }, [])

  if (!request) return null

  const handleCopyHash = () => {
    navigator.clipboard.writeText(request.txHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const reverted = receipt?.status === 'reverted'
  const gasFee = receipt ? formatEther(receipt.gasUsed * receipt.effectiveGasPrice) : undefined
  const logs = receipt?.logs.map(describeLog) ?? []

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={() => setRequest(null)}
    >
      <div
        className="panel"
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '12px',
          border: '1px solid rgba(var(--brand-rgb), 0.35)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5), 0 0 20px rgba(var(--brand-rgb), 0.15)',
          background: 'var(--modal-bg, #FFFFFF)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--inset)',
          }}
        >
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx)', letterSpacing: '-0.01em' }}>
              Transaction Receipt
            </div>
            <div style={{ fontSize: '11px', color: 'var(--dim)', marginTop: '2px' }}>{request.actionTitle}</div>
          </div>
          <button
            type="button"
            onClick={() => setRequest(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: '4px', display: 'flex' }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: reverted ? 'rgba(239, 68, 68, 0.08)' : 'var(--inset)',
              border: `1px solid ${reverted ? 'rgba(239, 68, 68, 0.35)' : 'var(--line)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12.5px',
              fontWeight: 700,
              color: reverted ? 'var(--red)' : receipt ? 'var(--green)' : 'var(--dim)',
            }}
          >
            {!receipt && !isError && <Loader2 size={14} style={{ animation: 'chartSpin 1s linear infinite' }} />}
            {receipt && !reverted && <Check size={14} strokeWidth={3} />}
            {(reverted || isError) && <AlertTriangle size={14} />}
            <span>
              {isError
                ? 'Could not read this transaction from the chain.'
                : !receipt
                  ? 'Waiting for the transaction to be included…'
                  : reverted
                    ? `Reverted in block #${receipt.blockNumber.toLocaleString('en-US')}`
                    : `Confirmed in block #${receipt.blockNumber.toLocaleString('en-US')}`}
            </span>
          </div>

          <div style={{ borderRadius: '8px', border: '1px solid var(--line)', background: 'var(--inset)', overflow: 'hidden', fontSize: '12px' }}>
            <div style={row}>
              <span style={{ color: 'var(--dim)', flexShrink: 0 }}>Transaction Hash</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                <span className="mono" style={{ color: 'var(--tx)', fontWeight: 600, fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {request.txHash.slice(0, 16)}…{request.txHash.slice(-10)}
                </span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? 'var(--green)' : 'var(--dim)', padding: '2px 4px' }}
                  title="Copy hash"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div style={row}>
              <span style={{ color: 'var(--dim)' }}>Timestamp</span>
              <span style={{ color: 'var(--mt)' }}>
                {block ? new Date(Number(block.timestamp) * 1000).toUTCString() : '—'}
              </span>
            </div>

            <div style={row}>
              <span style={{ color: 'var(--dim)' }}>From / To</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }} className="mono">
                <span style={{ color: 'var(--mt)' }}>{receipt ? short(receipt.from) : '—'}</span>
                <ArrowRight size={11} style={{ color: 'var(--ft)' }} />
                <span style={{ color: 'var(--brand)', fontWeight: 700 }}>{receipt?.to ? short(receipt.to) : '—'}</span>
              </div>
            </div>

            <div style={{ ...row, borderBottom: 'none' }}>
              <span style={{ color: 'var(--dim)' }}>Network Fee</span>
              <span className="mono" style={{ color: 'var(--tx)', fontWeight: 600 }}>{gasFee ? `${gasFee} ETH` : '—'}</span>
            </div>
          </div>

          {logs.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={13} style={{ color: 'var(--brand)' }} />
                <span>Events ({logs.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {logs.map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '6px',
                      background: 'var(--panel2)',
                      border: '1px solid var(--line)',
                      fontSize: '11px',
                      lineHeight: 1.6,
                    }}
                  >
                    <div className="mono" style={{ color: 'var(--brand)', fontWeight: 700, marginBottom: log.params.length > 0 ? '4px' : 0 }}>
                      {log.name}
                    </div>
                    {log.params.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '8px', borderLeft: '2px solid var(--line2)' }}>
                        {log.params.map(([name, value]) => (
                          <div key={name} style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ color: 'var(--dim)', minWidth: '60px' }}>{name}:</span>
                            <span className="mono" style={{ color: 'var(--tx)', wordBreak: 'break-all' }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--line)',
            background: 'var(--inset)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
          }}
        >
          <a
            href={`${explorer}/tx/${request.txHash}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '11.5px', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 600 }}
          >
            <span>View on explorer</span>
            <ExternalLink size={12} />
          </a>
          <button
            type="button"
            className="btn btn-brand"
            style={{ fontSize: '12px', padding: '6px 16px', fontWeight: 700 }}
            onClick={() => setRequest(null)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

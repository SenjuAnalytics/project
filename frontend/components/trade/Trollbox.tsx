'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, MessageSquare, Trophy } from 'lucide-react'
import { useAccount } from 'wagmi'
import {
  type TrollboxMessage,
  getStoredTrollboxMessages,
  saveTrollboxMessage,
} from '@/lib/storage'
import { nowTime } from '@/lib/utils'

interface TrollboxProps {
  pairId: string
  pairTick: string
  userHolding: number
  isCreator: boolean
}

export function Trollbox({ pairId, pairTick, userHolding, isCreator }: TrollboxProps) {
  const { address } = useAccount()
  const [messages, setMessages] = useState<TrollboxMessage[]>([])
  const [inputText, setInputText] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Sync real messages
  useEffect(() => {
    const sync = () => {
      setMessages(getStoredTrollboxMessages(pairId))
    }
    sync()

    const handleUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail && detail.pairId === pairId.toLowerCase()) {
        sync()
      }
    }

    window.addEventListener('qualyra:trollbox-updated', handleUpdate)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('qualyra:trollbox-updated', handleUpdate)
      window.removeEventListener('storage', sync)
    }
  }, [pairId])

  // Scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return

    const userRole: TrollboxMessage['role'] = isCreator
      ? 'creator'
      : userHolding > 10000
      ? 'whale'
      : userHolding > 0
      ? 'holder'
      : 'trader'

    const senderShort = address ? `You (${address.slice(0, 6)}...${address.slice(-4)})` : 'Guest Trader'

    const newMsg: TrollboxMessage = {
      id: `user-${Date.now()}`,
      pairId: pairId.toLowerCase(),
      sender: address || '0xGuest',
      senderShort,
      role: userRole,
      text: trimmed,
      time: nowTime().slice(0, 5),
      isUser: true,
      holding: userHolding > 0 ? userHolding : undefined,
    }

    saveTrollboxMessage(pairId, newMsg)
    setInputText('')
  }

  const handleQuickReaction = (emoji: string) => {
    setInputText(prev => (prev ? `${prev} ${emoji}` : emoji))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--panel)' }}>
      {/* Trollbox Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--inset)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={13} style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--tx)' }}>
            ${pairTick} Community Trollbox
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10B981',
              display: 'inline-block',
              boxShadow: '0 0 6px #10B981',
            }}
          />
          <span style={{ fontSize: '10.5px', color: '#10B981', fontWeight: 600 }}>
            Live on Robinhood Chain
          </span>
        </div>
      </div>

      {/* Message Stream */}
      <div
        ref={scrollRef}
        data-scroll="trollbox"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          overscrollBehavior: 'contain',
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: '12px', padding: '24px 0' }}>
            No messages yet. Be the first to drop alpha about ${pairTick}! 🚀
          </div>
        ) : (
          messages.map(m => {
            const isTradeAlert = m.isTradeAlert
            const isUserMsg = m.isUser

            return (
              <div
                key={m.id}
                style={{
                  padding: isTradeAlert ? '7px 9px' : '6px 8px',
                  borderRadius: '6px',
                  background: isTradeAlert
                    ? 'rgba(16, 185, 129, 0.08)'
                    : isUserMsg
                    ? 'rgba(var(--brand-rgb), 0.08)'
                    : 'var(--panel2)',
                  border: isTradeAlert
                    ? '1px solid rgba(16, 185, 129, 0.25)'
                    : isUserMsg
                    ? '1px solid rgba(var(--brand-rgb), 0.2)'
                    : '1px solid var(--line2)',
                  fontSize: '11.5px',
                  lineHeight: '1.4',
                }}
              >
                {/* Meta Row: Sender, Role Badge, Time */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '11px',
                        color: isUserMsg ? 'var(--brand)' : isTradeAlert ? '#10B981' : 'var(--tx)',
                      }}
                    >
                      {m.senderShort}
                    </span>

                    {/* Role Badges */}
                    {m.role === 'creator' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                          color: '#000',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}
                      >
                        <Trophy size={9} /> DEV
                      </span>
                    )}
                    {m.role === 'whale' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
                          color: '#fff',
                        }}
                      >
                        🐳 WHALE
                      </span>
                    )}
                    {m.role === 'holder' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#3B82F6',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                        }}
                      >
                        💎 HOLDER
                      </span>
                    )}
                    {m.role === 'bot' && (
                      <span
                        style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10B981',
                        }}
                      >
                        ⚡ BOT
                      </span>
                    )}
                    {m.holding && m.holding > 0 && (
                      <span style={{ fontSize: '9.5px', color: 'var(--dim)', fontVariantNumeric: 'tabular-nums' }}>
                        ({m.holding >= 1000 ? `${(m.holding / 1000).toFixed(1)}k` : m.holding} ${pairTick})
                      </span>
                    )}
                  </div>

                  <span style={{ fontSize: '9.5px', color: 'var(--ft)', flexShrink: 0 }}>
                    {m.time}
                  </span>
                </div>

                {/* Message Body */}
                <div style={{ color: isTradeAlert ? '#10B981' : 'var(--mt)', wordBreak: 'break-word' }}>
                  {m.text}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Quick Emojis Bar */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '4px 10px',
          background: 'var(--inset)',
          borderTop: '1px solid var(--line2)',
          flexShrink: 0,
          overflowX: 'auto',
        }}
      >
        {['🚀', '💎', '🐂', '🐻', '🔥', '💰', '👑', '👀'].map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleQuickReaction(emoji)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '2px 5px',
              borderRadius: '4px',
              transition: 'background .1s',
            }}
            title={`Add ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        style={{
          display: 'flex',
          gap: '6px',
          padding: '8px 10px',
          borderTop: '1px solid var(--line)',
          background: 'var(--panel)',
          flexShrink: 0,
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          placeholder={`Chat about $${pairTick}...`}
          style={{
            flex: 1,
            background: 'var(--input)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '6px 10px',
            fontSize: '11.5px',
            color: 'var(--tx)',
            outline: 'none',
            minWidth: 0,
          }}
          maxLength={180}
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          style={{
            background: inputText.trim() ? 'var(--brand)' : 'var(--input)',
            color: inputText.trim() ? '#000' : 'var(--dim)',
            border: '1px solid var(--line)',
            borderRadius: '6px',
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: inputText.trim() ? 'pointer' : 'default',
            transition: 'all .15s ease',
          }}
          title="Send message"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  )
}

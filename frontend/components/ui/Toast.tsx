'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastItem {
  id: string
  title: string
  message?: string
  type: ToastType
  duration?: number
  action?: ToastAction
}

export interface ToastOptions {
  title: string
  message?: string
  type?: ToastType
  duration?: number
  action?: ToastAction
}

interface ToastContextValue {
  toast: {
    (options: ToastOptions): void
    success: (title: string, message?: string, duration?: number, action?: ToastAction) => void
    error: (title: string, message?: string, duration?: number, action?: ToastAction) => void
    info: (title: string, message?: string, duration?: number, action?: ToastAction) => void
    warning: (title: string, message?: string, duration?: number, action?: ToastAction) => void
  }
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback(
    ({ title, message, type = 'info', duration = 4500, action }: ToastOptions) => {
      const id = Math.random().toString(36).substring(2, 9)
      const newToast: ToastItem = { id, title, message, type, duration, action }
      setToasts(prev => [...prev, newToast])

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }
    },
    [removeToast]
  )

  const toastHelpers = Object.assign(
    (opts: ToastOptions) => addToast(opts),
    {
      success: (title: string, message?: string, duration?: number, action?: ToastAction) =>
        addToast({ title, message, type: 'success', duration: duration || (action ? 7000 : 4500), action }),
      error: (title: string, message?: string, duration?: number, action?: ToastAction) =>
        addToast({ title, message, type: 'error', duration, action }),
      info: (title: string, message?: string, duration?: number, action?: ToastAction) =>
        addToast({ title, message, type: 'info', duration, action }),
      warning: (title: string, message?: string, duration?: number, action?: ToastAction) =>
        addToast({ title, message, type: 'warning', duration, action }),
    }
  )

  return (
    <ToastContext.Provider value={{ toast: toastHelpers, removeToast }}>
      {children}
      {/* Toast Render Container - Positioned Top-Right below Navbar */}
      <div
        style={{
          position: 'fixed',
          top: '72px',
          right: '20px',
          zIndex: 99999,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '390px',
          width: 'calc(100vw - 32px)',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map(t => {
            const isSuccess = t.type === 'success'
            const isError = t.type === 'error'
            const isWarning = t.type === 'warning'

            const accentColor = isSuccess
              ? 'var(--green, #059669)'
              : isError
              ? 'var(--red, #E11D48)'
              : isWarning
              ? '#F59E0B'
              : 'var(--brand, #96C81A)'

            const bgDim = isSuccess
              ? 'var(--green-dim, rgba(14,203,129,0.12))'
              : isError
              ? 'var(--red-dim, rgba(246,70,93,0.12))'
              : isWarning
              ? 'rgba(245, 158, 11, 0.12)'
              : 'var(--brand-dim, rgba(150,200,26,0.12))'

            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, scale: 0.92, transition: { duration: 0.2 } }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                style={{
                  pointerEvents: 'auto',
                  background: 'var(--panel)',
                  border: '1px solid var(--line)',
                  borderLeft: `4px solid ${accentColor}`,
                  borderRadius: '10px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.06)',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Left Colored Status Indicator Icon */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: bgDim,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                    color: accentColor,
                  }}
                >
                  {isSuccess && <CheckCircle2 size={18} strokeWidth={2.4} />}
                  {isError && <AlertCircle size={18} strokeWidth={2.4} />}
                  {isWarning && <AlertTriangle size={18} strokeWidth={2.4} />}
                  {!isSuccess && !isError && !isWarning && <Info size={18} strokeWidth={2.4} />}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--tx)', letterSpacing: '-0.01em' }}>
                    {t.title}
                  </div>
                  {t.message && (
                    <div style={{ fontSize: '12px', color: 'var(--mt)', marginTop: '2px', lineHeight: 1.45 }}>
                      {t.message}
                    </div>
                  )}
                  {t.action && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          t.action?.onClick()
                          removeToast(t.id)
                        }}
                        style={{
                          padding: '3px 9px',
                          borderRadius: '4px',
                          background: 'rgba(var(--brand-rgb), 0.15)',
                          border: '1px solid rgba(var(--brand-rgb), 0.4)',
                          color: 'var(--brand)',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          pointerEvents: 'auto',
                        }}
                      >
                        {t.action.label}
                      </button>
                    </div>
                  )}
                </div>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => removeToast(t.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--dim)',
                    cursor: 'pointer',
                    padding: '2px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  title="Close notification"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

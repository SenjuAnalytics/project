'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'

const STORAGE_KEY_SLIPPAGE = 'qualyra_trade_slippage'
const SLIPPAGE_EVENT = 'qualyra:slippage-updated'
const DEFAULT_SLIPPAGE = 0.5

function parseSlippage(raw: string | null): number {
  if (!raw) return DEFAULT_SLIPPAGE
  const val = parseFloat(raw)
  if (!isNaN(val) && val > 0 && val <= 50) return val
  return DEFAULT_SLIPPAGE
}

/**
 * External-store subscription for the persisted slippage value.
 *
 * We use useSyncExternalStore instead of useState + useEffect so that:
 *  - The SERVER snapshot and the FIRST CLIENT render both return DEFAULT_SLIPPAGE,
 *    which avoids the React hydration mismatch (the server has no localStorage,
 *    so it must not render the stored value like 20%).
 *  - After hydration the client snapshot reads the real localStorage value, and
 *    updates propagate through the `storage` + custom events — no setState inside
 *    an effect (which the react-hooks/set-state-in-effect lint rule forbids).
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('storage', callback)
  window.addEventListener(SLIPPAGE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(SLIPPAGE_EVENT, callback)
  }
}

function getClientSnapshot(): number {
  try {
    return parseSlippage(localStorage.getItem(STORAGE_KEY_SLIPPAGE))
  } catch {
    return DEFAULT_SLIPPAGE
  }
}

function getServerSnapshot(): number {
  return DEFAULT_SLIPPAGE
}

/**
 * Slippage tolerance for the order form, persisted per browser.
 * `handleUpdateSlippage` is the only way to change it so the write always goes with it.
 */
export function useSlippageSettings() {
  const slippage = useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
  const [customSlippage, setCustomSlippage] = useState<string>('')
  const [showSlippageModal, setShowSlippageModal] = useState<boolean>(false)

  const handleUpdateSlippage = useCallback((val: number) => {
    try {
      localStorage.setItem(STORAGE_KEY_SLIPPAGE, val.toString())
      // Notify all subscribers in this tab (the native `storage` event only fires
      // in *other* tabs), so useSyncExternalStore re-reads the new value.
      window.dispatchEvent(new Event(SLIPPAGE_EVENT))
    } catch {}
  }, [])

  return {
    slippage,
    customSlippage,
    setCustomSlippage,
    showSlippageModal,
    setShowSlippageModal,
    handleUpdateSlippage,
  }
}

'use client'

import { useCallback, useEffect, useState, MouseEvent } from 'react'

const STORAGE_KEY_FAVS = 'qualyra_fav_pairs'
const DEFAULT_FAVS = ['pons', 'ai']

export interface FavoritesState {
  favs: Set<string>
  isFav: (id: string) => boolean
  toggleFav: (id: string, e?: MouseEvent) => void
}

/**
 * Single source of truth for starred favorite tokens across all views and components.
 * Automatically synchronizes between Drawer, Header, MarketsTable, and Search modals.
 */
export function useFavorites(): FavoritesState {
  const [favs, setFavs] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY_FAVS)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) return new Set(parsed)
        }
      } catch {}
    }
    return new Set(DEFAULT_FAVS)
  })

  useEffect(() => {
    const handleFavsUpdate = (e: Event) => {
      const detail = (e as CustomEvent<string[]>).detail
      if (detail && Array.isArray(detail)) {
        setFavs(new Set(detail))
      } else {
        try {
          const saved = localStorage.getItem(STORAGE_KEY_FAVS)
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) setFavs(new Set(parsed))
          }
        } catch {}
      }
    }

    window.addEventListener('qualyra:favorites-updated', handleFavsUpdate)
    window.addEventListener('storage', handleFavsUpdate)
    return () => {
      window.removeEventListener('qualyra:favorites-updated', handleFavsUpdate)
      window.removeEventListener('storage', handleFavsUpdate)
    }
  }, [])

  const isFav = useCallback((id: string) => favs.has(id.toLowerCase()), [favs])

  const toggleFav = useCallback((id: string, e?: MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    const cleanId = id.toLowerCase()
    setFavs(prev => {
      const next = new Set(prev)
      if (next.has(cleanId)) {
        next.delete(cleanId)
      } else {
        next.add(cleanId)
      }
      try {
        const arr = Array.from(next)
        localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(arr))
        window.dispatchEvent(new CustomEvent('qualyra:favorites-updated', { detail: arr }))
      } catch {}
      return next
    })
  }, [])

  return {
    favs,
    isFav,
    toggleFav,
  }
}

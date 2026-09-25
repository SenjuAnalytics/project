'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { ALL_INITIAL_PROJECTS, INITIAL_PROJECTS, RWA_PROJECTS, type Project } from '@/lib/data'
import { getStoredProjects } from '@/lib/storage'
import { useQualyraTokens } from '@/lib/useQualyraTokens'
import { useLivePrices, mergeProjectsWithLivePrices, type LivePriceItem } from '@/lib/useLivePrices'

const DEMO_EXAMPLE_IDS = ['pons', 'ai']
const DEMO_EXAMPLES: Project[] = INITIAL_PROJECTS.filter(p => DEMO_EXAMPLE_IDS.includes(p.id))

export interface AuthoritativePriceField {
  id: string
  price: number
  mcap: number
  vol24: number
  chg: number
}

export interface AllProjectsState {
  projects: Project[]
  chainProjects: Project[]
  chainLive: boolean
  tokenCount: number
  livePrices: Record<string, LivePriceItem>
  priceTrends: Record<string, 'up' | 'down' | null>
  setAuthoritativeFields: (fields: AuthoritativePriceField | null) => void
}

/**
 * Single source of truth for all token projects across the entire dApp.
 * Merges onchain factory launches, demo templates, RWA assets, and live DEX spot prices.
 */
export function useAllProjects(): AllProjectsState {
  const [projects, setProjects] = useState<Project[]>(ALL_INITIAL_PROJECTS)
  const { projects: chainProjects, isLive: chainLive, tokenCount } = useQualyraTokens()
  const { prices: livePrices, priceTrends } = useLivePrices(25000)

  const authoritativeFieldsRef = useRef<AuthoritativePriceField | null>(null)

  const setAuthoritativeFields = useCallback((fields: AuthoritativePriceField | null) => {
    authoritativeFieldsRef.current = fields
    if (fields) {
      setProjects(prev => {
        let changed = false
        const next = prev.map(p => {
          if (p.id !== fields.id) return p
          if (
            p.price === fields.price &&
            p.vol24 === fields.vol24 &&
            p.chg === fields.chg &&
            p.mcap === fields.mcap
          ) {
            return p
          }
          changed = true
          return {
            ...p,
            price: fields.price,
            mcap: fields.mcap,
            vol24: fields.vol24,
            chg: fields.chg,
          }
        })
        return changed ? next : prev
      })
    }
  }, [])

  useEffect(() => {
    const sync = () => {
      try {
        if (chainLive) {
          setProjects(() => {
            const base = [...chainProjects, ...DEMO_EXAMPLES, ...RWA_PROJECTS]
            const mergedBase = livePrices && Object.keys(livePrices).length > 0
              ? mergeProjectsWithLivePrices(base, livePrices)
              : base
            const auth = authoritativeFieldsRef.current
            if (!auth) return mergedBase
            return mergedBase.map(p =>
              p.id === auth.id
                ? { ...p, price: auth.price, mcap: auth.mcap, vol24: auth.vol24, chg: auth.chg }
                : p,
            )
          })
          return
        }

        const stored = getStoredProjects()
        const base = stored.length > 0 ? stored : ALL_INITIAL_PROJECTS
        setProjects(
          livePrices && Object.keys(livePrices).length > 0
            ? mergeProjectsWithLivePrices(base, livePrices)
            : base,
        )
      } catch (err) {
        console.error('[useAllProjects] Failed to sync projects:', err)
      }
    }

    sync()

    window.addEventListener('qualyra:projects-updated', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('qualyra:projects-updated', sync)
      window.removeEventListener('storage', sync)
    }
  }, [chainLive, chainProjects, livePrices])

  return {
    projects,
    chainProjects,
    chainLive,
    tokenCount: chainLive ? tokenCount : 0,
    livePrices,
    priceTrends,
    setAuthoritativeFields,
  }
}

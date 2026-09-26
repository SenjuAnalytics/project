'use client'

// The list of tokens launched on Qualyra, read from the factory.
//
// The factory keeps an enumerable list, so the markets page needs no indexer: `tokenCount` and `tokenAt`
// give every token, and each one's curve answers for its own price and progress. Whatever the interface
// stored with a token at launch — image, description, links — is read from the token's own `metadataURI`,
// which is a plain call rather than a log scan: RPCs cap `getLogs` ranges and answer with nothing when the
// range is too wide, so a log scan quietly loses every logo on a busy chain. Resolving that pointer is
// best-effort on top: a token still lists correctly when its metadata cannot be fetched.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useChainId, useReadContract, useReadContracts, useWatchContractEvent } from 'wagmi'
import { keepPreviousData } from '@tanstack/react-query'
import { erc20Abi, formatUnits, isAddress, type Address } from 'viem'
import { robinhoodChainTestnet } from './wagmi'

import { qualyraBondingCurveAbi, qualyraFactoryAbi, qualyraDeployment, isDeployed, NATIVE_PAIR_ASSET } from './contracts'
import { ipfsToHttp, resolveMetadata, type TokenMetadata } from './ipfs'
import { quoteToUsd } from './pricing'
import type { Project } from './data'
import type { UserPosition } from './storage'

/** Off-chain metadata for a token. Re-exported so existing callers keep importing it from here. */
export type { TokenMetadata }

/** Every Qualyra token carries the pointer it was launched with. */
const metadataUriAbi = [
  { type: 'function', name: 'metadataURI', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
] as const

/**
 * How often the on-chain numbers are read again.
 *
 * A price only moves when somebody trades, and nothing tells the page when that happened: `getLogs` and
 * `eth_call` are snapshots, not subscriptions. Without a timer the figures stay at whatever they were
 * when the page loaded, which is why the chart looked frozen until a reload.
 */
const CURVE_POLL_MS = 5000

/** Explorer per chain, so a token always links somewhere real. */
const EXPLORER: Record<number, string> = {
  4663: 'https://robinhoodchain.blockscout.com',
  46630: 'https://explorer.testnet.chain.robinhood.com',
}

/**
 * Fetches what each token's pointer refers to.
 *
 * Never throws. A gateway that is slow, rate-limited or missing the document costs that token its logo
 * and nothing else — it still lists, still prices, still trades.
 */
function useResolvedMetadata(uris: Record<string, string>): Record<string, TokenMetadata> {
  const [map, setMap] = useState<Record<string, TokenMetadata>>({})
  const key = Object.entries(uris)
    .map(([token, uri]) => token + '|' + uri)
    .sort()
    .join(',')

  const [prevKey, setPrevKey] = useState('')
  if (key !== prevKey) {
    setPrevKey(key)
    const validCount = Object.values(uris).filter(Boolean).length
    if (validCount === 0 && Object.keys(map).length > 0) {
      setMap({})
    }
  }

  useEffect(() => {
    const entries = Object.entries(uris).filter(([, uri]) => !!uri)
    if (entries.length === 0) {
      return
    }
    const controller = new AbortController()
    let cancelled = false

    ;(async () => {
      const resolved = await Promise.all(
        entries.map(async ([token, uri]) => [token, await resolveMetadata(uri, controller.signal)] as const),
      )
      if (cancelled) return
      const next: Record<string, TokenMetadata> = {}
      for (const [token, meta] of resolved) {
        if (meta) next[token] = meta
      }
      setMap(next)
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
    // The map is rebuilt from `key`, which already encodes every token and pointer in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return map
}

export type QualyraTokens = {
  projects: Project[]
  tokenCount: number
  /** True when the list came from the factory rather than being empty because nothing is deployed. */
  isLive: boolean
  isLoading: boolean
}

export function useQualyraTokens(): QualyraTokens {
  const connectedChainId = useChainId()
  const chainId = isDeployed(qualyraDeployment(connectedChainId)?.factory)
    ? connectedChainId
    : robinhoodChainTestnet.id

  const factory = qualyraDeployment(chainId)?.factory
  const poolManager = qualyraDeployment(chainId)?.poolManager
  const enabled = isDeployed(factory)

  const countQuery = useReadContract({
    address: factory,
    chainId,
    abi: qualyraFactoryAbi,
    functionName: 'tokenCount',
    query: { enabled },
  })
  const count = countQuery.data === undefined ? 0 : Number(countQuery.data)

  const addressQuery = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: factory,
      chainId,
      abi: qualyraFactoryAbi,
      functionName: 'tokenAt' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: enabled && count > 0, placeholderData: keepPreviousData },
  })

  const tokens = useMemo(
    () =>
      (addressQuery.data ?? [])
        .map(r => (r.status === 'success' ? (r.result as Address) : undefined))
        .filter((a): a is Address => !!a),
    [addressQuery.data],
  )

  // Per token: its launch record, its ERC-20 name and symbol, and the metadata pointer it was launched
  // with. Four calls in one batch, so the pointer costs no extra round trip.
  const PER_TOKEN = 4
  const launchQuery = useReadContracts({
    contracts: tokens.flatMap(token => [
      { address: factory, chainId, abi: qualyraFactoryAbi, functionName: 'getLaunch' as const, args: [token] as const },
      { address: token, chainId, abi: erc20Abi, functionName: 'name' as const },
      { address: token, chainId, abi: erc20Abi, functionName: 'symbol' as const },
      { address: token, chainId, abi: metadataUriAbi, functionName: 'metadataURI' as const },
    ]),
    query: { enabled: tokens.length > 0, placeholderData: keepPreviousData },
  })

  // Decimals and symbol of every non-native pair asset in use, read from the asset itself. USDG has 6
  // decimals and the stock tokens 18, so guessing either way misprices the other by 10^12.
  const quoteAssets = useMemo(() => {
    const seen = new Set<string>()
    for (let i = 0; i < tokens.length; i++) {
      const entry = launchQuery.data?.[i * PER_TOKEN]
      const raw = entry?.status === 'success' ? (entry.result as { quoteAsset?: Address; [key: number]: unknown } | undefined) : undefined
      const asset = (raw?.quoteAsset ?? (raw as unknown[] | undefined)?.[2]) as Address | undefined
      if (asset && isAddress(asset) && asset !== NATIVE_PAIR_ASSET) seen.add(asset.toLowerCase())
    }
    return [...seen] as Address[]
  }, [tokens, launchQuery.data])

  const quoteMetaQuery = useReadContracts({
    contracts: quoteAssets.flatMap(asset => [
      { address: asset, chainId, abi: erc20Abi, functionName: 'decimals' as const },
      { address: asset, chainId, abi: erc20Abi, functionName: 'symbol' as const },
    ]),
    query: { enabled: quoteAssets.length > 0 },
  })

  const curves = useMemo(() => {
    const out: (Address | undefined)[] = []
    for (let i = 0; i < tokens.length; i++) {
      const entry = launchQuery.data?.[i * PER_TOKEN]
      const raw = entry?.status === 'success' ? (entry.result as { curve?: Address; [key: number]: unknown } | undefined) : undefined
      const curve = (raw?.curve ?? (raw as unknown[] | undefined)?.[0]) as Address | undefined
      out.push(curve && isAddress(curve) ? curve : undefined)
    }
    return out
  }, [tokens, launchQuery.data])

  // Per curve: price, how much it has raised, its target and how far along it is.
  const curveQuery = useReadContracts({
    contracts: curves.flatMap(curve => {
      const target = curve && isAddress(curve) ? curve : ('0x0000000000000000000000000000000000000000' as Address)
      return [
        { address: target, chainId, abi: qualyraBondingCurveAbi, functionName: 'spotPrice' as const },
        { address: target, chainId, abi: qualyraBondingCurveAbi, functionName: 'quoteReserve' as const },
        { address: target, chainId, abi: qualyraBondingCurveAbi, functionName: 'graduationThreshold' as const },
        { address: target, chainId, abi: qualyraBondingCurveAbi, functionName: 'progressBps' as const },
        { address: target, chainId, abi: qualyraBondingCurveAbi, functionName: 'phantomQuote' as const },
      ]
    }),
    // Keeping the previous batch while the next poll is in flight stops the curve numbers (price,
    // reserves, progress) from collapsing to their `0n` defaults mid-refetch, which is what made the
    // graduated-token stats flicker to "—" every poll interval.
    query: {
      enabled: curves.some(Boolean),
      refetchInterval: CURVE_POLL_MS,
      placeholderData: keepPreviousData,
    },
  })

  // Per token: how much of it the Uniswap v4 PoolManager holds. After graduation the token's whole
  // pool lives in the v4 singleton, and since each launch token belongs to exactly one pool, its pooled
  // amount is simply the singleton's balanceOf for that token. The native/quote side is commingled
  // across every pool in the singleton, so it cannot be read the same way — it is derived from this
  // token reserve and the spot price when each project is assembled below.
  const poolReserveQuery = useReadContracts({
    contracts: tokens.map(token => ({
      address: token,
      chainId,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [poolManager as Address] as const,
    })),
    query: {
      enabled: tokens.length > 0 && isDeployed(poolManager),
      refetchInterval: CURVE_POLL_MS,
      placeholderData: keepPreviousData,
    },
  })

  // New listings, as they happen.
  //
  // `tokenCount`/`tokenAt` are snapshots: on their own the markets list only grows when the timer above
  // fires, so a freshly launched token takes up to a poll interval to appear. The factory emits
  // `TokenLaunched` on every launch and `TokenGraduated` when one moves to its pool — subscribing to both
  // and re-reading the registry the moment either lands makes a new token show up as it is created rather
  // than on the next tick. When no socket is configured this simply never fires and the poll still covers it.
  const refetchRegistry = useCallback(() => {
    countQuery.refetch()
    addressQuery.refetch()
  }, [countQuery, addressQuery])

  useWatchContractEvent({
    address: factory,
    chainId,
    abi: qualyraFactoryAbi,
    eventName: 'TokenLaunched',
    enabled,
    onLogs: refetchRegistry,
  })
  useWatchContractEvent({
    address: factory,
    chainId,
    abi: qualyraFactoryAbi,
    eventName: 'TokenGraduated',
    enabled,
    onLogs: refetchRegistry,
  })

  // Tokens from an older factory have no metadataURI getter; that call simply fails and they carry none.
  const metadataUris = useMemo(() => {
    const out: Record<string, string> = {}
    tokens.forEach((token, i) => {
      const entry = launchQuery.data?.[i * PER_TOKEN + 3]
      if (entry?.status === 'success' && typeof entry.result === 'string' && entry.result) {
        out[token.toLowerCase()] = entry.result
      }
    })
    return out
  }, [tokens, launchQuery.data])

  const metadata = useResolvedMetadata(metadataUris)

  return useMemo(() => {
    const isLoading =
      countQuery.isLoading || addressQuery.isLoading || launchQuery.isLoading || curveQuery.isLoading || quoteMetaQuery.isLoading
    if (!enabled) return { projects: [], tokenCount: 0, isLive: false, isLoading: false }
    if (isLoading) return { projects: [], tokenCount: count, isLive: false, isLoading: true }

    const explorer = EXPLORER[chainId]
    const projects: Project[] = []

    const quoteMeta = new Map<string, { symbol: string; decimals: number }>()
    quoteAssets.forEach((asset, i) => {
      const decimals = quoteMetaQuery.data?.[i * 2]
      const symbol = quoteMetaQuery.data?.[i * 2 + 1]
      if (decimals?.status === 'success' && symbol?.status === 'success') {
        quoteMeta.set(asset.toLowerCase(), { symbol: String(symbol.result), decimals: Number(decimals.result) })
      }
    })

    tokens.forEach((token, i) => {
      const launchEntry = launchQuery.data?.[i * PER_TOKEN]
      const nameEntry = launchQuery.data?.[i * PER_TOKEN + 1]
      const symbolEntry = launchQuery.data?.[i * PER_TOKEN + 2]
      if (launchEntry?.status !== 'success') return

      const rawLaunch = launchEntry.result as {
        curve?: Address
        creator?: Address
        quoteAsset?: Address
        launchedAt?: bigint
        creatorTaxBps?: number | bigint
        creatorShareBps?: number | bigint
        competitionShareBps?: number | bigint
        graduated?: boolean
        [key: number]: unknown
      }
      const launch = {
        curve: (rawLaunch?.curve ?? (rawLaunch as unknown[])?.[0]) as Address,
        creator: (rawLaunch?.creator ?? (rawLaunch as unknown[])?.[1]) as Address,
        quoteAsset: (rawLaunch?.quoteAsset ?? (rawLaunch as unknown[])?.[2]) as Address,
        launchedAt: BigInt((rawLaunch?.launchedAt ?? (rawLaunch as unknown[])?.[3] ?? 0) as bigint | number | string),
        creatorTaxBps: Number((rawLaunch?.creatorTaxBps ?? (rawLaunch as unknown[])?.[4] ?? 0) as number),
        // Only read by name: a record without the split must not pass for a 0% share.
        creatorShareBps: rawLaunch?.creatorShareBps === undefined ? undefined : Number(rawLaunch.creatorShareBps),
        competitionShareBps:
          rawLaunch?.competitionShareBps === undefined ? undefined : Number(rawLaunch.competitionShareBps),
        graduated: Boolean(rawLaunch?.graduated ?? (rawLaunch as unknown[])?.[10] ?? (rawLaunch as unknown[])?.[5] ?? false),
      }

      const num = (idx: number): bigint => {
        const e = curveQuery.data?.[i * 5 + idx]
        return e?.status === 'success' ? (e.result as bigint) : 0n
      }

      const nativeQuote = !launch.quoteAsset || launch.quoteAsset === NATIVE_PAIR_ASSET
      const pairMeta = nativeQuote ? { symbol: 'ETH', decimals: 18 } : quoteMeta.get(launch.quoteAsset.toLowerCase())
      // Without its decimals every amount would be off by orders of magnitude, so the token waits.
      if (!pairMeta) return
      const quoteSymbol = pairMeta.symbol
      // Curve prices are quoted per whole token in the pair asset's own decimals.
      const quoteDecimals = pairMeta.decimals
      // USDG is a dollar pair. Anything else that isn't ETH is a stock token.
      const stockPair = !nativeQuote && quoteSymbol.toUpperCase() !== 'USDG'

      const goal = Number(formatUnits(num(2), quoteDecimals))
      const progress = launch.graduated ? 100 : Math.min(100, Number(num(3)) / 100)
      const raised = launch.graduated
        ? goal
        : Number(formatUnits(num(1), quoteDecimals))

      // When graduated, bonding curve tokenReserve is 0 so spotPrice() reports 0n.
      // We compute the graduation spot price: (1.4 * 1.4 * goal) / (0.4 * 1B) = 4.9 * goal / 1B.
      const graduationPrice = goal > 0 ? (4.9 * goal) / 1_000_000_000 : 0
      const rawPriceNum = Number(formatUnits(num(0), quoteDecimals))
      const price = rawPriceNum > 0 ? rawPriceNum : launch.graduated ? graduationPrice : 0

      // Exact price at graduation (quoteReserve == graduationThreshold) for the chart's
      // "migrate" target line. Virtual-reserves constant product:
      //   gradPrice = spot * ((phantomQuote + graduationThreshold) / (phantomQuote + quoteReserve))^2
      // The ratio is dimensionless, so reuse the human `price` (no decimals math).
      let graduationTargetPrice: number | undefined
      {
        const phantom = num(4)
        const reserveNow = num(1)
        const gradThreshold = num(2)
        const denom = phantom + reserveNow
        if (!launch.graduated && gradThreshold > 0n && denom > 0n && reserveNow < gradThreshold && price > 0) {
          const ratio = Number(phantom + gradThreshold) / Number(denom)
          graduationTargetPrice = price * ratio * ratio
        }
      }

      // Live pool reserves for a graduated token. `pooledBase` is exact — the v4 singleton's balance of
      // this token — while `pooledQuote` is derived as reserve × spot price, because the singleton
      // commingles the native/quote side across all pools and it cannot be isolated with a balance read.
      let pooledBase: number | undefined
      let pooledQuote: number | undefined
      let pooledQuoteSymbol: string | undefined
      if (launch.graduated) {
        const reserveEntry = poolReserveQuery.data?.[i]
        const reserveRaw = reserveEntry?.status === 'success' ? (reserveEntry.result as bigint) : 0n
        const base = Number(formatUnits(reserveRaw, 18))
        if (base > 0) {
          pooledBase = base
          pooledQuoteSymbol = nativeQuote ? 'WETH' : quoteSymbol
          pooledQuote = price > 0 ? base * price : undefined
        }
      }

      const meta = metadata[token.toLowerCase()] ?? {}
      const symbol = symbolEntry?.status === 'success' ? String(symbolEntry.result) : token.slice(2, 6).toUpperCase()
      const name = nameEntry?.status === 'success' ? String(nameEntry.result) : symbol

      projects.push({
        id: token,
        name,
        tick: symbol,
        desc: meta.description ?? '',
        creator: `${launch.creator.slice(0, 6)}…${launch.creator.slice(-4)}`,
        price,
        // Fixed 1B supply, so market cap follows the curve price directly. The price is in the pair
        // asset, so it has to be converted before it can carry a dollar sign anywhere.
        mcap: quoteToUsd(price * 1_000_000_000, quoteSymbol),
        raised,
        goal,
        progress,
        graduationPrice: launch.graduated ? (graduationPrice > 0 ? graduationPrice : undefined) : graduationTargetPrice,
        graduatedAt: launch.graduated && Number(launch.launchedAt) > 0 ? Number(launch.launchedAt) : undefined,
        // These need trade history; the chart hook fills them in from events.
        holders: 0,
        vol24: 0,
        raw: 0,
        ret: '0%',
        chg: 0,
        seed: 0,
        status: launch.graduated ? 'graduated' : 'bonding',
        battle: 0,
        rwa: stockPair,
        rwaType: stockPair ? 'paired' : undefined,
        creatorTax: launch.creatorTaxBps / 100,
        entry: price,
        hi: price,
        lo: price,
        quoteAsset: quoteSymbol,
        pooledBase,
        pooledQuote,
        pooledQuoteSymbol,
        address: token,
        creatorAddress: launch.creator,
        quoteAssetAddress: launch.quoteAsset,
        launchedAt: Number(launch.launchedAt) || undefined,
        creatorShareBps: launch.creatorShareBps,
        competitionShareBps: launch.competitionShareBps,
        explorerUrl: explorer ? `${explorer}/token/${token}` : undefined,
        platform: undefined,
        logoUrl: ipfsToHttp(meta.image),
        logoFit: meta.logoFit,
        logoShape: meta.logoShape,
        logoBg: meta.logoBg,
        logoScale: meta.logoScale,
        website: meta.website,
        twitter: meta.twitter,
        telegram: meta.telegram,
        discord: meta.discord,
      })
    })

    return { projects, tokenCount: count, isLive: true, isLoading: false }
  }, [
    enabled,
    chainId,
    tokens,
    count,
    launchQuery.data,
    launchQuery.isLoading,
    curveQuery.data,
    curveQuery.isLoading,
    poolReserveQuery.data,
    countQuery.isLoading,
    addressQuery.isLoading,
    quoteAssets,
    quoteMetaQuery.data,
    quoteMetaQuery.isLoading,
    metadata,
  ])
}


/**
 * What the connected wallet actually holds of each Qualyra token, read with balanceOf.
 * A position exists because the chain says so, not because a trade was recorded locally.
 */
export function useQualyraPositions(projects: Project[]): { positions: UserPosition[]; isLoading: boolean } {
  const { address } = useAccount()
  const connectedChainId = useChainId()
  const chainId = isDeployed(qualyraDeployment(connectedChainId)?.factory)
    ? connectedChainId
    : robinhoodChainTestnet.id

  const tokens = useMemo(
    () => projects.filter(p => /^0x[0-9a-fA-F]{40}$/.test(p.id)).map(p => p),
    [projects],
  )

  const balances = useReadContracts({
    contracts: tokens.map(p => ({
      address: p.id as Address,
      chainId,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [address as Address] as const,
    })),
    query: { enabled: !!address && tokens.length > 0, refetchInterval: CURVE_POLL_MS },
  })

  return useMemo(() => {
    if (!address || tokens.length === 0) return { positions: [], isLoading: false }
    if (balances.isLoading || !balances.data) return { positions: [], isLoading: balances.isLoading }

    const positions: UserPosition[] = []
    tokens.forEach((project, i) => {
      const entry = balances.data?.[i]
      if (entry?.status !== 'success') return
      const raw = entry.result as bigint
      if (raw === 0n) return

      positions.push({
        id: project.id,
        tick: project.tick,
        name: project.name,
        balance: Number(formatUnits(raw, 18)),
        // Entry price needs trade history per token; until then the current price is the honest stand-in.
        entry: project.price,
        price: project.price,
        quoteAsset: project.quoteAsset,
        logoUrl: project.logoUrl,
        logoFit: project.logoFit,
        logoShape: project.logoShape,
        logoBg: project.logoBg,
        logoScale: project.logoScale,
        rwa: project.rwa,
      })
    })

    return { positions, isLoading: false }
  }, [address, tokens, balances.data, balances.isLoading])
}

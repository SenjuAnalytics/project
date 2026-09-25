'use client'

// Reads the pair assets a token can be launched against straight from the factory.
//
// The list lives in contract storage, not in the ABI, so it changes whenever the timelock lists or
// disables an asset — no frontend deploy needed. Until the contracts are deployed on a chain, the
// hook falls back to the constants in ./contracts, which mirror what the deploy script lists.

import { useMemo } from 'react'
import { useChainId, useReadContract, useReadContracts } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'

import {
  qualyraFactoryAbi,
  qualyraDeployment,
  isDeployed,
  resolveTargetChainId,
  NATIVE_PAIR_ASSET,
  LAUNCH_PAIR_ASSETS,
  GRADUATION_TARGET,
  PAIR_ASSET_DECIMALS,
  ROBINHOOD_PAIR_ASSETS,
  type Address,
} from './contracts'

export type PairAsset = {
  symbol: string
  /** NATIVE_PAIR_ASSET (the zero address) for native ETH. */
  address: Address
  decimals: number
  /** Graduation target in whole units of the asset. */
  graduationTarget: number
}

/** Used until the factory has an address on this chain. Mirrors DeployQualyra.s.sol. */
export const FALLBACK_PAIR_ASSETS: PairAsset[] = LAUNCH_PAIR_ASSETS.map(symbol => ({
  symbol,
  address:
    symbol === 'ETH'
      ? NATIVE_PAIR_ASSET
      : symbol === 'USDG'
        ? ROBINHOOD_PAIR_ASSETS.usdg
        : (ROBINHOOD_PAIR_ASSETS.stocks.find(s => s.symbol === symbol)?.address ?? NATIVE_PAIR_ASSET),
  decimals: PAIR_ASSET_DECIMALS[symbol],
  graduationTarget: GRADUATION_TARGET[symbol],
}))

export type UsePairAssetsResult = {
  assets: PairAsset[]
  /** True when the list came from the factory rather than the fallback constants. */
  isLive: boolean
  isLoading: boolean
  /** Set when a chain read failed, so the UI can say the list may be stale. */
  error?: string
}

export function usePairAssets(): UsePairAssetsResult {
  const connectedChainId = useChainId()
  const chainId = resolveTargetChainId(connectedChainId)
  const factory = qualyraDeployment(chainId)?.factory
  const enabled = isDeployed(factory)

  const countQuery = useReadContract({
    address: factory,
    chainId,
    abi: qualyraFactoryAbi,
    functionName: 'quoteAssetCount',
    query: { enabled },
  })

  const count = countQuery.data === undefined ? 0 : Number(countQuery.data)

  const addressQuery = useReadContracts({
    contracts: Array.from({ length: count }, (_, i) => ({
      address: factory,
      chainId,
      abi: qualyraFactoryAbi,
      functionName: 'quoteAssetAt' as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: enabled && count > 0 },
  })

  const addresses = useMemo(
    () =>
      (addressQuery.data ?? [])
        .map(r => (r.status === 'success' ? (r.result as Address) : undefined))
        .filter((a): a is Address => a !== undefined),
    [addressQuery.data],
  )

  // One config read per asset, plus symbol for everything that is not native ETH.
  const detailQuery = useReadContracts({
    contracts: [
      ...addresses.map(address => ({
        address: factory,
        abi: qualyraFactoryAbi,
        functionName: 'quoteAssetConfig' as const,
        args: [address] as const,
      })),
      ...addresses
        .filter(a => a !== NATIVE_PAIR_ASSET)
        .map(address => ({
          address,
          abi: erc20Abi,
          functionName: 'symbol' as const,
        })),
    ],
    query: { enabled: enabled && addresses.length > 0 },
  })

  return useMemo(() => {
    if (!enabled) {
      return { assets: FALLBACK_PAIR_ASSETS, isLive: false, isLoading: false }
    }

    const isLoading = countQuery.isLoading || addressQuery.isLoading || detailQuery.isLoading
    const failed = countQuery.isError || addressQuery.isError || detailQuery.isError

    if (isLoading || failed || detailQuery.data === undefined) {
      return {
        assets: FALLBACK_PAIR_ASSETS,
        isLive: false,
        isLoading,
        error: failed ? 'Could not read the pair asset list from the factory.' : undefined,
      }
    }

    const configs = detailQuery.data.slice(0, addresses.length)
    const symbols = detailQuery.data.slice(addresses.length)
    let symbolCursor = 0

    const assets: PairAsset[] = []
    addresses.forEach((address, i) => {
      const native = address === NATIVE_PAIR_ASSET
      const symbolResult = native ? undefined : symbols[symbolCursor++]

      const entry = configs[i]
      if (entry?.status !== 'success') return

      const config = entry.result as {
        listed: boolean
        enabled: boolean
        phantomQuote: bigint
        graduationThreshold: bigint
        decimals: number
      }
      // A disabled asset stays listed so existing tokens keep working, but nothing new launches against it.
      if (!config.listed || !config.enabled) return

      const symbol = native
        ? 'ETH'
        : symbolResult?.status === 'success'
          ? String(symbolResult.result)
          : `${address.slice(0, 6)}…${address.slice(-4)}`

      assets.push({
        symbol,
        address,
        decimals: config.decimals,
        graduationTarget: Number(formatUnits(config.graduationThreshold, config.decimals)),
      })
    })

    if (assets.length === 0) {
      return { assets: FALLBACK_PAIR_ASSETS, isLive: false, isLoading: false }
    }

    // Native ETH first, then the rest in the order the factory lists them.
    assets.sort((a, b) =>
      a.address === NATIVE_PAIR_ASSET ? -1 : b.address === NATIVE_PAIR_ASSET ? 1 : 0,
    )

    return { assets, isLive: true, isLoading: false }
  }, [
    enabled,
    addresses,
    countQuery.isLoading,
    countQuery.isError,
    addressQuery.isLoading,
    addressQuery.isError,
    detailQuery.data,
    detailQuery.isLoading,
    detailQuery.isError,
  ])
}

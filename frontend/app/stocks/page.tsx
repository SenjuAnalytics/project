'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'
import { RWA_ASSETS } from '@/lib/data'
import { resolveTargetChainId } from '@/lib/contracts'
import { useLivePrices } from '@/lib/useLivePrices'
import { usePairAssets } from '@/lib/usePairAssets'
import { StocksHeroBanner } from '@/components/stocks/StocksHeroBanner'
import { StockHoursBar } from '@/components/stocks/StockHoursBar'
import { StocksTable, type StockRow, type StockTab } from '@/components/stocks/StocksTable'
import { RwaHowItWorks } from '@/components/stocks/RwaHowItWorks'

export default function StocksPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { data: ethBalance, isLoading: isEthLoading } = useBalance({ address })
  const chainId = resolveTargetChainId(useChainId())
  const [activeTab, setActiveTab] = useState<StockTab>('all')
  const [search, setSearch] = useState('')

  const { prices: livePrices, priceTrends } = useLivePrices(25000)
  const pairAssets = usePairAssets()

  // Matched on address, never on ticker: anyone can deploy a token called NVDA.
  const pairAddresses = useMemo(
    () => (pairAssets.isLive ? new Set(pairAssets.assets.map(a => a.address.toLowerCase())) : null),
    [pairAssets.isLive, pairAssets.assets],
  )

  const usdg = pairAssets.isLive ? pairAssets.assets.find(a => a.symbol === 'USDG') : undefined
  const { data: usdgRaw } = useReadContract({
    address: usdg?.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId,
    query: { enabled: !!address && !!usdg },
  })
  const usdgBalance = usdg && usdgRaw !== undefined ? Number(formatUnits(usdgRaw, usdg.decimals)) : null

  const rows = useMemo<StockRow[]>(
    () =>
      RWA_ASSETS.map(asset => {
        const live = livePrices[asset.id] ?? livePrices[asset.ticker.toLowerCase()]
        // Baseline entries are the route's hardcoded fallbacks. A dash beats a stale number.
        const quote = live && live.source !== 'baseline' ? live : undefined
        return {
          asset,
          price: quote?.price ?? null,
          chg24: quote?.chg24 ?? null,
          isPairAsset: !!asset.address && !!pairAddresses?.has(asset.address.toLowerCase()),
        }
      }),
    [livePrices, pairAddresses],
  )

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase()
    return rows.filter(({ asset: a }) => {
      const match = a.name.toLowerCase().includes(q) || a.ticker.toLowerCase().includes(q) || a.token.toLowerCase().includes(q)
      if (!match) return false
      if (activeTab !== 'all' && a.type !== activeTab) return false
      return true
    })
  }, [rows, activeTab, search])

  return (
    <div className="wrap-wide" style={{ padding: '24px 0 40px' }}>
      <StocksHeroBanner
        assetCount={rows.length}
        pairCount={pairAddresses ? rows.filter(r => r.isPairAsset).length : null}
        isConnected={isConnected}
        address={address}
        ethBalance={ethBalance}
        isEthLoading={isEthLoading}
        usdgBalance={usdgBalance}
      />

      <StockHoursBar />

      <StocksTable
        rows={filteredRows}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        search={search}
        setSearch={setSearch}
        priceTrends={priceTrends}
        onSelectTrade={assetId => router.push(`/trade?pair=${assetId}`)}
      />

      <RwaHowItWorks />
    </div>
  )
}

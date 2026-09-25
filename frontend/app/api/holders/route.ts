import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, parseAbiItem, formatUnits, type Address } from 'viem'

export const dynamic = 'force-dynamic'

interface HolderItem {
  rank: number
  address: string
  label?: string
  isContract: boolean
  balanceRaw: string
  balanceFormatted: string
  percentage: number
  explorerUrl: string
}

interface BlockscoutTokenInfo {
  name?: string
  symbol?: string
  decimals?: string
  total_supply?: string
  holders_count?: string
}

interface BlockscoutHolderItem {
  value?: string
  address?: {
    hash?: string
    name?: string
    is_contract?: boolean
    metadata?: {
      tags?: Array<{ name?: string }>
    }
  }
}

const TOKEN_ADDRESS_MAP: Record<string, string> = {
  pons: '0x39dBED3a2bd333467115dE45665cC57F813C4571',
  ai: '0x2e8c31162b855a2ffa90f6f8634643ad6f111e18',
  nvda: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  rnvda: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  aapl: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  raapl: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  spy: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
  rspy: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
  googl: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3',
  rgoogl: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3',
  gme: '0x1b0E319c6A659F002271B69dB8A7df2F911c153E',
  rgme: '0x1b0E319c6A659F002271B69dB8A7df2F911c153E',
  spcx: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa',
  rspcx: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa',
  sgov: '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5',
  rsgov: '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5',
  brn: '0x0E444675a27f209B5e31bd4e78A0094536aBBAee',
}

// Known protocol labels
const KNOWN_LABELS: Record<string, string> = {
  '0x8366a39cc670b4001a1121b8f6a443a643e40951': 'Uniswap v4 Pool (Graduated)',
  '0xba47d848cf96ea626c97a8911302208c6ef0fc1a': 'Qualyra Bonding Curve',
  '0x7891417ee1a979a22dd0c357b8991cbe43d3e7e9': 'Qualyra Liquidity Locker',
  '0x320e3da0d639c302070ad5d34909a14cfecbaaf8': 'Qualyra Buyback & Burner',
  '0x000000000000000000000000000000000000dead': '🔥 Burn Address (Null)',
}

const holdersCache = new Map<string, { timestamp: number; data: Record<string, unknown> }>()
const CACHE_TTL_MS = 30 * 1000

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tokenParam = searchParams.get('token') || searchParams.get('pair') || 'pons'
    const chainIdParam = searchParams.get('chainId')
    const chainId = chainIdParam === '4663' ? 4663 : 46630

    const cleanParam = tokenParam.toLowerCase().trim()
    const tokenAddress = (
      TOKEN_ADDRESS_MAP[cleanParam] ||
      (tokenParam.startsWith('0x') ? tokenParam : null)
    ) as Address | null

    if (!tokenAddress) {
      return NextResponse.json({ success: false, error: 'Token address required' }, { status: 400 })
    }

    const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`
    const cached = holdersCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, source: 'cache', ...cached.data })
    }

    const requestHeaders = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    }

    const explorerBases = chainId === 4663
      ? ['https://robinhoodchain.blockscout.com', 'https://explorer.testnet.chain.robinhood.com']
      : ['https://explorer.testnet.chain.robinhood.com', 'https://robinhoodchain.blockscout.com']

    let tokenInfo: BlockscoutTokenInfo | null = null
    let rawItems: BlockscoutHolderItem[] = []
    let activeExplorerBase = explorerBases[0]

    // 1. Try explorer endpoints
    for (const base of explorerBases) {
      try {
        const [tokenRes, holdersRes] = await Promise.all([
          fetch(`${base}/api/v2/tokens/${tokenAddress}`, { headers: requestHeaders, next: { revalidate: 30 } }),
          fetch(`${base}/api/v2/tokens/${tokenAddress}/holders`, { headers: requestHeaders, next: { revalidate: 30 } }),
        ])

        if (tokenRes.ok) {
          tokenInfo = (await tokenRes.json()) as BlockscoutTokenInfo
        }

        if (holdersRes.ok) {
          const holdersData = (await holdersRes.json()) as { items?: BlockscoutHolderItem[] }
          if (Array.isArray(holdersData?.items) && holdersData.items.length > 0) {
            rawItems = holdersData.items
            activeExplorerBase = base
            break
          }
        }
      } catch {
        // Fallback to next explorer or on-chain
      }
    }

    const decimals = tokenInfo?.decimals ? parseInt(tokenInfo.decimals, 10) : 18
    const totalSupplyRaw = tokenInfo?.total_supply ? BigInt(tokenInfo.total_supply) : BigInt('1000000000000000000000000000') // 1B fallback
    const totalHoldersCount = tokenInfo?.holders_count ? parseInt(tokenInfo.holders_count, 10) : 0

    let holdersList: HolderItem[] = []

    if (rawItems.length > 0) {
      holdersList = rawItems.map((item: BlockscoutHolderItem, idx: number) => {
        const rawVal = BigInt(item.value || '0')
        let pct = 0
        if (totalSupplyRaw > BigInt(0)) {
          pct = Number((rawVal * BigInt(10000)) / totalSupplyRaw) / 100
        }

        const divisor = BigInt(10) ** BigInt(decimals)
        const whole = rawVal / divisor
        const fraction = (rawVal % divisor) / (BigInt(10) ** BigInt(Math.max(0, decimals - 2)))
        const balanceFormatted = `${whole.toLocaleString('en-US')}.${fraction.toString().padStart(2, '0')}`

        const addrHash = item.address?.hash || ''
        const lowerAddr = addrHash.toLowerCase()
        const isDead = lowerAddr === '0x000000000000000000000000000000000000dead'
        const knownLabel = KNOWN_LABELS[lowerAddr]
        const tag = knownLabel || item.address?.metadata?.tags?.[0]?.name || (isDead ? '🔥 Burn Address (Null)' : undefined)

        return {
          rank: idx + 1,
          address: addrHash,
          label: tag || item.address?.name || undefined,
          isContract: !!item.address?.is_contract || !!knownLabel,
          balanceRaw: item.value || '0',
          balanceFormatted,
          percentage: +pct.toFixed(2),
          explorerUrl: `${activeExplorerBase}/address/${addrHash}`,
        }
      })
    } else {
      // 2. Onchain Fallback via Transfer event logs & balanceOf
      try {
        const rpcUrl = chainId === 4663
          ? 'https://rpc.mainnet.chain.robinhood.com'
          : 'https://rpc.testnet.chain.robinhood.com'

        const client = createPublicClient({ transport: http(rpcUrl) })

        const logs = await client.getLogs({
          address: tokenAddress,
          event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
          fromBlock: 122327405n,
          toBlock: 'latest',
        })

        const recipients = new Set<Address>()
        for (const log of logs) {
          if (log.args.to && log.args.to !== '0x0000000000000000000000000000000000000000') {
            recipients.add(log.args.to as Address)
          }
        }

        const balances = await Promise.all(
          Array.from(recipients).map(async addr => {
            try {
              const b = await client.readContract({
                address: tokenAddress,
                abi: [{ type: 'function', name: 'balanceOf', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }],
                functionName: 'balanceOf',
                args: [addr],
              })
              return { address: addr, balance: b }
            } catch {
              return { address: addr, balance: 0n }
            }
          }),
        )

        const activeHolders = balances
          .filter(b => b.balance > 0n)
          .sort((a, b) => (b.balance > a.balance ? 1 : -1))

        holdersList = activeHolders.map((item, idx) => {
          const rawVal = item.balance
          let pct = 0
          if (totalSupplyRaw > 0n) {
            pct = Number((rawVal * 10000n) / totalSupplyRaw) / 100
          }

          const balanceNum = parseFloat(formatUnits(rawVal, decimals))
          const lowerAddr = item.address.toLowerCase()
          const isDead = lowerAddr === '0x000000000000000000000000000000000000dead'
          const knownLabel = KNOWN_LABELS[lowerAddr]

          return {
            rank: idx + 1,
            address: item.address,
            label: knownLabel || (isDead ? '🔥 Burn Address (Null)' : undefined),
            isContract: !!knownLabel,
            balanceRaw: rawVal.toString(),
            balanceFormatted: balanceNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            percentage: +pct.toFixed(2),
            explorerUrl: `${activeExplorerBase}/address/${item.address}`,
          }
        })
      } catch (onchainErr) {
        console.warn('[Holders Onchain Fallback Error]:', onchainErr)
      }
    }

    const resultPayload = {
      tokenAddress,
      tokenName: tokenInfo?.name || '',
      tokenSymbol: tokenInfo?.symbol || '',
      totalHolders: totalHoldersCount || holdersList.length,
      totalSupply: tokenInfo?.total_supply || totalSupplyRaw.toString(),
      decimals,
      holders: holdersList,
    }

    holdersCache.set(cacheKey, { timestamp: Date.now(), data: resultPayload })

    return NextResponse.json({
      success: true,
      source: rawItems.length > 0 ? 'robinhood_chain_blockscout' : 'onchain_rpc',
      ...resultPayload,
    })
  } catch (error: unknown) {
    console.error('[Holders API Error]:', error)
    return NextResponse.json(
      { success: false, error: 'Qualyra Gateway: Failed to fetch token holders. Please try again later.' },
      { status: 500 }
    )
  }
}

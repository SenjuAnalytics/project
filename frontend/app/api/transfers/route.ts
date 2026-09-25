import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface TransferItem {
  id: string
  txHash: string
  from: string
  to: string
  value: string
  valueFormatted: string
  blockNumber: number
  timeAgo: string
  explorerUrl: string
}

interface RpcLogItem {
  topics: string[]
  data?: string
  blockNumber: string
  transactionHash: string
  logIndex?: string
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

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const transfersCache = new Map<string, { timestamp: number; data: Record<string, unknown> }>()
const CACHE_TTL_MS = 10 * 1000

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tokenParam = searchParams.get('token') || searchParams.get('pair') || 'pons'
    const chainIdParam = searchParams.get('chainId')
    const chainId = chainIdParam === '4663' ? 4663 : 46630

    const RPC_URL = chainId === 4663
      ? 'https://rpc.mainnet.chain.robinhood.com'
      : 'https://rpc.testnet.chain.robinhood.com'

    const explorerBase = chainId === 4663
      ? 'https://robinhoodchain.blockscout.com'
      : 'https://explorer.testnet.chain.robinhood.com'

    const cleanParam = tokenParam.toLowerCase().trim()
    const tokenAddress = TOKEN_ADDRESS_MAP[cleanParam] || (tokenParam.startsWith('0x') ? tokenParam : null)

    if (!tokenAddress) {
      return NextResponse.json({ success: false, error: 'Token address required' }, { status: 400 })
    }

    const cacheKey = `${chainId}:${tokenAddress.toLowerCase()}`
    const cached = transfersCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, source: 'cache', ...cached.data })
    }

    // 1. Get latest block number from Robinhood Chain RPC
    const bRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      next: { revalidate: 5 },
    })

    if (!bRes.ok) {
      throw new Error(`RPC node returned status ${bRes.status}`)
    }

    const bData = await bRes.json()
    const latestBlock = parseInt(bData.result, 16)
    const minBlock = chainId === 46630 ? 122327405 : Math.max(0, latestBlock - 50000)
    const fromBlock = '0x' + Math.max(minBlock, latestBlock - 100000).toString(16)

    // 2. Query real onchain Transfer events via eth_getLogs
    const lRes = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getLogs',
        params: [{
          address: tokenAddress,
          topics: [TRANSFER_TOPIC],
          fromBlock,
          toBlock: 'latest',
        }],
      }),
      next: { revalidate: 10 },
    })

    if (!lRes.ok) {
      throw new Error(`RPC eth_getLogs failed: status ${lRes.status}`)
    }

    const lData = (await lRes.json()) as { result?: RpcLogItem[] }
    const rawLogs: RpcLogItem[] = Array.isArray(lData?.result) ? lData.result : []

    // Sort newest first
    const sorted = [...rawLogs].reverse().slice(0, 50)

    const transfers: TransferItem[] = sorted.map((log: RpcLogItem, idx: number) => {
      const fromAddr = '0x' + (log.topics[1]?.slice(26) || '').toLowerCase()
      const toAddr = '0x' + (log.topics[2]?.slice(26) || '').toLowerCase()
      const rawVal = BigInt(log.data || '0')
      const blockNum = parseInt(log.blockNumber, 16)
      const blocksAgo = Math.max(0, latestBlock - blockNum)
      // Robinhood Chain averages ~0.25s per block
      const secondsAgo = Math.round(blocksAgo * 0.25)

      let timeAgo = `${secondsAgo}s ago`
      if (secondsAgo >= 3600) {
        timeAgo = `${Math.floor(secondsAgo / 3600)}h ago`
      } else if (secondsAgo >= 60) {
        timeAgo = `${Math.floor(secondsAgo / 60)}m ago`
      }

      // Format balance assuming 18 decimals
      const divisor = BigInt(10) ** BigInt(18)
      const whole = rawVal / divisor
      const fraction = (rawVal % divisor) / (BigInt(10) ** BigInt(16))
      const valueFormatted = `${whole.toLocaleString('en-US')}.${fraction.toString().padStart(2, '0')}`

      return {
        id: `${log.transactionHash}-${log.logIndex || idx}`,
        txHash: log.transactionHash,
        from: fromAddr,
        to: toAddr,
        value: rawVal.toString(),
        valueFormatted,
        blockNumber: blockNum,
        timeAgo,
        explorerUrl: `${explorerBase}/tx/${log.transactionHash}`,
      }
    })

    const resultPayload = {
      tokenAddress,
      totalTransfers: transfers.length,
      latestBlock,
      transfers,
    }

    transfersCache.set(cacheKey, { timestamp: Date.now(), data: resultPayload })

    return NextResponse.json({
      success: true,
      source: 'qualyra_rpc_gateway',
      ...resultPayload,
    })
  } catch (error: unknown) {
    console.error('[Transfers API Error]:', error)
    return NextResponse.json(
      { success: false, error: 'Qualyra Gateway: Failed to fetch token transfers. Please try again later.' },
      { status: 500 }
    )
  }
}

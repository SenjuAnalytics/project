import { NextRequest, NextResponse } from 'next/server'
import { usesBlockedRpcKey } from '@/lib/blockedRpc'

export const dynamic = 'force-dynamic'

const OFFICIAL_RPC: Record<string, string> = {
  '4663': 'https://rpc.mainnet.chain.robinhood.com',
  '46630': 'https://rpc.testnet.chain.robinhood.com',
}

// Server-side only — this route handler never reaches the browser bundle, so the mainnet keys stay
// off the client. Configure via the server-only RPC_MAINNET / RPC_MAINNET_ZAN env vars (see
// frontend/.env.example). Unset => that provider is skipped and the official public RPC is used.
const ALCHEMY_MAINNET = process.env.RPC_MAINNET || ''

const ZAN_MAINNET = process.env.RPC_MAINNET_ZAN || ''

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
}

async function forwardRpc(url: string, body: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(15000),
  })
}

/**
 * Sanitize error message and strings to prevent leaking upstream RPC endpoints,
 * provider names, or API keys into frontend logs.
 */
function sanitizeMessage(msg: string, host: string): string {
  return msg
    .replace(/https?:\/\/[^\s"'\\]+?(?=[,:;]?(?:\s|$|["']))/gi, `https://${host}/api/rpc`)
    .replace(/rpc\.(?:testnet|mainnet)\.chain\.robinhood\.com/gi, `${host}/api/rpc`)
    .replace(/[a-zA-Z0-9.-]+\.alchemy\.com/gi, host)
    .replace(/[a-zA-Z0-9.-]+\.zan\.top/gi, host)
    .replace(/[a-zA-Z0-9.-]+\.uniblock\.dev/gi, host)
    .replace(/[a-zA-Z0-9.-]+\.drpc\.org/gi, host)
    .replace(/[a-zA-Z0-9.-]+\.blockscout\.com/gi, host)
    .replace(/\b(?:Alchemy|ZAN|Uniblock|QuickNode|Infura|dRPC|Blockscout)\b/gi, 'Qualyra')
    .replace(/alch_[a-zA-Z0-9_-]+/gi, '***')
    .replace(/zan_[a-zA-Z0-9_-]+/gi, '***')
}

function sanitizeRpcJson(data: unknown, host: string): unknown {
  if (!data || typeof data !== 'object') return data
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeRpcJson(item, host))
  }
  const cloned = { ...(data as Record<string, unknown>) }
  if (cloned.error && typeof cloned.error === 'object') {
    const err = { ...(cloned.error as Record<string, unknown>) }
    if (typeof err.message === 'string') {
      err.message = sanitizeMessage(err.message, host)
    }
    if (typeof err.data === 'string') {
      err.data = sanitizeMessage(err.data, host)
    }
    cloned.error = err
  }
  return cloned
}

function makeRpcError(id: unknown, message: string, code = -32603) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
    },
  }
}

export async function POST(req: NextRequest) {
  const chainId = req.nextUrl.searchParams.get('chainId') || '46630'
  const officialUrl = OFFICIAL_RPC[chainId] || OFFICIAL_RPC['46630']
  const host = req.headers.get('host') || 'qualyra.io'

  let body = ''
  let parsedBody: unknown = null
  let isBatch = false
  let reqIds: unknown[] = []
  let reqId: unknown = null

  try {
    body = await req.text()
    parsedBody = JSON.parse(body)
    if (Array.isArray(parsedBody)) {
      isBatch = true
      reqIds = parsedBody.map((item) =>
        item && typeof item === 'object' && 'id' in item ? (item as { id: unknown }).id ?? null : null
      )
    } else if (parsedBody && typeof parsedBody === 'object' && 'id' in parsedBody) {
      reqId = (parsedBody as { id: unknown }).id ?? null
    }
  } catch {
    // Malformed JSON request
    return NextResponse.json(
      makeRpcError(null, 'Qualyra RPC Gateway: Parse error (-32700)', -32700),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS,
        },
      }
    )
  }

  try {
    const isGetLogs = body.includes('"eth_getLogs"')

    // Determine candidate endpoints in priority order.
    // Alchemy free tier strictly caps eth_getLogs to a 10-block range and returns 400.
    // ZAN and official Robinhood nodes support wide block ranges.
    let candidateUrls: string[]
    if (chainId === '4663') {
      candidateUrls = (isGetLogs
        ? [ZAN_MAINNET, officialUrl, ALCHEMY_MAINNET]
        : [ALCHEMY_MAINNET, ZAN_MAINNET, officialUrl]
      ).filter(Boolean)
    } else {
      const customTestnet = (process.env.RPC_TESTNET || process.env.NEXT_PUBLIC_RPC_TESTNET || '').trim()
      const validCustom =
        customTestnet &&
        !usesBlockedRpcKey(customTestnet) &&
        customTestnet !== officialUrl
          ? customTestnet
          : null
      candidateUrls = validCustom ? [validCustom, officialUrl] : [officialUrl]
    }

    let upstreamRes: Response | null = null
    for (const url of candidateUrls) {
      try {
        const res = await forwardRpc(url, body)
        if (res.ok) {
          upstreamRes = res
          break
        }
        // If non-ok (e.g. 429), retain and try next candidate
        upstreamRes = res
      } catch {
        // network error / timeout -> try next candidate
      }
    }

    if (!upstreamRes) {
      const errorPayload = isBatch
        ? reqIds.map((id) =>
            makeRpcError(id, `Qualyra RPC Gateway: All RPC providers unreachable (${host})`, -32603)
          )
        : makeRpcError(reqId, `Qualyra RPC Gateway: All RPC providers unreachable (${host})`, -32603)

      return NextResponse.json(errorPayload, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...CORS_HEADERS,
        },
      })
    }

    const rawData = await upstreamRes.text()
    let responseBody: string

    try {
      const parsedRes = JSON.parse(rawData)
      const sanitized = sanitizeRpcJson(parsedRes, host)
      responseBody = JSON.stringify(sanitized)
    } catch {
      // Upstream returned non-JSON (e.g. Cloudflare HTML 502/504 page)
      const errorPayload = isBatch
        ? reqIds.map((id) =>
            makeRpcError(
              id,
              `Qualyra RPC Gateway: Upstream node returned invalid response (${host})`,
              -32603
            )
          )
        : makeRpcError(
            reqId,
            `Qualyra RPC Gateway: Upstream node returned invalid response (${host})`,
            -32603
          )
      responseBody = JSON.stringify(errorPayload)
    }

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    })
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : 'Internal request failure'
    const safeMsg = `Qualyra RPC Gateway: ${sanitizeMessage(rawMsg, host)}`

    const errorPayload = isBatch
      ? reqIds.map((id) => makeRpcError(id, safeMsg, -32603))
      : makeRpcError(reqId, safeMsg, -32603)

    return NextResponse.json(errorPayload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...CORS_HEADERS,
      },
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

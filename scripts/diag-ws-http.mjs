// Diagnostic: (1) does the upstream support eth_subscribe("logs") (not just newHeads)?
//             (2) how slow is the HTTP RPC refresh path (tokenCount + tokenAt loop)?
//
// Usage: node scripts/diag-ws-http.mjs
import { createRequire } from 'node:module'
const require = createRequire('C:/Users/shole/OneDrive/Desktop/project/frontend/')
const WebSocket = require('ws')

const WS_URL = process.env.WS_URL || 'ws://localhost:8546/testnet-uniblock'
const HTTP_URL = process.env.HTTP_URL || 'https://rpc.testnet.chain.robinhood.com'
const FACTORY = '0xD4b09E6Fc567769E4EEb1e2bd2Ca04950584610c'
const WAIT_MS = Number(process.env.WAIT_MS || 20000)

// ---- Part 1: eth_subscribe("logs") test -----------------------------------
function testLogsSubscription() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL)
    const out = { connected: false, logsSubId: null, logsError: null, logsNotifications: 0, newHeads: 0 }
    let done = false
    const finish = () => { if (done) return; done = true; try { ws.close() } catch {} resolve(out) }

    ws.on('open', () => {
      out.connected = true
      // subscribe to logs for the factory contract
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['logs', { address: FACTORY }] }))
      // also newHeads for comparison
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_subscribe', params: ['newHeads'] }))
    })

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }
      if (msg.id === 1) {
        if (msg.error) out.logsError = msg.error
        else out.logsSubId = msg.result
      }
      if (msg.method === 'eth_subscription') {
        const sub = msg.params?.subscription
        if (sub && sub === out.logsSubId) out.logsNotifications++
        else out.newHeads++
      }
    })

    ws.on('error', (e) => { out.logsError = out.logsError || { message: String(e?.message || e) }; finish() })
    setTimeout(finish, WAIT_MS)
  })
}

// ---- Part 2: HTTP refresh-path latency ------------------------------------
async function rpc(method, params) {
  const t0 = Date.now()
  const res = await fetch(HTTP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json()
  return { ms: Date.now() - t0, status: res.status, json }
}

// tokenCount() selector = 0x... ; we use eth_call to factory. tokenCount() = keccak("tokenCount()")[:4]
// Known selector for tokenCount(): 0x9f3f89dc  (computed offline)
async function testHttpPath() {
  const results = { blockNumber: null, tokenCountCall: null, tokenCount: null, tokenAtSampleMs: [] }
  const bn = await rpc('eth_blockNumber', [])
  results.blockNumber = { ms: bn.ms, value: bn.json?.result }

  const call = await rpc('eth_call', [{ to: FACTORY, data: '0x9f3f89dc' }, 'latest'])
  results.tokenCountCall = { ms: call.ms, status: call.status, raw: call.json?.result, error: call.json?.error }
  const count = call.json?.result ? parseInt(call.json.result, 16) : null
  results.tokenCount = count

  // sample up to 3 tokenAt(i) calls to gauge per-call latency. tokenAt(uint256) selector = 0x4f64b2be
  const n = Math.min(count || 0, 3)
  for (let i = 0; i < n; i++) {
    const idx = i.toString(16).padStart(64, '0')
    const r = await rpc('eth_call', [{ to: FACTORY, data: '0x4f64b2be' + idx }, 'latest'])
    results.tokenAtSampleMs.push({ i, ms: r.ms, ok: !!r.json?.result })
  }
  return results
}

;(async () => {
  console.log('=== PART 1: eth_subscribe("logs") support ===')
  const p1 = await testLogsSubscription()
  console.log(JSON.stringify(p1, null, 2))
  console.log(p1.logsError ? '=> LOGS SUBSCRIPTION NOT SUPPORTED (this is why TokenLaunched never fires => falls back to 12s poll)'
    : p1.logsSubId ? '=> logs subscription ACCEPTED (subId issued). Real-time token detection is possible.'
    : '=> inconclusive')

  console.log('\n=== PART 2: HTTP refresh path latency (official RPC) ===')
  try {
    const p2 = await testHttpPath()
    console.log(JSON.stringify(p2, null, 2))
  } catch (e) {
    console.log('HTTP path error:', String(e?.message || e))
  }
  process.exit(0)
})()

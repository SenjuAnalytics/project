import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(__dirname, '../frontend/package.json'))
const WebSocket = require('ws')

// Pass the URL to verify as the first CLI arg, e.g.
//   node scripts/ws-verify.mjs ws://localhost:8546/testnet
//   node scripts/ws-verify.mjs ws://localhost:8546/mainnet
// No keyed endpoint is hardcoded here; the default is the local testnet proxy route.
const URL =
  process.argv[2] ||
  process.env.WS_VERIFY_URL ||
  process.env.NEXT_PUBLIC_WSS_TESTNET ||
  'ws://localhost:8546/testnet'
const messages = []
let subId = null
let chainId = null

const ws = new WebSocket(URL)

const done = (code, note) => {
  console.log('\n===== RESULT =====')
  console.log('connected:', connected)
  console.log('subscriptionId:', subId)
  console.log('chainId:', chainId)
  console.log('newHeadsStreamed:', messages.some(m => m.method === 'eth_subscription'))
  console.log('note:', note)
  console.log('rawMessages:')
  messages.forEach((m, i) => console.log(`  [${i}]`, JSON.stringify(m)))
  try { ws.close() } catch {}
  process.exit(code)
}

let connected = false

const timeout = setTimeout(() => done(0, 'timeout reached (10s)'), 10000)

ws.on('open', () => {
  connected = true
  console.log('WS OPEN -> connected')
  ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newHeads'] }))
  ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_chainId', params: [] }))
})

ws.on('message', (data) => {
  const text = data.toString()
  console.log('MSG <-', text)
  let obj
  try { obj = JSON.parse(text) } catch { obj = { raw: text } }
  messages.push(obj)
  if (obj.id === 1 && obj.result) subId = obj.result
  if (obj.id === 2 && obj.result) chainId = obj.result
  // Once we have subId + chainId + at least one newHeads notification, finish early
  if (subId && chainId && messages.some(m => m.method === 'eth_subscription')) {
    clearTimeout(timeout)
    done(0, 'received subscription id, chainId, and a newHeads notification')
  }
})

ws.on('error', (err) => {
  clearTimeout(timeout)
  console.log('WS ERROR:', err.message)
  done(0, 'error: ' + err.message)
})

ws.on('close', (code, reason) => {
  console.log('WS CLOSE code=', code, 'reason=', reason.toString())
})

/**
 * Local WebSocket proxy for Robinhood Chain — a path-routed MULTIPLEXER.
 *
 * WHY THIS EXISTS
 * ----------------
 * Two kinds of upstream can't be reached straight from a browser dApp:
 *   1. Auth header: some providers (Uniblock testnet) require the API key in an `X-API-KEY`
 *      request header, but a browser WebSocket handshake can't set custom headers.
 *   2. Keyed / connection-limited endpoints: the key would otherwise ship inside the browser
 *      bundle, and every tab + HMR reload would open its own upstream connection (Uniblock's
 *      startup plan allows only ONE: "Connection limit reached: 1 of 1 connections in use").
 *
 * This proxy fixes both by keeping ONE server-side upstream socket per network route and fanning it out
 * to every local browser client (see scripts/ws-mux.mjs). API keys live here (server-side) —
 * they never reach the browser bundle.
 *
 * All testnet requests (/testnet-uniblock, /testnet-alchemy, /testnet, /) share a single testnetMux
 * instance. That ensures only ONE connection is made to Uniblock across all browser tabs, completely
 * preventing the 1-connection limit 429 error. If Uniblock fails or drops, the proxy automatically
 * rotates to dRPC, and then to Alchemy.
 *
 *      tab #1 ─┐   ws://localhost:8546/testnet-uniblock ─►  testnetMux ── 1 wss + X-API-KEY ─► Uniblock
 *      tab #2 ─┼─  ws://localhost:8546/testnet-alchemy  ─► (fan-out)   (failover: drpc -> alchemy)
 *      tab #3 ─┘   ws://localhost:8546/mainnet          ─► mainnetMux ── 1 wss ──────────────► ZAN
 *
 * ROUTES
 *   ws://localhost:8546/testnet-uniblock  -> Uniblock testnet (46630) [PRIMARY] -> dRPC -> Alchemy
 *   ws://localhost:8546/testnet-alchemy   -> Shared testnet mux (backwards-compatible with frontend)
 *   ws://localhost:8546/testnet | /       -> Shared testnet mux
 *   ws://localhost:8546/mainnet-zan       -> ZAN mainnet (4663)        [scaffold — empty until go-live]
 *   ws://localhost:8546/mainnet-alchemy   -> Alchemy mainnet (4663)    [scaffold — empty until go-live]
 *   ws://localhost:8546/mainnet-uniblock  -> Uniblock mainnet (4663)   [scaffold — empty until go-live]
 *   ws://localhost:8546/mainnet           -> defaults to /mainnet-zan
 */

import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createMux } from './ws-mux.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(__dirname, '../frontend/package.json'))
const { WebSocketServer, WebSocket } = require('ws')

// Load env from frontend/.env.local (and an optional root .env)
function loadEnvFile(path) {
  try {
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.replace(/^\uFEFF/, '').trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      let val = line.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (key && process.env[key] === undefined) process.env[key] = val
    }
  } catch { /* env file is optional */ }
}
loadEnvFile(join(__dirname, '../frontend/.env.local'))
loadEnvFile(join(__dirname, '../.env'))

const PORT = Number(process.env.WS_PROXY_PORT || 8546)

const ts = () => new Date().toISOString().slice(11, 19)
const log = (...args) => console.log(`[ws-proxy ${ts()}]`, ...args)

// ── TESTNET PROVIDERS (chain 46630) ──────────────────────────────────────────
// Order:
//   1) Uniblock (PRIMARY — key in X-API-KEY header, startup plan allows 1 connection)
//   2) dRPC public testnet (SECONDARY fallback — keyless, highly available, no connection limits)
//   3) Alchemy testnet (TERTIARY fallback — key in URL)
const TESTNET_PROVIDERS = [
  {
    name: 'uniblock',
    url:
      process.env.WS_PROXY_TESTNET_UNIBLOCK_UPSTREAM ||
      process.env.WS_PROXY_TESTNET_UPSTREAM ||
      process.env.WS_PROXY_UPSTREAM ||
      'wss://websocket.uniblock.dev/alchemy?chainId=46630',
    headers: {
      'X-API-KEY':
        process.env.WS_PROXY_TESTNET_UNIBLOCK_KEY ||
        process.env.WS_PROXY_TESTNET_KEY ||
        process.env.WS_PROXY_API_KEY ||
        '',
    },
  },
  {
    name: 'drpc',
    url: 'wss://robinhood-testnet.drpc.org',
    headers: {},
  },
  ...(process.env.WS_PROXY_TESTNET_ALCHEMY_UPSTREAM
    ? [{
        name: 'alchemy',
        url: process.env.WS_PROXY_TESTNET_ALCHEMY_UPSTREAM,
        headers: process.env.WS_PROXY_TESTNET_ALCHEMY_KEY ? { 'X-API-KEY': process.env.WS_PROXY_TESTNET_ALCHEMY_KEY } : {},
      }]
    : []),
]

// ── MAINNET SCAFFOLD (chain 4663) ────────────────────────────────────────────
const MAINNET_ROUTES = {
  'mainnet-zan': {
    name: 'mainnet-zan',
    url: process.env.WS_PROXY_MAINNET_ZAN_UPSTREAM || process.env.WS_PROXY_MAINNET_UPSTREAM || '',
    headers:
      (process.env.WS_PROXY_MAINNET_ZAN_KEY || process.env.WS_PROXY_MAINNET_KEY)
        ? { 'X-API-KEY': process.env.WS_PROXY_MAINNET_ZAN_KEY || process.env.WS_PROXY_MAINNET_KEY }
        : {},
  },
  'mainnet-alchemy': {
    name: 'mainnet-alchemy',
    url: process.env.WS_PROXY_MAINNET_ALCHEMY_UPSTREAM || '',
    headers: process.env.WS_PROXY_MAINNET_ALCHEMY_KEY ? { 'X-API-KEY': process.env.WS_PROXY_MAINNET_ALCHEMY_KEY } : {},
  },
  'mainnet-uniblock': {
    name: 'mainnet-uniblock',
    url: process.env.WS_PROXY_MAINNET_UNIBLOCK_UPSTREAM || '',
    headers: process.env.WS_PROXY_MAINNET_UNIBLOCK_KEY ? { 'X-API-KEY': process.env.WS_PROXY_MAINNET_UNIBLOCK_KEY } : {},
  },
}

// Log startup warnings/diagnostics
{
  const uni = TESTNET_PROVIDERS.find(p => p.name === 'uniblock')
  log(`testnet route providers (in order): ${TESTNET_PROVIDERS.map(p => p.name).join(' -> ')}`)
  log(`primary testnet provider = uniblock (automatic failover rotation enabled).`)
  if (uni && !(uni.headers && uni.headers['X-API-KEY'])) {
    log('WARNING: no Uniblock testnet key set — the uniblock provider will fail to authenticate.')
    log('         Set WS_PROXY_TESTNET_UNIBLOCK_KEY in frontend/.env.local.')
  }
}
if (['mainnet-alchemy', 'mainnet-uniblock', 'mainnet-zan'].every((k) => !MAINNET_ROUTES[k].url)) {
  log('note: no mainnet WS upstream set (WS_PROXY_MAINNET_{ALCHEMY,UNIBLOCK,ZAN}_UPSTREAM all empty) — /mainnet* routes disabled (fill in at go-live).')
}

// SHARED multiplexer for all testnet paths. This ensures ONE upstream connection is maintained at all
// times, completely eliminating Uniblock 429 "1 of 1 connections in use" errors across tabs.
const testnetMux = createMux({ name: 'testnet', providers: TESTNET_PROVIDERS }, WebSocket, log)

const muxes = {
  'testnet': testnetMux,
  'testnet-uniblock': testnetMux,
  'testnet-alchemy': testnetMux,
  'mainnet-zan': createMux(MAINNET_ROUTES['mainnet-zan'], WebSocket, log),
  'mainnet-alchemy': createMux(MAINNET_ROUTES['mainnet-alchemy'], WebSocket, log),
  'mainnet-uniblock': createMux(MAINNET_ROUTES['mainnet-uniblock'], WebSocket, log),
}

function routeFor(url) {
  const path = (url || '/').split('?')[0].replace(/\/+$/, '').toLowerCase()
  if (path === '/mainnet-alchemy') return 'mainnet-alchemy'
  if (path === '/mainnet-uniblock') return 'mainnet-uniblock'
  if (path === '/mainnet-zan' || path === '/mainnet') return 'mainnet-zan'
  if (path === '/testnet-alchemy') return 'testnet-alchemy'
  if (path === '/testnet-uniblock') return 'testnet-uniblock'
  return 'testnet'
}

// ────────────────────────────────────────────────────────────────────────────
// Local server: accept browser clients and hand each to the right route's multiplexer.
// ────────────────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT })

wss.on('listening', () => {
  log(`listening on ws://localhost:${PORT}`)
  log(`routes: /testnet* (uniblock, alchemy, default) -> ${TESTNET_PROVIDERS.map(p => p.name).join(' -> ')}`)
  log(`        /mainnet-zan      -> ${MAINNET_ROUTES['mainnet-zan'].url || '(disabled — fill in at go-live)'}`)
  log(`        /mainnet-alchemy  -> ${MAINNET_ROUTES['mainnet-alchemy'].url || '(disabled — fill in at go-live)'}`)
  log(`        /mainnet-uniblock -> ${MAINNET_ROUTES['mainnet-uniblock'].url || '(disabled — fill in at go-live)'}`)
})

wss.on('error', (err) => log('SERVER ERROR:', err?.message || err))

wss.on('connection', (client, req) => {
  const routeKey = routeFor(req.url)
  log(`client -> /${routeKey} (${req.url || '/'})`)
  muxes[routeKey].handleClient(client, req)
})

// Graceful shutdown
const shutdown = () => {
  log('shutting down…')
  try { wss.close() } catch {}
  const uniqueMuxes = new Set(Object.values(muxes))
  for (const m of uniqueMuxes) m.shutdown()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

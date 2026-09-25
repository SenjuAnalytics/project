import { http } from 'wagmi'
import { defineChain, fallback, webSocket } from 'viem'
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  rabbyWallet,
  coinbaseWallet,
  phantomWallet,
  walletConnectWallet,
  rainbowWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { usesBlockedRpcKey } from './blockedRpc'

// Robinhood Chain Mainnet (Arbitrum Orbit L2)
export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.mainnet.chain.robinhood.com'] },
    public:  { http: ['https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
  testnet: false,
})

// Robinhood Chain Testnet
export const robinhoodChainTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.chain.robinhood.com'] },
    public:  { http: ['https://rpc.testnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
})

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_ID ||
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ||
  'qualyra-demo'

/**
 * Endpoints, in the order they are tried.
 *
 * A dedicated node answers faster and rate-limits later than a chain's public RPC, which matters here:
 * one page opens with dozens of calls at once. Set NEXT_PUBLIC_RPC_TESTNET / NEXT_PUBLIC_RPC_MAINNET to
 * put one in front; leave them unset and the public endpoint is used on its own. Next.js only inlines
 * these when the name is written out in full, so they are read literally rather than through a variable.
 */
const endpoints = (preferred: string | undefined, chainId: number, ...fallbackUrls: (string | undefined)[]): string[] => {
  const isClient = typeof window !== 'undefined'
  if (isClient) {
    // In the browser, route JSON-RPC traffic through the same-origin /api/rpc proxy.
    // This prevents:
    // 1. Browser CORS blocks (Robinhood testnet node sends invalid `Access-Control-Allow-Origin: *,*`).
    // 2. Alchemy free tier 10-block range limit on `eth_getLogs` (the proxy intelligently routes log queries).
    return [`/api/rpc?chainId=${chainId}`]
  }
  // On the server (SSR), call the dedicated or fallback endpoints directly.
  return [preferred?.trim(), ...fallbackUrls.map(u => u?.trim())].filter((url): url is string => Boolean(url))
}

/**
 * Resolves WebSocket endpoints for a given network.
 * 
 * Rules to protect privacy and domain integrity:
 * 1. If NEXT_PUBLIC_WSS_DOMAIN is set (e.g. wss://qualyra.com/ws), use domain-based endpoints.
 * 2. In browser under HTTPS, do NOT attempt insecure `ws://localhost:8546` (prevents Mixed Content blocks).
 * 3. In local development (HTTP on localhost), `ws://localhost:8546` is permitted for testing scripts/ws-proxy.mjs.
 * 4. Do NOT hardcode external third-party endpoints (e.g. drpc.org) in client bundle to prevent leaking provider hosts in console errors.
 */
function resolveWsEndpoints(options: {
  mainnet?: boolean
  localPath: string
  envOverride?: string
}): (string | undefined)[] {
  const isClient = typeof window !== 'undefined'
  const isHttps = isClient && window.location.protocol === 'https:'
  const isLocal = isClient && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  // If explicit env override is set, use it
  if (options.envOverride) {
    return [options.envOverride]
  }

  // If a domain WSS gateway is defined (e.g. wss://qualyra.com/ws)
  if (process.env.NEXT_PUBLIC_WSS_DOMAIN) {
    const base = process.env.NEXT_PUBLIC_WSS_DOMAIN.replace(/\/+$/, '')
    const path = options.localPath.replace(/^\/+/, '')
    return [`${base}/${path}`]
  }

  // In local browser development (HTTP), permit local ws-proxy.mjs
  if (isLocal && !isHttps) {
    return [`ws://localhost:8546/${options.localPath.replace(/^\/+/, '')}`]
  }

  // In production / HTTPS without domain WSS configured, return empty
  // Viem will smoothly fallback to same-origin /api/rpc HTTP transport without noisy socket connection errors
  return []
}

/**
 * How reads reach the chain.
 *
 * A WebSocket comes first when one is configured, because it is the only way to be told that something
 * happened. Over HTTP there is no such thing: `eth_call` and `eth_getLogs` answer what is true right now
 * and nothing more, so an interface built on them either asks again on a timer or shows stale numbers
 * until the page is reloaded. With a socket the node pushes, and a trade reaches the screen as it lands.
 *
 * Note the chain's own `wss://feed.*.chain.robinhood.com` cannot be used here. On an Arbitrum Orbit chain
 * that is the sequencer feed — it broadcasts raw sequencer messages and ignores JSON-RPC entirely — so
 * `eth_subscribe` needs a provider endpoint instead.
 *
 * HTTP follows as the fallback, batched first. A page opens with dozens of calls at once; sent one at a
 * time they queue, and the one the person is waiting on lands last. Each endpoint is listed twice,
 * batched then plain, since not every node accepts a batched request — viem moves down the list on
 * error, so the worst case is a slower page rather than one that cannot read anything.
 */
const rpcTransport = (wss: (string | undefined)[] | string | undefined, urls: string[]) => {
  const wsList = Array.isArray(wss) ? wss : [wss]
  const validWs = wsList.map(w => w?.trim()).filter((w): w is string => Boolean(w))
  return fallback([
    ...validWs.map(url => webSocket(url, { retryCount: 2, keepAlive: { interval: 20_000 } })),
    ...urls.flatMap(url => [
      http(url, { batch: { wait: 16 }, retryCount: 2 }),
      http(url, { retryCount: 2 }),
    ]),
  ])
}

export const wagmiConfig = getDefaultConfig({
  appName: 'QUALYRA',
  projectId: walletConnectProjectId,
  chains: [robinhoodChainTestnet, robinhoodChain],
  wallets: [
    {
      groupName: 'Popular & Recommended',
      wallets: [
        metaMaskWallet,
        rabbyWallet,
        coinbaseWallet,
        phantomWallet,
        walletConnectWallet,
        rainbowWallet,
      ],
    },
  ],
  transports: {
    // MAINNET (chain 4663) — SCAFFOLD ONLY, not in use yet. Mirrors testnet: THREE keyed providers
    // (ZAN, Alchemy, Uniblock) are pre-wired through the LOCAL proxy (scripts/ws-proxy.mjs), each on its
    // own `/mainnet-*` route so their keys stay server-side and never enter the browser bundle. Every
    // route is disabled until its WS_PROXY_MAINNET_*_UPSTREAM is filled in at go-live; until then this
    // resolves to those (disabled) proxy routes plus the public official mainnet RPC over HTTP — no keys
    // anywhere in the browser bundle.
    [robinhoodChain.id]: rpcTransport(
      [
        ...resolveWsEndpoints({
          mainnet: true,
          localPath: 'mainnet-zan',
          envOverride: process.env.NEXT_PUBLIC_WSS_MAINNET_ZAN_PROXY || process.env.NEXT_PUBLIC_WSS_MAINNET_PROXY,
        }),
        ...resolveWsEndpoints({
          mainnet: true,
          localPath: 'mainnet-alchemy',
          envOverride: process.env.NEXT_PUBLIC_WSS_MAINNET_ALCHEMY_PROXY,
        }),
        ...resolveWsEndpoints({
          mainnet: true,
          localPath: 'mainnet-uniblock',
          envOverride: process.env.NEXT_PUBLIC_WSS_MAINNET_UNIBLOCK_PROXY,
        }),
        // Optional extra fallback: a *keyless* WSS endpoint for redundancy. Any keyed URL is rejected
        // so a secret can never be shipped to the browser — put keyed endpoints behind the proxy, not here.
        process.env.NEXT_PUBLIC_WSS_MAINNET && !process.env.NEXT_PUBLIC_WSS_MAINNET.includes('alch_')
          ? process.env.NEXT_PUBLIC_WSS_MAINNET
          : undefined,
      ],
      endpoints(
        // Browser HTTP reads go through the same-origin /api/rpc proxy (any key lives there, server-side);
        // for SSR fall back to the public official mainnet RPC below (no key needed).
        undefined,
        robinhoodChain.id,
        robinhoodChain.rpcUrls.default.http[0],
      ),
    ),
    [robinhoodChainTestnet.id]: rpcTransport(
      [
        ...resolveWsEndpoints({
          mainnet: false,
          localPath: 'testnet-uniblock',
          envOverride: process.env.NEXT_PUBLIC_WSS_TESTNET_UNIBLOCK_PROXY || process.env.NEXT_PUBLIC_WSS_TESTNET_PROXY,
        }),
        ...resolveWsEndpoints({
          mainnet: false,
          localPath: 'testnet-alchemy',
          envOverride: process.env.NEXT_PUBLIC_WSS_TESTNET_ALCHEMY_PROXY,
        }),
        // Optional extra fallback: a *keyless* WSS endpoint. Any Alchemy-keyed URL is rejected so a
        // secret can never be shipped to the browser — put keyed endpoints behind the proxy, not here.
        process.env.NEXT_PUBLIC_WSS_TESTNET && !process.env.NEXT_PUBLIC_WSS_TESTNET.includes('alch_')
          ? process.env.NEXT_PUBLIC_WSS_TESTNET
          : undefined,
      ],
      endpoints(
        process.env.NEXT_PUBLIC_RPC_TESTNET && !usesBlockedRpcKey(process.env.NEXT_PUBLIC_RPC_TESTNET)
          ? process.env.NEXT_PUBLIC_RPC_TESTNET
          : robinhoodChainTestnet.rpcUrls.default.http[0],
        robinhoodChainTestnet.id,
        robinhoodChainTestnet.rpcUrls.default.http[0],
      ),
    ),
  },
  ssr: true,
})

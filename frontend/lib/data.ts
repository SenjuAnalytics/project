export interface Project {
  id: string
  name: string
  tick: string
  desc: string
  creator: string
  price: number
  mcap: number
  raised: number
  goal: number
  progress: number
  holders: number
  vol24: number
  raw: number
  ret: string
  chg: number
  seed: number
  status: 'bonding' | 'graduated'
  /** Exact bonding-curve price at graduation (quoteReserve == graduationThreshold); undefined when not a live bonding token. */
  graduationPrice?: number
  /** Timestamp (in seconds) when the token graduated and migrated to DEX pool. */
  graduatedAt?: number
  battle: number
  rwa: boolean
  rwaType?: 'stock' | 'etf' | 'treasury' | 'paired'
  poolAddress?: string
  liquidity?: number
  pooledBase?: number
  pooledQuote?: number
  pooledQuoteSymbol?: string
  /** Creator tax in percent, chosen at launch and locked for the life of the token. */
  creatorTax: number
  entry: number
  hi: number
  lo: number
  isCreator?: boolean
  quoteAsset?: string
  logoUrl?: string
  logoFit?: 'cover' | 'contain'
  logoShape?: 'squircle' | 'circle'
  logoBg?: 'transparent' | 'white' | 'dark'
  logoScale?: number
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  address?: string
  creatorAddress?: string
  quoteAssetAddress?: string
  /** Launch time in seconds, from the factory's launch record. */
  launchedAt?: number
  /** Fee split locked in at launch, in basis points of the trade fee. */
  creatorShareBps?: number
  competitionShareBps?: number
  explorerUrl?: string
  platform?: string
}

export interface RwaAsset {
  id: string
  name: string
  ticker: string
  token: string
  type: 'stock' | 'etf' | 'treasury'
  price: number
  chg: number
  mcap: number | null
  aum: number
  flag: string
  chg24: number
  desc: string
  address?: string
  poolAddress?: string
  explorerUrl?: string
  logoUrl?: string
}

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'pons',
    name: 'Pons',
    tick: 'PONS',
    desc: '100% of fees go back to Pons. Official native utility & buyback token for Pons Launchpad on Robinhood Chain.',
    creator: '0x39dB...4571',
    address: '0x39dBED3a2bd333467115dE45665cC57F813C4571',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0x39dBED3a2bd333467115dE45665cC57F813C4571',
    platform: 'Pons Launchpad',
    logoUrl: '/tokens/pons.png',
    price: 0.5857,
    mcap: 402650000,
    raised: 50,
    goal: 50,
    progress: 100,
    holders: 96340,
    vol24: 3416000,
    raw: 402650000,
    ret: '85%',
    chg: -4.63,
    seed: 1,
    status: 'graduated',
    battle: 1,
    rwa: false,
    poolAddress: '0x10CC6BD38112cAc182db90B6a71d8Bb5939526bA',
    liquidity: 5040000,
    pooledBase: 4118060,
    pooledQuote: 1121.21,
    pooledQuoteSymbol: 'WETH',
    creatorTax: 2,
    entry: 0.582,
    hi: 0.698,
    lo: 0.512,
    quoteAsset: 'ETH',
  },
  {
    id: 'ai',
    name: 'Artificial Inu',
    tick: 'AI',
    desc: 'Premier AI meme token on Robinhood Chain launched via Long.xyz, paired with NVIDIA (NVDA) stock token liquidity.',
    creator: '0xeb7C...0862',
    address: '0x2e8c31162b855a2ffa90f6f8634643ad6f111e18',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0x2e8c31162b855a2ffa90f6f8634643ad6f111e18',
    platform: 'Long.xyz',
    logoUrl: '/tokens/ai.jpg',
    price: 0.2691,
    mcap: 266200000,
    raised: 50,
    goal: 50,
    progress: 100,
    holders: 47500,
    vol24: 3373000,
    raw: 266200000,
    ret: '92%',
    chg: -12.24,
    seed: 2,
    status: 'graduated',
    battle: 1,
    rwa: true,
    rwaType: 'paired',
    poolAddress: '0xc4a21f9d6485FC5893DD4A491B320a83DAF4Da1D',
    liquidity: 4410000,
    pooledBase: 8345598,
    pooledQuote: 890.39,
    pooledQuoteSymbol: 'WETH',
    creatorTax: 2,
    entry: 0.245,
    hi: 0.342,
    lo: 0.252,
    quoteAsset: 'NVDA',
  },
]

export const RWA_ASSETS: RwaAsset[] = [
  {
    id: 'nvda',
    name: 'NVIDIA Corp.',
    ticker: 'NVDA',
    token: 'NVDA',
    type: 'stock',
    price: 213.16,
    chg: 0.57,
    mcap: 5.21e12,
    aum: 7324500,
    flag: '🟢',
    chg24: 0.57,
    address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
    poolAddress: '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
    logoUrl: '/tokens/nvda.svg',
    desc: 'Semiconductors & AI Computing'
  },
  {
    id: 'aapl',
    name: 'Apple Inc.',
    ticker: 'AAPL',
    token: 'AAPL',
    type: 'stock',
    price: 331.40,
    chg: -0.52,
    mcap: 5.07e12,
    aum: 433500,
    flag: '🍎',
    chg24: -0.52,
    address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
    poolAddress: '0xaae0d815ee56e4092a5e5c2911e676fea50b2d6d',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
    logoUrl: '/tokens/aapl.svg',
    desc: 'Consumer Tech & Silicon'
  },
  {
    id: 'spy',
    name: 'SPDR S&P 500 ETF Trust',
    ticker: 'SPY',
    token: 'SPY',
    type: 'stock',
    price: 758.30,
    chg: -0.46,
    mcap: 6.12e11,
    aum: 396600,
    flag: '📊',
    chg24: -0.46,
    address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
    poolAddress: '0x38453c115607463ac284820ce959831042f3df4e',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
    logoUrl: '/tokens/spy.svg',
    desc: 'S&P 500 Index ETF'
  },
  {
    id: 'googl',
    name: 'Alphabet Class A',
    ticker: 'GOOGL',
    token: 'GOOGL',
    type: 'stock',
    price: 344.93,
    chg: 1.25,
    mcap: 2.15e12,
    aum: 1201900,
    flag: '🔍',
    chg24: 1.25,
    address: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3',
    poolAddress: '0x34d0dc122cf9a8eb296fc5e0d3a233625d7d19b7',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3',
    logoUrl: '/tokens/googl.svg',
    desc: 'Internet & Cloud Platforms'
  },
  {
    id: 'gme',
    name: 'GameStop Corp.',
    ticker: 'GME',
    token: 'GME',
    type: 'stock',
    price: 21.35,
    chg: -2.10,
    mcap: 9.85e9,
    aum: 642200,
    flag: '🎮',
    chg24: -2.10,
    address: '0x1b0E319c6A659F002271B69dB8A7df2F911c153E',
    poolAddress: '0xe2b46c905e12ab8e2f864e4821a4325884c1b126',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0x1b0E319c6A659F002271B69dB8A7df2F911c153E',
    logoUrl: '/tokens/gme.svg',
    desc: 'Gaming & Retail Equity'
  },
  {
    id: 'spcx',
    name: 'Space Exploration Technologies',
    ticker: 'SPCX',
    token: 'SPCX',
    type: 'stock',
    price: 185.20,
    chg: 3.42,
    mcap: 3.50e11,
    aum: 3230000,
    flag: '🚀',
    chg24: 3.42,
    address: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa',
    poolAddress: '0xc61284332117c3fb23a2a56cceffd07f7af60029',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa',
    logoUrl: '/tokens/spcx.svg',
    desc: 'Space & Satellite Tech'
  },
  {
    id: 'sgov',
    name: 'iShares 0-3M Treasury Bond',
    ticker: 'SGOV',
    token: 'SGOV',
    type: 'treasury',
    price: 100.54,
    chg: 0.04,
    mcap: 3.82e10,
    aum: 5200000,
    flag: '🏛',
    chg24: 0.04,
    address: '0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5',
    poolAddress: '0xfab520051f96f4d2a32c22b6a3dd7fffdf231bfe',
    explorerUrl: 'https://robinhoodchain.blockscout.com/token/0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5',
    logoUrl: '/tokens/sgov.svg',
    desc: 'Short-Term U.S. Treasury'
  },
]

export function rwaAssetToProject(a: RwaAsset): Project {
  return {
    id: a.id,
    name: a.name,
    tick: a.token,
    logoUrl: a.logoUrl,
    desc: `Robinhood stock token for ${a.name} (${a.ticker}).`,
    creator: 'Robinhood Chain DEX',
    address: a.address,
    explorerUrl: a.explorerUrl,
    poolAddress: a.poolAddress,
    platform: 'Robinhood DEX',
    price: a.price,
    // Market data comes from the price feed. Nothing is derived from the placeholder AUM figure.
    mcap: a.mcap ?? 0,
    raised: 50,
    goal: 50,
    progress: 100,
    holders: 0,
    vol24: 0,
    raw: 0,
    ret: '',
    chg: a.chg24,
    seed: 0,
    status: 'graduated',
    battle: 0,
    rwa: true,
    rwaType: a.type,
    creatorTax: 0,
    entry: a.price,
    hi: a.price,
    lo: a.price,
    quoteAsset: 'USDG',
  }
}

export const RWA_PROJECTS: Project[] = RWA_ASSETS.map(rwaAssetToProject)

export const ALL_INITIAL_PROJECTS: Project[] = [...INITIAL_PROJECTS, ...RWA_PROJECTS]

export {
  getStoredProjects,
  saveCustomProject,
  getUserPositions,
  saveUserPositions,
  getTradeFills,
  saveTradeFill,
  executeTrade,
  type UserPosition,
  type TradeFill,
} from './storage'


// Qualyra contract addresses and ABIs.
//
// The ABIs under ./abis are generated from the compiled contracts by scripts/sync-abi.mjs.
// Re-run it after any change to contracts/src, never edit those files by hand.
//
// The nine platform contracts are deployed once per chain and listed here. Everything that belongs
// to a single launch — its token, its bonding curve, its pool — is created at launch time and read
// from the factory at runtime, so those addresses never appear in this file.

import { robinhoodChain, robinhoodChainTestnet } from './wagmi'
// Single source of truth for the live testnet (chain 46630) addresses, generated
// from the Foundry broadcast (see `npm run gen-deployments` in ../indexer). A
// redeploy only needs deployments/46630.json regenerated — these fallbacks follow.
import testnetDeployment from '../../deployments/46630.json'

export * from './abis'

export type Address = `0x${string}`

/** Returned for every contract that has not been deployed on a chain yet. */
export const NOT_DEPLOYED = '0x0000000000000000000000000000000000000000' as const

export type QualyraDeployment = {
  factory: Address
  /** Periphery. Not one of the nine platform contracts; nothing in the core trusts it. */
  swapRouter: Address
  launchRouter: Address
  launchDeployer: Address
  hook: Address
  feeVault: Address
  competitionVault: Address
  graduationExecutor: Address
  liquidityLocker: Address
  buybackBurner: Address
  /** Uniswap v4 singleton PoolManager for this chain (canonical, not a Qualyra contract). Holds the pooled token reserves. */
  poolManager: Address
}

/** Pair assets a token can be launched against, beyond native ETH. */
export type QualyraPairAssets = {
  usdg: Address
  stocks: { symbol: string; address: Address }[]
}

/**
 * Next.js only substitutes `process.env.NEXT_PUBLIC_*` where it is written out in full, so every name has
 * to appear literally here. Reading them through a variable silently yields undefined in the browser.
 */
const addr = (value: string | undefined, fallback: Address = NOT_DEPLOYED): Address =>
  value && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value as Address) : fallback

const MAINNET: QualyraDeployment = {
  factory: addr(process.env.NEXT_PUBLIC_QUALYRA_FACTORY),
  swapRouter: addr(process.env.NEXT_PUBLIC_QUALYRA_SWAP_ROUTER),
  launchRouter: addr(process.env.NEXT_PUBLIC_QUALYRA_LAUNCH_ROUTER),
  launchDeployer: addr(process.env.NEXT_PUBLIC_QUALYRA_LAUNCH_DEPLOYER),
  hook: addr(process.env.NEXT_PUBLIC_QUALYRA_HOOK),
  feeVault: addr(process.env.NEXT_PUBLIC_QUALYRA_FEE_VAULT),
  competitionVault: addr(process.env.NEXT_PUBLIC_QUALYRA_COMPETITION_VAULT),
  graduationExecutor: addr(process.env.NEXT_PUBLIC_QUALYRA_GRADUATION_EXECUTOR),
  liquidityLocker: addr(process.env.NEXT_PUBLIC_QUALYRA_LIQUIDITY_LOCKER),
  buybackBurner: addr(process.env.NEXT_PUBLIC_QUALYRA_BUYBACK_BURNER),
  poolManager: addr(process.env.NEXT_PUBLIC_QUALYRA_POOL_MANAGER),
}

const TC = testnetDeployment.contracts
const TESTNET: QualyraDeployment = {
  factory: addr(process.env.NEXT_PUBLIC_QUALYRA_FACTORY_TESTNET, TC.factory as Address),
  swapRouter: addr(process.env.NEXT_PUBLIC_QUALYRA_SWAP_ROUTER_TESTNET, TC.swapRouter as Address),
  launchRouter: addr(process.env.NEXT_PUBLIC_QUALYRA_LAUNCH_ROUTER_TESTNET, TC.launchRouter as Address),
  launchDeployer: addr(process.env.NEXT_PUBLIC_QUALYRA_LAUNCH_DEPLOYER_TESTNET, TC.launchDeployer as Address),
  hook: addr(process.env.NEXT_PUBLIC_QUALYRA_HOOK_TESTNET, TC.hook as Address),
  feeVault: addr(process.env.NEXT_PUBLIC_QUALYRA_FEE_VAULT_TESTNET, TC.feeVault as Address),
  competitionVault: addr(process.env.NEXT_PUBLIC_QUALYRA_COMPETITION_VAULT_TESTNET, TC.competitionVault as Address),
  graduationExecutor: addr(process.env.NEXT_PUBLIC_QUALYRA_GRADUATION_EXECUTOR_TESTNET, TC.graduationExecutor as Address),
  liquidityLocker: addr(process.env.NEXT_PUBLIC_QUALYRA_LIQUIDITY_LOCKER_TESTNET, TC.liquidityLocker as Address),
  buybackBurner: addr(process.env.NEXT_PUBLIC_QUALYRA_BUYBACK_BURNER_TESTNET, TC.buybackBurner as Address),
  poolManager: addr(process.env.NEXT_PUBLIC_QUALYRA_POOL_MANAGER_TESTNET, testnetDeployment.external.poolManager as Address),
}

export const QUALYRA_DEPLOYMENTS: Record<number, QualyraDeployment> = {
  [robinhoodChain.id]: MAINNET,
  [robinhoodChainTestnet.id]: TESTNET,
}

// Pair assets on Robinhood Chain. USDG has 6 decimals, the stock tokens 18. These three stocks are
// listed by the deploy script; anything added later is listed through the timelock and read from
// the factory, so treat this as the launch set rather than the whole list.
export const ROBINHOOD_PAIR_ASSETS: QualyraPairAssets = {
  usdg: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168',
  stocks: [
    { symbol: 'NVDA', address: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC' },
    { symbol: 'AAPL', address: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9' },
    { symbol: 'SPY', address: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C' },
  ],
}

/**
 * Pair assets a token can be launched against, in the order the launch form offers them.
 * This is the list `DeployQualyra.s.sol` passes to `setQuoteAsset`. Anything not here cannot be
 * launched against, even when the token itself trades on Robinhood Chain.
 */
export const LAUNCH_PAIR_ASSETS = ['ETH', 'USDG', 'NVDA', 'AAPL', 'SPY'] as const

export type LaunchPairAsset = (typeof LAUNCH_PAIR_ASSETS)[number]

/**
 * Graduation target per pair asset, in whole units of that asset. Fixed by the factory, not chosen
 * by the creator. ETH and USDG match Pons V2; the stock figures are Pons's own on-chain values, so a
 * launch prices identically on both platforms. Mirrors the literals in `DeployQualyra.s.sol`.
 */
export const GRADUATION_TARGET: Record<LaunchPairAsset, number> = {
  ETH: 4.2,
  USDG: 8_090,
  NVDA: 41.6,
  AAPL: 24.2,
  SPY: 10.9,
}

/** Decimals of each pair asset, as the factory records them. */
export const PAIR_ASSET_DECIMALS: Record<LaunchPairAsset, number> = {
  ETH: 18,
  USDG: 6,
  NVDA: 18,
  AAPL: 18,
  SPY: 18,
}

export const USDG_DECIMALS = 6
export const STOCK_TOKEN_DECIMALS = 18

/** Native ETH is the default pair asset and is addressed as the zero address on chain. */
export const NATIVE_PAIR_ASSET = '0x0000000000000000000000000000000000000000' as const

export const qualyraDeployment = (chainId: number): QualyraDeployment | undefined =>
  QUALYRA_DEPLOYMENTS[chainId]

/** False while a contract is still at the zero address, so the UI can say so instead of calling it. */
export const isDeployed = (address: Address | undefined): boolean =>
  address !== undefined && address !== NOT_DEPLOYED

/** True once every platform contract on this chain has an address. */
export const isPlatformLive = (chainId: number): boolean => {
  const deployment = qualyraDeployment(chainId)
  if (deployment === undefined) return false
  // swapRouter is periphery, so the platform counts as live without it.
  const { swapRouter, poolManager, ...core } = deployment
  void swapRouter
  void poolManager
  return Object.values(core).every(isDeployed)
}

/** Block explorer for a chain. Anything that isn't mainnet gets the testnet explorer, like the contracts. */
export const explorerUrl = (chainId: number): string =>
  chainId === robinhoodChain.id
    ? robinhoodChain.blockExplorers.default.url
    : robinhoodChainTestnet.blockExplorers.default.url

/** Resolves the target chain ID with deployed Qualyra contracts, falling back to testnet when mainnet is not yet live. */
export const resolveTargetChainId = (connectedChainId?: number): number => {
  if (connectedChainId && isDeployed(qualyraDeployment(connectedChainId)?.factory)) {
    return connectedChainId
  }
  return robinhoodChainTestnet.id
}


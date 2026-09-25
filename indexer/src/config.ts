/**
 * config.ts
 * -----------------------------------------------------------------------------
 * Central, fully-documented configuration for the Qualyra deterministic indexer.
 *
 * Every value that can affect the produced dataset / result hashes is captured
 * here so that a run is reproducible: given the same chain data, the same
 * config, and the same params, the same canonical bytes (and therefore the same
 * keccak256 hashes) are produced on any machine.
 *
 * NOTE: The USD reference prices below are a DOCUMENTED, REPRODUCIBLE config
 * constant — they are NOT a live oracle. USDG is pinned at $1. All other pair
 * assets' USD price basis is configurable via environment variables so a
 * reproduction run can pin the exact basis used.
 */

import { readFileSync } from "node:fs";

/**
 * SINGLE SOURCE OF TRUTH (repo root): deployments/<chainId>.json — generated
 * from the Foundry broadcast by `npm run gen-deployments`. A platform redeploy
 * only requires regenerating that one file; the addresses/block below are read
 * from it, so nothing here is hand-edited per deploy.
 */
interface DeploymentFile {
  chainId: number;
  deployBlock: number;
  contracts: {
    factory: string;
    launchDeployer: string;
    feeVault: string;
    competitionVault: string;
    graduationExecutor: string;
    liquidityLocker: string;
    buybackBurner: string;
    launchRouter: string;
    hook: string;
    swapRouter: string;
    /** Testnet USDG mock (MockERC20). Present once DeployTestnetUsdgPool has run. */
    usdg?: string;
  };
  external: { poolManager: string };
  /** ETH/USDG reference-pool key params (fee/tickSpacing/hooks). Optional. */
  ethUsdgPool?: { fee: number; tickSpacing: number; hooks: string };
}

const DEPLOYMENT = JSON.parse(
  readFileSync(new URL("../../deployments/46630.json", import.meta.url), "utf8"),
) as DeploymentFile;

/** Robinhood Chain testnet id. */
export const CHAIN_ID = 46630;

/** Default public RPC. Override with INDEXER_RPC_URL. */
export const RPC_URL: string =
  process.env.INDEXER_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com";

/**
 * DEPLOY_BLOCK is the factory deploy block, read from the auto-generated
 * deployments file so it TRACKS EVERY REDEPLOY with no manual edit. Nothing the
 * indexer cares about (TokenLaunched / Bought / Sold / Swapped) can exist before
 * the factory itself, so it is a provably-safe, tight scan floor.
 *
 * START_BLOCK defaults to DEPLOY_BLOCK, so a run is fast AND automatic: after a
 * redeploy `npm run gen-deployments` refreshes DEPLOY_BLOCK and the indexer picks
 * it up with NO manual INDEXER_START_BLOCK. The env var still overrides it (e.g.
 * to narrow a very large history); curve/creator discovery is decoupled (cli.ts)
 * and ALWAYS scans from DEPLOY_BLOCK, so a too-high override can never silently
 * drop a token's trades. START_BLOCK is NOT part of configSnapshot(), so changing
 * it never affects the dataset/result hashes.
 */
export const DEPLOY_BLOCK: bigint = BigInt(DEPLOYMENT.deployBlock);

export const START_BLOCK: bigint = process.env.INDEXER_START_BLOCK
  ? BigInt(process.env.INDEXER_START_BLOCK)
  : DEPLOY_BLOCK;

/** getLogs pagination window (blocks per request). Configurable. */
export const LOG_PAGE_SIZE: bigint = process.env.INDEXER_LOG_PAGE_SIZE
  ? BigInt(process.env.INDEXER_LOG_PAGE_SIZE)
  : 5000n;

/**
 * SINGLE SOURCE OF TRUTH for addresses.
 * -----------------------------------------------------------------------------
 * Only THREE addresses are canonical/hardcoded roots (env-overridable):
 *
 *   • factory     — the QualyraFactory. All PLATFORM modules (competitionVault,
 *                   buybackBurner, launchRouter, hook, feeVault,
 *                   graduationExecutor, liquidityLocker) are read from it
 *                   on-chain at runtime via `resolveAddresses()` — so a
 *                   platform redeploy only needs `factory` changed here.
 *   • swapRouter  — PERIPHERY. The factory does NOT store it (no getter), so it
 *                   must be provided independently.
 *   • poolManager — EXTERNAL (Uniswap v4 PoolManager). Not a factory getter.
 *
 * The remaining fields below are DEFAULTS/FALLBACKS: they are the values for the
 * current deployment and are used (a) offline (tests, pure functions) where no
 * RPC is available, and (b) as the value embedded in `configSnapshot()` so the
 * dataset hash stays reproducible. At runtime the network paths override the
 * platform modules with the values resolved from the factory (see
 * `resolveAddresses.ts`). For the current deployment the resolved values equal
 * these defaults, so hashes/snapshots are unaffected.
 */
export const ADDRESSES = {
  // --- canonical hardcoded roots (env-overridable) ---
  factory: process.env.INDEXER_FACTORY ?? DEPLOYMENT.contracts.factory,
  swapRouter: process.env.INDEXER_SWAP_ROUTER ?? DEPLOYMENT.contracts.swapRouter,
  poolManager: process.env.INDEXER_POOL_MANAGER ?? DEPLOYMENT.external.poolManager,
  // --- platform modules: defaults/fallbacks, resolved on-chain from factory at runtime ---
  hook: DEPLOYMENT.contracts.hook,
  competitionVault: DEPLOYMENT.contracts.competitionVault,
  launchRouter: DEPLOYMENT.contracts.launchRouter,
  /** Buyback/burn contract — any purchase originating from this wallet is excluded. */
  buybackBurner: DEPLOYMENT.contracts.buybackBurner,
} as const;

/**
 * The set of platform module addresses that are resolvable on-chain from the
 * factory. `swapRouter` and `poolManager` are intentionally excluded (periphery
 * / external — the factory has no getter for them).
 */
export type ResolvableModule =
  | "hook"
  | "competitionVault"
  | "launchRouter"
  | "buybackBurner"
  | "feeVault"
  | "graduationExecutor"
  | "liquidityLocker";

/**
 * A fully-resolved address set: the three hardcoded roots plus the modules read
 * from the factory. Shape is intentionally flat + all-string for easy embedding
 * and comparison.
 */
export interface ResolvedAddresses {
  factory: string;
  swapRouter: string;
  poolManager: string;
  hook: string;
  competitionVault: string;
  launchRouter: string;
  buybackBurner: string;
  feeVault: string;
  graduationExecutor: string;
  liquidityLocker: string;
}

export type PairAssetSymbol = "ETH" | "USDG" | "NVDA" | "AAPL" | "SPY";

export interface PairAsset {
  symbol: PairAssetSymbol;
  address: `0x${string}`;
  decimals: number;
  /** USD reference price (documented constant, NOT an oracle). */
  usd: number;
}

/**
 * USD price-basis map.
 *
 * USDG is pinned at exactly $1.00. ETH / NVDA / AAPL / SPY use documented,
 * configurable constants (override via the corresponding INDEXER_PRICE_* env
 * var). These are a reproducible reference basis — pin them for a reproduction.
 */
function priceFromEnv(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid ${envVar}: ${raw}`);
  }
  return n;
}

export const PAIR_ASSETS: Record<PairAssetSymbol, PairAsset> = {
  ETH: {
    symbol: "ETH",
    address: "0x0000000000000000000000000000000000000000",
    decimals: 18,
    usd: priceFromEnv("INDEXER_PRICE_ETH_USD", 2660),
  },
  USDG: {
    symbol: "USDG",
    // Auto-sourced from the deployments file (single source of truth): a USDG
    // redeploy is picked up by `npm run gen-deployments` with NO manual
    // INDEXER_USDG_ADDRESS. Env still overrides; falls back to mainnet USDG when
    // the deployments file has none (e.g. a chain where USDG is canonical).
    address: (process.env.INDEXER_USDG_ADDRESS ?? DEPLOYMENT.contracts.usdg ?? "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168") as `0x${string}`,
    decimals: 6,
    usd: 1.0, // pinned stablecoin basis
  },
  NVDA: {
    symbol: "NVDA",
    address: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
    decimals: 18,
    usd: priceFromEnv("INDEXER_PRICE_NVDA_USD", 120),
  },
  AAPL: {
    symbol: "AAPL",
    address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
    decimals: 18,
    usd: priceFromEnv("INDEXER_PRICE_AAPL_USD", 210),
  },
  SPY: {
    symbol: "SPY",
    address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C",
    decimals: 18,
    usd: priceFromEnv("INDEXER_PRICE_SPY_USD", 550),
  },
};

/** Lookup a pair asset by (lowercased) address. Returns undefined if unknown. */
export function pairAssetByAddress(
  address: string,
): PairAsset | undefined {
  const lc = address.toLowerCase();
  return Object.values(PAIR_ASSETS).find(
    (a) => a.address.toLowerCase() === lc,
  );
}

/**
 * Qualified Volume filter parameters. Every parameter that can change the
 * filtered trade set (and therefore the hash) lives here and is documented.
 */
export const QV_PARAMS = {
  /** Minimum USD notional per trade; trades below this are dropped. */
  minTradeUsd: process.env.INDEXER_MIN_TRADE_USD
    ? Number(process.env.INDEXER_MIN_TRADE_USD)
    : 1.0,
  /**
   * Net out same-wallet round-trip buy/sell volume. When true, a wallet's sell
   * notional on a token cancels an equal amount of its buy notional on that
   * token before QV is computed (v1: netting at the USD-notional level).
   */
  netRoundTrips: process.env.INDEXER_NET_ROUNDTRIPS
    ? process.env.INDEXER_NET_ROUNDTRIPS === "true"
    : true,
  /** Path to optional connected-wallet denylist. */
  denylistPath: process.env.INDEXER_DENYLIST_PATH ?? "connected-wallets.json",
} as const;

/** Battle scoring constants. */
export const SCORE_SCALE = 10n ** 18n; // 1e18 fixed-point scale
export const DRAW_MARGIN = 10n ** 16n; // 1e16 == 1% of SCORE_SCALE

/** Weekly leaderboard time math (contract-aligned). */
export const WEEK = 604800n; // 7 days in seconds
export const WEEK_SHIFT = 259200n; // 3 days, aligns week start to Monday 00:00 UTC

/** Outcome enum ints (must match on-chain enum). */
export const OUTCOME = {
  None: 0,
  WinnerA: 1,
  WinnerB: 2,
  Draw: 3,
  DisqualifiedA: 4,
  DisqualifiedB: 5,
  Void: 6,
} as const;
export type OutcomeName = keyof typeof OUTCOME;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"; export const PRICE_MODE: "constant" | "onchain" = process.env.INDEXER_PRICE_MODE === "constant" ? "constant" : "onchain"; export const ETH_USDG_POOL = { fee: process.env.INDEXER_ETH_USDG_FEE ? Number(process.env.INDEXER_ETH_USDG_FEE) : (DEPLOYMENT.ethUsdgPool?.fee ?? 3000), tickSpacing: process.env.INDEXER_ETH_USDG_TICK_SPACING ? Number(process.env.INDEXER_ETH_USDG_TICK_SPACING) : (DEPLOYMENT.ethUsdgPool?.tickSpacing ?? 60), hooks: (process.env.INDEXER_ETH_USDG_HOOKS ?? DEPLOYMENT.ethUsdgPool?.hooks ?? ZERO_ADDRESS) as `0x${string}` } as const;

/**
 * Snapshot of config that is embedded (deterministically) into the dataset.
 * Only reproducibility-relevant fields; addresses lowercased for stability.
 */
export function configSnapshot() {
  return {
    chainId: CHAIN_ID,
    addresses: Object.fromEntries(
      Object.entries(ADDRESSES).map(([k, v]) => [k, v.toLowerCase()]),
    ),
    pairAssets: Object.fromEntries(
      Object.values(PAIR_ASSETS).map((a) => [
        a.symbol,
        {
          address: a.address.toLowerCase(),
          decimals: a.decimals,
          usd: a.usd,
        },
      ]),
    ),
  };
}

/** Snapshot of QV params embedded into the dataset for reproducibility. */
export function paramsSnapshot() {
  return {
    minTradeUsd: QV_PARAMS.minTradeUsd,
    netRoundTrips: QV_PARAMS.netRoundTrips,
    scoreScale: SCORE_SCALE,
    drawMargin: DRAW_MARGIN,
    week: WEEK,
    weekShift: WEEK_SHIFT,
  };
}

/**
 * abi/index.ts
 * -----------------------------------------------------------------------------
 * Re-exports the deployed contract ABIs (imported from ../../contracts/abi/*.json)
 * plus strongly-typed viem event fragments for the events the indexer consumes.
 *
 * ABIs are loaded via a JSON import assertion (Node >=18, ESM). We keep the raw
 * ABI arrays available for callers that want them, and expose hand-written
 * event fragments (parsed with viem's parseAbiItem) for the specific events so
 * ingest.ts can decode logs without depending on ABI ordering.
 */
import { parseAbiItem } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAbi(name: string): unknown[] {
  const p = resolve(__dirname, "../../..", "contracts", "abi", `${name}.json`);
  return JSON.parse(readFileSync(p, "utf8")) as unknown[];
}

export const QualyraSwapRouterAbi = loadAbi("QualyraSwapRouter");
export const QualyraHookAbi = loadAbi("QualyraHook");
export const QualyraBondingCurveAbi = loadAbi("QualyraBondingCurve");
export const QualyraFactoryAbi = loadAbi("QualyraFactory");
export const QualyraCompetitionVaultAbi = loadAbi("QualyraCompetitionVault");
export const QualyraBuybackBurnerAbi = loadAbi("QualyraBuybackBurner");

/* ------------------------------------------------------------------ */
/* Typed event fragments (verified signatures from dataForAgent).      */
/* ------------------------------------------------------------------ */

export const SwappedEvent = parseAbiItem(
  "event Swapped(address indexed token, address indexed payer, address indexed recipient, bool buyingToken, uint256 amountIn, uint256 amountOut)",
);

export const FeeAccruedEvent = parseAbiItem(
  "event FeeAccrued(address indexed token, uint256 indexed battleId, uint256 tradeFee, uint256 creatorTax)",
);

export const BoughtEvent = parseAbiItem(
  "event Bought(address indexed payer, address indexed recipient, uint256 amountIn, uint256 tokensOut, uint256 tradeFee, uint256 creatorTax, uint256 snipeTax, uint256 quoteReserve)",
);

export const SoldEvent = parseAbiItem(
  "event Sold(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 amountOut, uint256 tradeFee, uint256 creatorTax, uint256 quoteReserve)",
);

export const TokenLaunchedEvent = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed curve, address indexed creator, address quoteAsset, uint256 creatorTaxBps, string name, string symbol, string metadataURI)",
);

/* ------------------------------------------------------------------ */
/* Uniswap v4 PoolManager events (for the on-chain ETH/USDG price).    */
/* `PoolId` is bytes32; `Currency`/`IHooks` are address. `id` is the   */
/* first indexed topic, so logs are filtered by { id: poolId }. Both   */
/* events carry sqrtPriceX96 in their data payload.                    */
/* ------------------------------------------------------------------ */

export const V4SwapEvent = parseAbiItem(
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)",
);

export const V4InitializeEvent = parseAbiItem(
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
);

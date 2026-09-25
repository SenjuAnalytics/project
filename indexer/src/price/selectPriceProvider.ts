/**
 * price/selectPriceProvider.ts
 * -----------------------------------------------------------------------------
 * Chooses the PriceProvider for a run based on INDEXER_PRICE_MODE:
 *   - "onchain" (DEFAULT)  -> OnchainPriceProvider (derives ETH/USD from the
 *                             ETH/USDG v4 pool's LAST Swap/Initialize event at a
 *                             block <= the pin; SAME code path on testnet 46630
 *                             and mainnet 4663 — no chain branch, no archive RPC)
 *   - "constant"           -> ConstantPriceProvider (offline/CI documented basis)
 *
 * The onchain path pins the event read to `priceBlock` (the deterministic
 * week-end block) so the datasetHash reproduces byte-identically. Pool key
 * params come from config (ETH_USDG_POOL) and MUST match the on-chain pool
 * created by contracts/script/DeployTestnetUsdgPool.s.sol.
 */
import type { PublicClient } from "viem";
import { ADDRESSES, PAIR_ASSETS, PRICE_MODE, ETH_USDG_POOL, ZERO_ADDRESS, DEPLOY_BLOCK, LOG_PAGE_SIZE } from "../config.ts";
import { ConstantPriceProvider } from "./ConstantPriceProvider.ts";
import { OnchainPriceProvider } from "./OnchainPriceProvider.ts";
import type { PriceProvider } from "./PriceProvider.ts";

export async function selectPriceProvider(
  client: PublicClient,
  priceBlock: bigint,
): Promise<PriceProvider> {
  if (PRICE_MODE !== "onchain") return new ConstantPriceProvider();
  return OnchainPriceProvider.load({
    client,
    poolManager: ADDRESSES.poolManager as `0x${string}`,
    poolKey: {
      currency0: ZERO_ADDRESS as `0x${string}`, // native ETH
      currency1: PAIR_ASSETS.USDG.address,
      fee: ETH_USDG_POOL.fee,
      tickSpacing: ETH_USDG_POOL.tickSpacing,
      hooks: ETH_USDG_POOL.hooks,
    },
    blockNumber: priceBlock,
    fromBlock: DEPLOY_BLOCK,
    pageSize: LOG_PAGE_SIZE,
    ethDecimals: PAIR_ASSETS.ETH.decimals,
    usdgDecimals: PAIR_ASSETS.USDG.decimals,
  });
}

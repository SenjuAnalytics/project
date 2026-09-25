/**
 * resolveAddresses.ts
 * -----------------------------------------------------------------------------
 * SINGLE-SOURCE address resolution.
 *
 * The indexer hardcodes only three roots (factory, swapRouter, poolManager —
 * see config.ts). Every PLATFORM module address is read on-chain from the
 * factory at runtime here, so a platform redeploy only requires changing the
 * `factory` address (env INDEXER_FACTORY or config default).
 *
 * `swapRouter` and `poolManager` are intentionally NOT resolved from the factory
 * because the factory has no getter for them (periphery / external contracts).
 *
 * Determinism note: the resolved addresses are equal to the config defaults for
 * the current deployment, so embedding them into the dataset (configSnapshot)
 * produces byte-identical hashes. The offline pure/test path never calls this
 * resolver — it uses the static ADDRESSES defaults directly.
 */
import type { PublicClient } from "viem";
import { ADDRESSES, type ResolvedAddresses } from "./config.ts";
import { QualyraFactoryAbi } from "./abi/index.ts";

/** Factory getter function names for each resolvable platform module. */
const FACTORY_GETTERS = {
  competitionVault: "competitionVault",
  buybackBurner: "buybackBurner",
  launchRouter: "launchRouter",
  hook: "hook",
  feeVault: "feeVault",
  graduationExecutor: "graduationExecutor",
  liquidityLocker: "liquidityLocker",
} as const;

async function readFactoryAddress(
  client: PublicClient,
  factory: `0x${string}`,
  fn: string,
): Promise<string> {
  const v = (await client.readContract({
    address: factory,
    abi: QualyraFactoryAbi as any,
    functionName: fn,
  })) as string;
  return String(v);
}

/**
 * Read all platform module addresses from the factory and combine them with the
 * hardcoded roots (factory, swapRouter, poolManager) into a fully-resolved set.
 *
 * All values are returned as-is (checksummed) 0x-strings; callers that embed
 * them into the deterministic dataset must lowercase them (configSnapshot does).
 */
export async function resolveAddresses(
  client: PublicClient,
): Promise<ResolvedAddresses> {
  const factory = ADDRESSES.factory as `0x${string}`;

  const [
    competitionVault,
    buybackBurner,
    launchRouter,
    hook,
    feeVault,
    graduationExecutor,
    liquidityLocker,
  ] = await Promise.all([
    readFactoryAddress(client, factory, FACTORY_GETTERS.competitionVault),
    readFactoryAddress(client, factory, FACTORY_GETTERS.buybackBurner),
    readFactoryAddress(client, factory, FACTORY_GETTERS.launchRouter),
    readFactoryAddress(client, factory, FACTORY_GETTERS.hook),
    readFactoryAddress(client, factory, FACTORY_GETTERS.feeVault),
    readFactoryAddress(client, factory, FACTORY_GETTERS.graduationExecutor),
    readFactoryAddress(client, factory, FACTORY_GETTERS.liquidityLocker),
  ]);

  return {
    // hardcoded roots
    factory: ADDRESSES.factory,
    swapRouter: ADDRESSES.swapRouter,
    poolManager: ADDRESSES.poolManager,
    // resolved from factory
    competitionVault,
    buybackBurner,
    launchRouter,
    hook,
    feeVault,
    graduationExecutor,
    liquidityLocker,
  };
}

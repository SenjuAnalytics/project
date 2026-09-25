/**
 * gen-deployments.mjs
 * -----------------------------------------------------------------------------
 * Regenerates the repo-root SINGLE SOURCE OF TRUTH for deployed contract
 * addresses — deployments/<chainId>.json — directly from Foundry's broadcast
 * output (contracts/broadcast/<script>/<chainId>/run-latest.json).
 *
 * After any (re)deploy:
 *     cd indexer && npm run gen-deployments
 *
 * Both consumers then pick up the new addresses automatically:
 *   • frontend/lib/contracts.ts   (testnet fallbacks)
 *   • indexer/src/config.ts       (ADDRESSES roots + defaults)
 *
 * On a platform redeploy only `factory` (and periphery `swapRouter`) actually
 * change; everything else is derived here from the broadcast, so there is one
 * place to update instead of five.
 *
 * Lives in the indexer package because that is where `viem` (for EIP-55
 * checksums) is installed.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAddress } from "viem";

// indexer/scripts -> repo root is two levels up.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CHAIN_ID = 46630;

/** Foundry `contractName` -> deployments.json key. */
const NAME_TO_KEY = {
  QualyraFactory: "factory",
  QualyraLaunchDeployer: "launchDeployer",
  QualyraFeeVault: "feeVault",
  QualyraCompetitionVault: "competitionVault",
  QualyraGraduationExecutor: "graduationExecutor",
  QualyraLiquidityLocker: "liquidityLocker",
  QualyraBuybackBurner: "buybackBurner",
  QualyraLaunchRouter: "launchRouter",
  QualyraHook: "hook",
  QualyraSwapRouter: "swapRouter",
};

/** Stable output order for the `contracts` block (keeps diffs clean). */
const CONTRACT_ORDER = [
  "factory",
  "launchDeployer",
  "feeVault",
  "competitionVault",
  "graduationExecutor",
  "liquidityLocker",
  "buybackBurner",
  "launchRouter",
  "hook",
  "swapRouter",
];

/**
 * External (non-Qualyra) dependencies that are NOT deployed by our scripts and
 * therefore never appear in the broadcast. Kept per-chain.
 *   poolManager — Uniswap v4 singleton PoolManager for this chain.
 */
const EXTERNAL = {
  46630: { poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951" },
};

const BROADCASTS = [
  `contracts/broadcast/DeployQualyra.s.sol/${CHAIN_ID}/run-latest.json`,
  `contracts/broadcast/DeploySwapRouter.s.sol/${CHAIN_ID}/run-latest.json`,
];

const contracts = {};
const deployBlocks = {};

for (const rel of BROADCASTS) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) {
    console.warn(`! skipping missing broadcast: ${rel}`);
    continue;
  }
  const bc = JSON.parse(readFileSync(p, "utf8"));

  const blockByAddr = {};
  for (const r of bc.receipts ?? []) {
    if (r.contractAddress) {
      blockByAddr[r.contractAddress.toLowerCase()] = parseInt(r.blockNumber, 16);
    }
  }

  for (const tx of bc.transactions ?? []) {
    const key = NAME_TO_KEY[tx.contractName];
    if (!key || !tx.contractAddress) continue;
    if (contracts[key]) continue; // keep the first (CREATE) occurrence
    contracts[key] = getAddress(tx.contractAddress); // EIP-55 checksum
    const blk = blockByAddr[tx.contractAddress.toLowerCase()];
    if (blk !== undefined) deployBlocks[key] = blk;
  }
}

const missing = CONTRACT_ORDER.filter((k) => !contracts[k]);
if (missing.length) {
  console.warn(`! missing from broadcast (kept absent): ${missing.join(", ")}`);
}

const blockValues = Object.values(deployBlocks).filter((n) => Number.isFinite(n));
// Earliest deploy block — used as the getLogs start block.
const deployBlock = blockValues.length ? Math.min(...blockValues) : 0;

const orderedContracts = {};
for (const k of CONTRACT_ORDER) {
  if (contracts[k]) orderedContracts[k] = contracts[k];
}

// -----------------------------------------------------------------------------
// Testnet USDG + ETH/USDG price-reference pool (DeployTestnetUsdgPool.s.sol).
// The USDG mock (MockERC20) address CHANGES on every redeploy, so — exactly like
// the Qualyra core addresses — read it straight from the broadcast here instead
// of hand-editing config. The indexer's OnchainPriceProvider then derives the
// poolId from this address automatically (no manual INDEXER_USDG_ADDRESS needed).
const USDG_BROADCAST = `contracts/broadcast/DeployTestnetUsdgPool.s.sol/${CHAIN_ID}/run-latest.json`;
let usdg;
let ethUsdgPool;
{
  const pUsdg = join(ROOT, USDG_BROADCAST);
  if (existsSync(pUsdg)) {
    const bcU = JSON.parse(readFileSync(pUsdg, "utf8"));
    const blkByAddr = {};
    for (const r of bcU.receipts ?? []) {
      if (r.contractAddress)
        blkByAddr[r.contractAddress.toLowerCase()] = parseInt(r.blockNumber, 16);
    }
    for (const tx of bcU.transactions ?? []) {
      // Script deploys MockERC20 (USDG) first, then a throwaway
      // PoolModifyLiquidityTest router — keep only the MockERC20.
      if (tx.contractName === "MockERC20" && tx.contractAddress) {
        usdg = getAddress(tx.contractAddress);
        const blk = blkByAddr[tx.contractAddress.toLowerCase()];
        if (blk !== undefined) deployBlocks.usdg = blk;
        break;
      }
    }
    // PoolKey params are fixed constants in the deploy script (POOL_FEE=3000,
    // TICK_SPACING=60, hooks=address(0)); pin them so the indexer PoolKey is
    // fully sourced from this file.
    if (usdg)
      ethUsdgPool = { fee: 3000, tickSpacing: 60, hooks: "0x0000000000000000000000000000000000000000" };
  } else {
    console.warn(`! skipping missing USDG broadcast: ${USDG_BROADCAST}`);
  }
}

if (usdg) orderedContracts.usdg = usdg;

const out = {
  chainId: CHAIN_ID,
  network: "robinhood-chain-testnet",
  deployBlock,
  generatedFrom: usdg ? [...BROADCASTS, USDG_BROADCAST] : BROADCASTS,
  contracts: orderedContracts,
  external: EXTERNAL[CHAIN_ID] ?? {},
  ...(ethUsdgPool ? { ethUsdgPool } : {}),
  deployBlocks,
};

const outDir = join(ROOT, "deployments");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${CHAIN_ID}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

console.log(`OK wrote ${outPath}`);
console.log(JSON.stringify(out, null, 2));

/**
 * operator/chain.ts
 * -----------------------------------------------------------------------------
 * Chain access for the operator service: a public client that batches its reads,
 * the two wallets, and the snapshot of vault state each pass plans from.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { CHAIN_ID, RPC_URL, ZERO_ADDRESS, type ResolvedAddresses } from "../config.ts";
import {
  QualyraBuybackBurnerAbi,
  QualyraCompetitionVaultAbi,
  QualyraFactoryAbi,
  QualyraHookAbi,
} from "../abi/index.ts";
import type { BattleState, BuybackState, TokenState, WeekState } from "./plan.ts";
import type { ServiceState } from "./state.ts";

export const chain: Chain = {
  id: CHAIN_ID,
  name: "robinhood-chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

/** Reads go out as JSON-RPC batches: a pass reads a few calls per battle and per graduated token. */
export function makeServiceClient(): PublicClient {
  return createPublicClient({
    chain,
    transport: http(RPC_URL, { batch: { batchSize: 50 }, retryCount: 3 }),
  }) as PublicClient;
}

export interface Wallet {
  role: "operator" | "keeper";
  account: Account;
  client: WalletClient;
}

export function makeWallet(role: Wallet["role"], key: Hex | undefined): Wallet | undefined {
  if (!key) return undefined;
  const account = privateKeyToAccount(key);
  return { role, account, client: createWalletClient({ account, chain, transport: http(RPC_URL) }) };
}

const vaultAbi = QualyraCompetitionVaultAbi as any;
const totalSupplyAbi = parseAbi(["function totalSupply() view returns (uint256)"]);

/** How many finished league weeks back the service still looks for missing winners. */
const WEEKS_LOOKBACK = 8;

export interface Snapshot {
  /** Timestamp of the latest block. Every rule runs on chain time, never the host clock. */
  now: number;
  paused: boolean;
  /** Battles that still need something: settled ones (finalized, buybacks spent) are left out. */
  battles: BattleState[];
  buybacks: BuybackState[];
  firstLeagueWeek: number;
  currentWeek: number;
  weeks: WeekState[];
}

function read<T>(client: PublicClient, address: string, abi: any, functionName: string, args: unknown[] = []) {
  return client.readContract({ address: address as Address, abi, functionName, args }) as Promise<T>;
}

export async function readSnapshot(
  client: PublicClient,
  resolved: ResolvedAddresses,
  state: ServiceState,
): Promise<Snapshot> {
  const vault = resolved.competitionVault;
  const [block, paused, battleCount, firstLeagueWeek, currentWeek] = await Promise.all([
    client.getBlock(),
    read<boolean>(client, vault, vaultAbi, "paused"),
    read<bigint>(client, vault, vaultAbi, "battleCount"),
    read<bigint>(client, vault, vaultAbi, "firstLeagueWeek"),
    read<bigint>(client, vault, vaultAbi, "currentWeek"),
  ]);

  const settled = new Set(state.settledBattles);
  const ids = Array.from({ length: Number(battleCount) }, (_, i) => i + 1).filter(id => !settled.has(id));
  const raw = await Promise.all(ids.map(id => read<any>(client, vault, vaultAbi, "getBattle", [BigInt(id)])));
  const battles: BattleState[] = raw.map((b, i) => ({
    id: ids[i],
    tokenA: String(b.tokenA),
    tokenB: String(b.tokenB),
    asset: String(b.asset),
    startTime: Number(b.startTime),
    proposedAt: Number(b.proposedAt),
    outcome: Number(b.outcome),
    finalized: Boolean(b.finalized),
    datasetHash: String(b.datasetHash),
    resultHash: String(b.resultHash),
  }));

  const buybacks = await readBuybacks(client, resolved, battles.filter(b => b.finalized));
  for (const b of battles) {
    if (!b.finalized) continue;
    const open = buybacks.some(x => x.battleId === b.id && x.remaining > 0n);
    if (!open) state.settledBattles.push(b.id);
  }

  const weeks: WeekState[] = [];
  const first = Number(firstLeagueWeek);
  if (first !== 0) {
    const from = Math.max(first, Number(currentWeek) - WEEKS_LOOKBACK);
    const numbers = Array.from({ length: Math.max(0, Number(currentWeek) - from) }, (_, i) => from + i);
    const results = await Promise.all(numbers.map(w => read<any>(client, vault, vaultAbi, "getWeekResult", [BigInt(w)])));
    results.forEach((r, i) =>
      weeks.push({
        week: numbers[i],
        proposedAt: Number(r.proposedAt),
        finalizedAt: Number(r.finalizedAt),
        closed: Boolean(r.closed),
        datasetHash: String(r.datasetHash),
        resultHash: String(r.resultHash),
      }),
    );
  }

  return {
    now: Number(block.timestamp),
    paused,
    battles: battles.filter(b => !state.settledBattles.includes(b.id)),
    buybacks,
    firstLeagueWeek: first,
    currentWeek: Number(currentWeek),
    weeks,
  };
}

async function readBuybacks(
  client: PublicClient,
  resolved: ResolvedAddresses,
  finalized: BattleState[],
): Promise<BuybackState[]> {
  const burner = resolved.buybackBurner;
  const sides = finalized.flatMap(b => [
    { battleId: b.id, token: b.tokenA },
    { battleId: b.id, token: b.tokenB },
  ]);
  const [pots, lastRuns] = await Promise.all([
    Promise.all(
      sides.map(s =>
        read<readonly [string, bigint, bigint]>(client, burner, QualyraBuybackBurnerAbi, "buybacks", [
          BigInt(s.battleId),
          s.token,
        ]),
      ),
    ),
    Promise.all(sides.map(s => read<bigint>(client, burner, QualyraBuybackBurnerAbi, "lastTrancheAt", [s.token]))),
  ]);
  return sides.map((s, i) => ({
    battleId: s.battleId,
    token: s.token,
    remaining: pots[i][2],
    lastTrancheAt: Number(lastRuns[i]),
  }));
}

/**
 * Graduated launches with what the booking and the daily sweep need. New launches are picked up from the factory
 * and remembered in the state, so a pass only re-reads launch records that have not graduated yet.
 */
export async function readTokens(
  client: PublicClient,
  resolved: ResolvedAddresses,
  state: ServiceState,
): Promise<TokenState[]> {
  const factory = resolved.factory;
  const count = Number(await read<bigint>(client, factory, QualyraFactoryAbi, "tokenCount"));
  const newIndexes = Array.from({ length: Math.max(0, count - state.knownTokens.length) }, (_, i) => state.knownTokens.length + i);
  const newTokens = await Promise.all(
    newIndexes.map(i => read<string>(client, factory, QualyraFactoryAbi, "tokenAt", [BigInt(i)])),
  );
  for (const token of newTokens) state.knownTokens.push({ token, asset: ZERO_ADDRESS, graduated: false });

  const pending = state.knownTokens.filter(t => !t.graduated);
  const launches = await Promise.all(
    pending.map(t => read<any>(client, factory, QualyraFactoryAbi, "getLaunch", [t.token])),
  );
  pending.forEach((t, i) => {
    t.asset = String(launches[i].quoteAsset);
    t.graduated = Boolean(launches[i].graduated);
  });

  const graduated = state.knownTokens.filter(t => t.graduated);
  const vault = resolved.competitionVault;
  return Promise.all(
    graduated.map(async t => {
      const [eligibility, belowThresholdSince, average, hasBattled, accrued, pendingPot, pendingExpired] =
        await Promise.all([
          read<readonly [number, boolean, boolean, number]>(client, vault, vaultAbi, "eligibilityOf", [t.token]),
          read<number>(client, vault, vaultAbi, "belowThresholdSince", [t.token]),
          read<readonly [bigint, boolean, bigint]>(client, resolved.hook, QualyraHookAbi, "twapOf", [t.token]),
          read<boolean>(client, vault, vaultAbi, "hasBattled", [t.token]),
          read<readonly [bigint, bigint]>(client, resolved.hook, QualyraHookAbi, "accruedFees", [t.token, 0n]),
          read<bigint>(client, vault, vaultAbi, "pendingBattlePot", [t.token, t.asset]),
          read<boolean>(client, vault, vaultAbi, "isPendingExpired", [t.token]),
        ]);
      return {
        token: t.token,
        asset: t.asset,
        eligible: eligibility[1],
        disqualified: eligibility[2],
        firstCloseAt: Number(eligibility[0]),
        belowThresholdSince: Number(belowThresholdSince),
        averageReady: average[1],
        lastSwapAt: Number(average[2]),
        hasBattled,
        parkedFees: accrued[0] + accrued[1],
        pendingPot,
        pendingExpired,
      };
    }),
  );
}

/**
 * Market cap of `token` in whole pair asset units (18 decimals), from the pool's 30-minute average price
 * (QualyraHook.twapOf), so a price pushed just before the booking can't choose the opponent. Only compared between
 * tokens on the same pair asset, so no USD price is needed. Zero while the average isn't ready.
 */
export async function marketCapInAsset(
  client: PublicClient,
  resolved: ResolvedAddresses,
  token: string,
): Promise<bigint> {
  const [[price18, ready], supply] = await Promise.all([
    read<readonly [bigint, boolean, bigint]>(client, resolved.hook, QualyraHookAbi, "twapOf", [token]),
    read<bigint>(client, token, totalSupplyAbi, "totalSupply"),
  ]);
  return ready ? (price18 * supply) / 10n ** 18n : 0n;
}

/** The operator the vault trusts, to catch a service started with the wrong key. */
export function readVaultOperator(client: PublicClient, resolved: ResolvedAddresses): Promise<string> {
  return read<string>(client, resolved.competitionVault, vaultAbi, "operator");
}

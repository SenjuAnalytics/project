/**
 * operatorService.test.mjs — OFFLINE test of one full service pass
 * (src/operator/service.ts + chain.ts) against a fake chain. The fake answers
 * the vault, hook, burner, factory and pool reads, records every transaction
 * the service simulates and sends, and never touches the network.
 *
 * Scenario, at 23:45 UTC (booking open, daily sweep due):
 *   battle 1  result posted 25h ago           -> keeper finalizes it
 *   battle 2  finalized, 10 wei still to buy  -> keeper runs a tranche
 *   battle 3  cancelled booking               -> nothing to do, remembered as settled
 *   battle 4  our posted result was vetoed    -> not posted again, alert
 *   token 1   fees parked in the hook         -> keeper sweeps them
 *   tokens 1+2 ready to battle, no swap in an hour -> keeper runs their eligibility check first
 *   tokens 1+2 ready to battle                -> operator books them, larger average market cap first
 */
import "./_fixtureEnv.mjs";
import test from "node:test";
import assert from "node:assert/strict";

import { runPass } from "../src/operator/service.ts";
import { emptyState } from "../src/operator/state.ts";
import { DAY } from "../src/operator/plan.ts";

const addr = n => "0x" + n.toString(16).padStart(40, "0");
const ETH = addr(0);
const [VAULT, BURNER, HOOK, FACTORY, POOL_MANAGER] = [0xc0, 0xb0, 0xa0, 0xf0, 0xe0].map(addr);
const [T1, T2, T3, T4] = [1, 2, 3, 4].map(addr);
const [T7, T8, T9, T10] = [7, 8, 9, 10].map(addr);

const NOW = 20_000 * DAY + 23 * 3600 + 45 * 60;
const HOUR = 3600;

const battles = {
  1: { tokenA: addr(5), tokenB: addr(6), startTime: NOW - 50 * HOUR, proposedAt: NOW - 25 * HOUR, outcome: 1, finalized: false },
  2: { tokenA: T7, tokenB: T8, startTime: NOW - 80 * HOUR, proposedAt: NOW - 54 * HOUR, outcome: 1, finalized: true },
  3: { tokenA: T9, tokenB: T10, startTime: NOW + 10 * HOUR, proposedAt: 0, outcome: 6, finalized: true },
  4: { tokenA: addr(11), tokenB: addr(12), startTime: NOW - 30 * HOUR, proposedAt: 0, outcome: 0, finalized: false },
};

const launches = {
  [T1]: { quoteAsset: ETH, graduated: true },
  [T2]: { quoteAsset: ETH, graduated: true },
  [T3]: { quoteAsset: ETH, graduated: true },
  [T4]: { quoteAsset: ETH, graduated: false },
};

// 30-minute average price in ETH, 18 decimals: token 2 is worth four times token 1. No swap for an hour.
const average = { [T1]: 10n ** 18n, [T2]: 4n * 10n ** 18n };
const SUPPLY = 10n ** 27n;

function fakeClient() {
  const calls = [];
  const read = ({ address, functionName, args = [] }) => {
    switch (functionName) {
      case "paused":
        return false;
      case "battleCount":
        return 4n;
      case "firstLeagueWeek":
        return 0n;
      case "currentWeek":
        return 2900n;
      case "getBattle": {
        const b = battles[Number(args[0])];
        return { ...b, asset: ETH, pot: 0n, datasetHash: "0x" + "0".repeat(64), resultHash: "0x" + "0".repeat(64) };
      }
      case "buybacks":
        return [ETH, 40n, Number(args[0]) === 2 && args[1] === T7 ? 10n : 0n];
      case "lastTrancheAt":
        return BigInt(NOW - HOUR);
      case "tokenCount":
        return 4n;
      case "tokenAt":
        return [T1, T2, T3, T4][Number(args[0])];
      case "getLaunch":
        return launches[args[0]];
      case "eligibilityOf":
        return [NOW - 5 * DAY, true, false, 0];
      case "belowThresholdSince":
        return 0;
      case "hasBattled":
        return args[0] === T3;
      case "accruedFees":
        return args[0] === T1 ? [5n, 1n] : [0n, 0n];
      case "pendingBattlePot":
        return 0n;
      case "isPendingExpired":
        return false;
      case "twapOf":
        return [average[args[0]] ?? 10n ** 18n, true, BigInt(NOW - HOUR)];
      case "totalSupply":
        return SUPPLY;
      default:
        throw new Error(`unexpected read ${functionName} on ${address}`);
    }
  };
  return {
    calls,
    async getBlock() {
      return { timestamp: BigInt(NOW) };
    },
    async readContract(request) {
      return read(request);
    },
    async simulateContract(request) {
      calls.push({ functionName: request.functionName, args: request.args, from: request.account.address });
      return { request };
    },
    async waitForTransactionReceipt() {
      return { status: "success" };
    },
  };
}

const wallet = (role, n) => ({
  role,
  account: { address: addr(n) },
  client: { writeContract: async () => "0x" + "1".repeat(64) },
});

function context(client) {
  const state = emptyState();
  state.proposed["battle:4"] = "0x" + "4".repeat(64);
  return {
    env: {
      dryRun: false,
      pollSeconds: 300,
      bookingHourUtc: 18,
      minBookingLeadSeconds: 3600,
      sweepMinuteUtc: 23 * 60 + 40,
      pokeQuietSeconds: 600,
      statePath: "/dev/null",
    },
    client,
    resolved: { competitionVault: VAULT, buybackBurner: BURNER, hook: HOOK, factory: FACTORY, poolManager: POOL_MANAGER },
    operator: wallet("operator", 0x0e),
    keeper: wallet("keeper", 0x0d),
    state,
    denylist: new Set(),
  };
}

test("one pass: keeper settles, runs tranches, checks quiet tokens and sweeps; operator books; a vetoed result is left alone", async () => {
  const client = fakeClient();
  const ctx = context(client);
  const warnings = [];
  const originalWarn = console.warn;
  const originalLog = console.log;
  console.warn = message => warnings.push(String(message));
  console.log = () => {};
  try {
    await runPass(ctx, new Set(["operator", "keeper"]));
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
  }

  const sent = client.calls.map(c => `${c.from}:${c.functionName}(${c.args.map(String).join(",")})`);
  const keeper = addr(0x0d);
  const operator = addr(0x0e);
  const start = (Math.floor(NOW / DAY) + 2) * DAY; // 00:00 is only 15 minutes away, so the one after

  assert.deepEqual(sent, [
    `${keeper}:finalizeBattle(1)`,
    `${keeper}:executeBuyback(2,${T7})`,
    `${keeper}:pokeEligibility(${T1})`,
    `${keeper}:pokeEligibility(${T2})`,
    `${keeper}:sweepFees(${T1},0)`,
    `${operator}:scheduleBattles(${T2},${T1},${start})`,
  ]);
  assert.equal(ctx.state.lastPokeAt[T1.toLowerCase()], NOW);

  assert.equal(ctx.state.lastSweepDay, Math.floor(NOW / DAY));
  assert.deepEqual(ctx.state.vetoedBattles, [4]);
  assert.equal(ctx.state.proposed["battle:4"], undefined);
  assert.ok(ctx.state.settledBattles.includes(3), "a cancelled booking needs nothing more");
  assert.ok(!ctx.state.settledBattles.includes(2), "battle 2 still has a tranche to run");
  assert.ok(warnings.some(w => w.includes("battle #4 was vetoed")));
  assert.deepEqual(
    ctx.state.knownTokens.map(t => [t.token, t.graduated]),
    [[T1, true], [T2, true], [T3, true], [T4, false]],
  );
});

test("a dry run simulates the same calls and sends none", async () => {
  const client = fakeClient();
  const ctx = context(client);
  ctx.env.dryRun = true;
  let written = 0;
  ctx.keeper.client.writeContract = async () => {
    written++;
    return "0x";
  };
  ctx.operator.client.writeContract = ctx.keeper.client.writeContract;
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    await runPass(ctx, new Set(["operator", "keeper"]));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }
  assert.equal(client.calls.length, 6);
  assert.equal(written, 0);
});

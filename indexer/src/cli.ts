/**
 * cli.ts
 * -----------------------------------------------------------------------------
 * Commands:
 *   index-battle <battleId>                                      window read from the vault
 *   index-battle <battleId> <tokenA> <tokenB> <fromBlock> <toBlock>
 *   index-week   <week>
 *   verify-commit battle <battleId>
 *   verify-commit battle <battleId> <tokenA> <tokenB> <fromBlock> <toBlock>
 *   verify-commit week <week>
 *
 * index-* writes to indexer/out/:
 *   <name>.dataset.json   (canonical dataset content)
 *   <name>.result.json    (canonical result content)
 *   <name>.hashes.json    ({ datasetHash, resultHash })
 * and prints both hashes to stdout.
 *
 * These printed hashes map directly to the on-chain commitment args:
 *   proposeBattleResult(battleId, outcome, scoreA, scoreB, datasetHash, resultHash)
 *   proposeWeeklyWinners(week, winners, datasetHash, resultHash)
 *
 * A battle's window is [startTime, startTime + 24h) and a week's is
 * [weekStart, weekEnd), both mapped to blocks by timestamp (window.ts). The
 * short battle form reads startTime and the tokens from the vault; the long form
 * takes the block range as given, for replaying an old commitment.
 */
import { makeClient } from "./ingest.ts";
import { resolveAddresses } from "./resolveAddresses.ts";
import { DEPLOY_BLOCK } from "./config.ts";
import { computeBattle, computeBattleInWindow, computeWeek, type WeekJob } from "./jobs.ts";
import { writeOutputs } from "./outputs.ts";
import {
  loadDenylist,
  reportComparison,
  verifyBattle,
  verifyBattleById,
  verifyWeek,
  type CommitmentComparison,
} from "./verify.ts";
import type { BattleBuild } from "./build.ts";

function fail(message: string, code = 2): never {
  console.error(message);
  process.exit(code);
}

function networkError(what: string, e: unknown): never {
  fail(
    `Network error while ${what}: ${(e as Error).message}\nCheck INDEXER_RPC_URL / connectivity and retry.`,
    1,
  );
}

/**
 * Fail-closed visibility (ISSUE-LIST Q-11 items 2-3): quote assets that had
 * trades but no resolvable USD price contributed 0 QV. The dataset records
 * them (unpricedQuoteAssets); this warning makes sure the operator NOTICES a
 * listed-but-unpriced asset instead of discovering a silently low QV after
 * the commitment is already on-chain.
 */
function warnUnpriced(
  kind: string,
  id: string,
  dataset: { unpricedQuoteAssets?: string[] },
) {
  const u = dataset.unpricedQuoteAssets ?? [];
  if (u.length === 0) return;
  console.warn(
    `[UNPRICED] ${kind} ${id}: ${u.length} quote asset(s) traded but had NO USD price basis ` +
      `-> counted as 0 QV: ${u.join(", ")}. ` +
      `If one of them should count, give it a price basis (an on-chain pool or INDEXER_PRICE_*) and re-run.`,
  );
}

function printBattle(battleId: string, b: BattleBuild) {
  console.log(`battleId:    ${battleId}`);
  console.log(`outcome:     ${b.result.outcome} (${b.scoreOutcomeName})`);
  console.log(`scoreA:      ${b.result.scoreA.toString()}`);
  console.log(`scoreB:      ${b.result.scoreB.toString()}`);
  console.log(`datasetHash: ${b.datasetHash}`);
  console.log(`resultHash:  ${b.resultHash}`);
}

async function indexBattle(args: string[]) {
  const [battleId, tokenA, tokenB, fromStr, toStr] = args;
  const long = args.length === 5;
  if (!battleId || (args.length !== 1 && !long)) {
    fail(
      "Usage: index-battle <battleId>\n" +
        "       index-battle <battleId> <tokenA> <tokenB> <fromBlock> <toBlock>",
    );
  }

  let build: BattleBuild;
  let window = "";
  try {
    const client = makeClient();
    const resolved = await resolveAddresses(client);
    if (long) {
      const range = { fromBlock: BigInt(fromStr), toBlock: BigInt(toStr) };
      build = await computeBattleInWindow(client, resolved, { battleId, tokenA, tokenB }, range, loadDenylist());
      window = `${range.fromBlock}..${range.toBlock} (as given)`;
    } else {
      const job = await computeBattle(client, resolved, battleId, loadDenylist());
      if (!job.build) fail(`Battle ${battleId} has not started yet.`);
      build = job.build;
      window =
        `${job.window.fromBlock}..${job.window.toBlock} ` +
        (job.window.closed
          ? "(battle OVER -> reproducible / safe to commit)"
          : "(battle LIVE or last blocks too shallow -> PROVISIONAL, do not commit yet)");
    }
  } catch (e) {
    networkError("indexing battle", e);
  }

  writeOutputs(`battle-${battleId}`, build.dataset, build.result, build.datasetHash, build.resultHash);
  printBattle(battleId, build);
  warnUnpriced("battle", battleId, build.dataset);
  console.log(`blocks:      ${window}`);
}

async function indexWeek(args: string[]) {
  const [weekStr] = args;
  if (!weekStr) fail("Usage: index-week <week>");
  const week = BigInt(weekStr);

  let job: WeekJob;
  try {
    const client = makeClient();
    const resolved = await resolveAddresses(client);
    job = await computeWeek(client, resolved, week, loadDenylist());
  } catch (e) {
    networkError("indexing week", e);
  }
  // A week that ends at/before the factory deploy has no activity; never commit an empty leaderboard as real.
  if (job.predatesDeploy || !job.build) {
    fail(
      `Refusing to index week ${week.toString()}: it ends at or before the factory deploy block ` +
        `(${DEPLOY_BLOCK.toString()}), so it predates the platform. Pick a week at or after the deploy week.`,
    );
  }

  const w = job.build;
  writeOutputs(`week-${week}`, w.dataset, w.result, w.datasetHash, w.resultHash);
  console.log(`week:        ${week.toString()}`);
  console.log(
    `blocks:      ${job.window.fromBlock}..${job.window.toBlock} ` +
      (job.window.closed
        ? "(week CLOSED -> reproducible / safe to commit)"
        : "(week OPEN -> PROVISIONAL, do not commit yet)"),
  );
  console.log(`winners:     ${w.result.winners.join(", ")}`);
  console.log(`datasetHash: ${w.datasetHash}`);
  console.log(`resultHash:  ${w.resultHash}`);
  warnUnpriced("week", week.toString(), w.dataset);
}

async function verifyCommit(args: string[]) {
  const [kind, ...rest] = args;
  let cmp: CommitmentComparison;
  let id: string;

  if (kind === "battle") {
    const [battleId, tokenA, tokenB, fromStr, toStr] = rest;
    if (!battleId || (rest.length !== 1 && rest.length !== 5)) {
      fail(
        "Usage: verify-commit battle <battleId>\n" +
          "       verify-commit battle <battleId> <tokenA> <tokenB> <fromBlock> <toBlock>",
      );
    }
    id = battleId;
    try {
      cmp =
        rest.length === 5
          ? await verifyBattle(battleId, tokenA, tokenB, BigInt(fromStr), BigInt(toStr))
          : await verifyBattleById(battleId);
    } catch (e) {
      networkError("verifying battle", e);
    }
  } else if (kind === "week") {
    const [weekStr] = rest;
    if (!weekStr) fail("Usage: verify-commit week <week>");
    id = weekStr;
    try {
      cmp = await verifyWeek(BigInt(weekStr));
    } catch (e) {
      networkError("verifying week", e);
    }
  } else {
    fail(
      "Usage: verify-commit <battle|week> ...\n" +
        "  verify-commit battle <battleId> [<tokenA> <tokenB> <fromBlock> <toBlock>]\n" +
        "  verify-commit week <week>",
    );
  }
  process.exit(reportComparison(kind, id, cmp));
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "index-battle") return indexBattle(args);
  if (cmd === "index-week") return indexWeek(args);
  if (cmd === "verify-commit") return verifyCommit(args);
  fail(
    "Unknown command. Use 'index-battle', 'index-week' or 'verify-commit'.\n" +
      "  index-battle <battleId> [<tokenA> <tokenB> <fromBlock> <toBlock>]\n" +
      "  index-week <week>\n" +
      "  verify-commit battle <battleId> [<tokenA> <tokenB> <fromBlock> <toBlock>]\n" +
      "  verify-commit week <week>",
  );
}

main();

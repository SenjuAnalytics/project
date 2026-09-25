/**
 * operator/main.ts
 * -----------------------------------------------------------------------------
 * Runs the operator service.
 *
 *   node --experimental-strip-types src/operator/main.ts <mode> [--once] [--dry-run]
 *
 *   operate   operator + keeper + watch duties (needs both keys)
 *   keeper    keeper duties only (KEEPER_PRIVATE_KEY)
 *   watch     recompute posted results and alert on mismatches (no key)
 *
 *   --once     run a single pass and exit (for cron or a manual check)
 *   --dry-run  plan and simulate every transaction, send none, write no state
 *
 * See .env.example for the settings and README.md ("Operator service") for how
 * the wallets and the guardian Safe fit together.
 */
import "./loadEnv.ts";
import { loadDenylist } from "../verify.ts";
import { resolveAddresses } from "../resolveAddresses.ts";
import { makeServiceClient, makeWallet, readVaultOperator } from "./chain.ts";
import { readServiceEnv } from "./env.ts";
import { runPass, type Duty, type ServiceContext } from "./service.ts";
import { loadState, saveState } from "./state.ts";
import { alert } from "./alert.ts";

const MODES: Record<string, Duty[]> = {
  operate: ["keeper", "operator", "watch"],
  keeper: ["keeper"],
  watch: ["watch"],
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const [mode = "operate", ...flags] = process.argv.slice(2);
  const duties = MODES[mode];
  if (!duties || flags.some(f => f !== "--once" && f !== "--dry-run")) {
    console.error("Usage: main.ts <operate|keeper|watch> [--once] [--dry-run]");
    process.exit(2);
  }
  const once = flags.includes("--once");
  const env = readServiceEnv({ dryRun: flags.includes("--dry-run") });
  const client = makeServiceClient();
  const resolved = await resolveAddresses(client);

  const operator = duties.includes("operator") ? makeWallet("operator", env.operatorKey) : undefined;
  const keeper = duties.includes("keeper") ? makeWallet("keeper", env.keeperKey) : undefined;
  if (operator) {
    const trusted = await readVaultOperator(client, resolved);
    if (trusted.toLowerCase() !== operator.account.address.toLowerCase()) {
      throw new Error(
        `OPERATOR_PRIVATE_KEY is ${operator.account.address}, but the vault's operator is ${trusted}. ` +
          "Results and bookings would revert.",
      );
    }
  }

  const ctx: ServiceContext = {
    env,
    client,
    resolved,
    operator,
    keeper,
    state: loadState(env.statePath),
    denylist: loadDenylist(),
  };

  console.log(
    `[service] ${mode}${env.dryRun ? " (dry run)" : ""} on vault ${resolved.competitionVault}` +
      (operator ? `, operator ${operator.account.address}` : "") +
      (keeper ? `, keeper ${keeper.account.address}` : "") +
      (once ? ", one pass" : `, every ${env.pollSeconds}s`),
  );

  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(130);
      stopping = true;
      console.log("[service] stopping after this pass (signal again to quit now)");
    });
  }

  do {
    try {
      await runPass(ctx, new Set(duties));
    } catch (error) {
      await alert(ctx.state, env.alertWebhookUrl, "error:pass", `a pass failed: ${(error as Error).message.split("\n")[0]}`);
    }
    if (!env.dryRun) saveState(env.statePath, ctx.state);
    if (once || stopping) break;
    await sleep(env.pollSeconds * 1000);
  } while (!stopping);
}

main().catch(error => {
  console.error(`[service] ${(error as Error).message}`);
  process.exit(1);
});

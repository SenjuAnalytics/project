/**
 * operator/env.ts
 * -----------------------------------------------------------------------------
 * Settings of the operator service, all read from the environment. The two
 * private keys are read here and nowhere else, and are never printed.
 *
 * Keep the keys in the host's secret store, or in an untracked indexer/.env for
 * local runs (see .env.example). Never commit them and never give them a
 * NEXT_PUBLIC_ name: anything with that prefix ends up in the browser bundle.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEXER_ROOT = resolve(__dirname, "..", "..");

export interface ServiceEnv {
  /** Wallet holding the vault's operator role: books battles, posts results and winners. */
  operatorKey?: Hex;
  /** Wallet with no role: pays for finalize, buyback tranches, eligibility checks, sweeps and expiry releases. */
  keeperKey?: Hex;
  /** Slack or Discord style webhook; alerts are only logged when unset. */
  alertWebhookUrl?: string;
  /** Plan and simulate, send nothing. */
  dryRun: boolean;
  /** Seconds between two passes. */
  pollSeconds: number;
  /** Hour (UTC) from which ready tokens are booked for the coming midnight. */
  bookingHourUtc: number;
  /** A booking closer than this to midnight goes to the midnight after. */
  minBookingLeadSeconds: number;
  /** Minute of the UTC day of the daily sweep. */
  sweepMinuteUtc: number;
  /** A token whose eligibility matters and that went this long without a swap gets its check run by the keeper. */
  pokeQuietSeconds: number;
  /** Where the service remembers what it already did or reported. */
  statePath: string;
}

const KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/**
 * Loads indexer/.env into process.env without overriding what the host already set. Plain KEY=VALUE lines only;
 * blank lines and # comments are skipped, surrounding quotes are stripped.
 */
export function loadDotEnv(path = resolve(INDEXER_ROOT, ".env")): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

function readKey(name: string): Hex | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!KEY_PATTERN.test(value)) throw new Error(`${name} must be a 0x-prefixed 32-byte hex private key.`);
  return value as Hex;
}

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}, got "${raw}".`);
  }
  return value;
}

function readMinuteOfDay(name: string, fallback: string): number {
  const raw = (process.env[name]?.trim() || fallback).match(/^(\d{1,2}):(\d{2})$/);
  const hours = raw ? Number(raw[1]) : NaN;
  const minutes = raw ? Number(raw[2]) : NaN;
  if (!(hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60)) {
    throw new Error(`${name} must be a UTC time as HH:MM.`);
  }
  return hours * 60 + minutes;
}

/** Refuses to run when a key sits behind a public name, where a frontend build would publish it. */
function assertNoPublicKeys(): void {
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("NEXT_PUBLIC_") && value && KEY_PATTERN.test(value.trim())) {
      throw new Error(`${name} looks like a private key. Move it out of NEXT_PUBLIC_ variables and rotate it.`);
    }
  }
}

export function readServiceEnv(args: { dryRun: boolean }): ServiceEnv {
  loadDotEnv();
  assertNoPublicKeys();

  const operatorKey = readKey("OPERATOR_PRIVATE_KEY");
  const keeperKey = readKey("KEEPER_PRIVATE_KEY");
  if (operatorKey && keeperKey && operatorKey.toLowerCase() === keeperKey.toLowerCase()) {
    throw new Error("KEEPER_PRIVATE_KEY must be a different wallet from OPERATOR_PRIVATE_KEY.");
  }

  return {
    operatorKey,
    keeperKey,
    alertWebhookUrl: process.env.ALERT_WEBHOOK_URL?.trim() || undefined,
    dryRun: args.dryRun || process.env.OPERATOR_DRY_RUN === "1",
    pollSeconds: readInt("OPERATOR_POLL_SECONDS", 300, 30, 3600),
    bookingHourUtc: readInt("OPERATOR_BOOKING_HOUR_UTC", 18, 0, 23),
    minBookingLeadSeconds: readInt("OPERATOR_MIN_BOOKING_LEAD_SECONDS", 3600, 0, 86_399),
    sweepMinuteUtc: readMinuteOfDay("OPERATOR_SWEEP_AT_UTC", "23:40"),
    pokeQuietSeconds: readInt("OPERATOR_POKE_QUIET_SECONDS", 600, 60, 86_400),
    statePath: process.env.OPERATOR_STATE_PATH?.trim() || resolve(INDEXER_ROOT, "out", "operator-state.json"),
  };
}

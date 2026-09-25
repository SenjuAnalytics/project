/**
 * operator/state.ts
 * -----------------------------------------------------------------------------
 * The little the service remembers between passes and restarts. Everything else
 * is read from the chain on every pass, so deleting the file is safe: the worst
 * case is one repeated alert, or one repeated proposal for a result the guardian
 * had already vetoed.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface KnownToken {
  token: string;
  asset: string;
  graduated: boolean;
}

export interface ServiceState {
  /** UTC day number (unix seconds / 86400) of the last daily sweep. */
  lastSweepDay?: number;
  /** "battle:<id>" or "week:<n>" -> result hash this service posted. */
  proposed: Record<string, string>;
  /**
   * Battles and weeks the guardian vetoed after this service posted a result: their result is back to empty. The
   * service stops posting for them and asks for a person to look.
   */
  vetoedBattles: number[];
  vetoedWeeks: number[];
  /** "battle:<id>:<resultHash>" or "week:<n>:<resultHash>" -> whether the watcher's recompute matched it. */
  verified: Record<string, boolean>;
  /** Alert key -> unix seconds it was last sent. */
  alerted: Record<string, number>;
  /** Finalized battles whose buybacks are fully spent. Nothing left to do for them. */
  settledBattles: number[];
  /** Launches seen so far, in factory order. Graduation is permanent, so only the rest is re-read. */
  knownTokens: KnownToken[];
}

export function emptyState(): ServiceState {
  return {
    proposed: {},
    vetoedBattles: [],
    vetoedWeeks: [],
    verified: {},
    alerted: {},
    settledBattles: [],
    knownTokens: [],
  };
}

export function loadState(path: string): ServiceState {
  if (!existsSync(path)) return emptyState();
  try {
    return { ...emptyState(), ...(JSON.parse(readFileSync(path, "utf8")) as Partial<ServiceState>) };
  } catch {
    console.warn(`[state] ${path} is unreadable; starting from an empty state.`);
    return emptyState();
  }
}

/** Writes through a temp file so a crash mid-write never leaves half a file behind. */
export function saveState(path: string, state: ServiceState): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}

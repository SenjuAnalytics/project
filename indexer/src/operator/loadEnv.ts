/**
 * operator/loadEnv.ts
 * -----------------------------------------------------------------------------
 * Imported first by main.ts, so indexer/.env is in process.env before config.ts
 * reads INDEXER_RPC_URL and friends at import time.
 */
import { loadDotEnv } from "./env.ts";

loadDotEnv();

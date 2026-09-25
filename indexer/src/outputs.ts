/**
 * outputs.ts
 * -----------------------------------------------------------------------------
 * Writes a battle's or week's canonical dataset, result and hashes to
 * indexer/out/, the files anyone can diff against their own run:
 *   <name>.dataset.json   canonical dataset
 *   <name>.result.json    canonical result
 *   <name>.hashes.json    { datasetHash, resultHash }
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonical } from "./canonical.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = resolve(__dirname, "..", "out");

export function writeOutputs(
  name: string,
  dataset: unknown,
  result: unknown,
  datasetHash: string,
  resultHash: string,
): void {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, `${name}.dataset.json`), canonical(dataset));
  writeFileSync(resolve(OUT_DIR, `${name}.result.json`), canonical(result));
  writeFileSync(resolve(OUT_DIR, `${name}.hashes.json`), canonical({ datasetHash, resultHash }));
}

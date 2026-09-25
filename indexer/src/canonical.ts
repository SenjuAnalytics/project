/**
 * canonical.ts
 * -----------------------------------------------------------------------------
 * Canonical JSON encoding + keccak256 hashing.
 *
 * Canonical rules (deterministic, cross-machine stable):
 *   - Objects: keys sorted ascending (by UTF-16 code unit, JS default sort).
 *   - Arrays: preserved in given order (stable — callers must pre-order).
 *   - bigint and JS integers: serialized as DECIMAL STRINGS (no 0x, no exponent).
 *   - No JS floats permitted (throws) — everything numeric is an integer/bigint.
 *     (Documented USD price constants are folded into integer micro-USD before
 *      reaching here, so no float ever enters the canonical form.)
 *   - Strings: JSON-escaped.
 *   - booleans / null: standard JSON literals.
 *   - No insignificant whitespace.
 *
 * hash(obj) = keccak256(toBytes(canonical(obj))).
 */
import { keccak256, toBytes } from "viem";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.getPrototypeOf(v) === Object.prototype
  );
}

function encodeString(s: string): string {
  return JSON.stringify(s);
}

function encodeValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "bigint") return `"${v.toString(10)}"`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "string") return encodeString(v);
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Non-finite number: ${v}`);
    if (!Number.isInteger(v))
      throw new Error(
        `Floats are not allowed in canonical form: ${v}. Convert to integer/bigint first.`,
      );
    // Integers serialized as decimal strings for uniformity with bigint.
    return `"${v.toString(10)}"`;
  }
  if (Array.isArray(v)) {
    return `[${v.map(encodeValue).join(",")}]`;
  }
  if (isPlainObject(v)) {
    const keys = Object.keys(v).sort();
    const parts = keys.map(
      (k) => `${encodeString(k)}:${encodeValue((v as any)[k])}`,
    );
    return `{${parts.join(",")}}`;
  }
  throw new Error(`Unsupported type in canonical form: ${typeof v}`);
}

/** Produce the canonical JSON string for an object. */
export function canonical(obj: unknown): string {
  return encodeValue(obj);
}

/** keccak256 of the canonical bytes, as 0x-prefixed hex. */
export function hash(obj: unknown): `0x${string}` {
  return keccak256(toBytes(canonical(obj)));
}

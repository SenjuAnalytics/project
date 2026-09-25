/**
 * Guard against known-dead Alchemy RPC keys that must never be used (they 403 / break reads).
 *
 * The keys themselves are intentionally NOT stored here — only a non-cryptographic FNV-1a fingerprint
 * of each. This keeps the literal key out of committed source while preserving the original
 * reject-on-match behaviour: any `alch_…` token found in an RPC URL is fingerprinted and compared
 * against the blocked set.
 *
 * To block another stale key WITHOUT committing it, print its fingerprint and add it below:
 *   node -e "const s='<KEY>';let h=0x811c9dc5>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}console.log(h.toString(16).padStart(8,'0'))"
 */

// FNV-1a (32-bit): fast, dependency-free, synchronous. NOT for security — it only avoids storing the
// raw key in source. Runs identically in the browser and in Node.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5 >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// Fingerprints of Alchemy keys that must be rejected (the raw keys are deliberately absent).
const BLOCKED_ALCHEMY_KEY_HASHES = new Set<string>([
  '75e0e53e', // retired testnet key — replaced; kept blocked so a stale .env can't resurrect it
])

/**
 * True if the given RPC URL/string references a blocked Alchemy key. Mirrors the previous
 * `url.includes('<dead key>')` guard, but matches by fingerprint so no literal key lives in source.
 */
export function usesBlockedRpcKey(url?: string | null): boolean {
  if (!url) return false
  const tokens = url.match(/alch_[A-Za-z0-9_-]+/g)
  if (!tokens) return false
  return tokens.some((token) => BLOCKED_ALCHEMY_KEY_HASHES.has(fnv1a(token)))
}

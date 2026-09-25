// Token metadata on IPFS.
//
// A launch records one short string on chain: `ipfs://bafkrei…`. That points at a JSON document, and the
// JSON points at the logo. Two hops, and neither the image nor the JSON is ever stored on chain — which is
// the whole reason a launch costs tens of thousands of gas instead of millions.
//
// Tokens launched before this existed put the JSON itself in that field, logo and all. Those are still on
// chain and still have to render, so the reader below accepts either shape.

export type TokenMetadata = {
  name?: string
  symbol?: string
  description?: string
  /** Usually `ipfs://…`; resolve it with ipfsToHttp before putting it in an <img>. */
  image?: string
  logoFit?: 'cover' | 'contain'
  logoShape?: 'squircle' | 'circle'
  logoBg?: 'transparent' | 'white' | 'dark'
  logoScale?: number
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  links?: { label: string; url: string }[]
}

/**
 * CSS transform for a logo's zoom.
 *
 * `logoScale` is a percentage: the launch form's slider reads "Scale / Zoom (100%)", so 100 means
 * untouched. Read as a multiplier instead, 100 magnifies the image a hundredfold — a 34px avatar
 * becomes 3400px of one pixel, which on screen is indistinguishable from a logo that failed to load.
 * Every surface that renders a token logo goes through here rather than doing the arithmetic itself.
 */
export function logoTransform(logoScale?: number): string {
  const percent = typeof logoScale === 'number' && logoScale > 0 ? logoScale : 100
  return `scale(${percent / 100})`
}

/** Gateway used to read public files back. Pinata's own is the default; any public gateway serves the same CIDs. */
const GATEWAY = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud').replace(/\/+$/, '')

/** Turns `ipfs://<cid>[/path]` into a URL a browser can load. Anything already http(s) or a data URI passes through. */
export function ipfsToHttp(uri: string | undefined): string | undefined {
  if (!uri) return undefined
  const trimmed = uri.trim()
  if (!trimmed) return undefined
  if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed
  const cid = trimmed.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '')
  return cid ? `${GATEWAY}/ipfs/${cid}` : undefined
}

/** True for the pointer shape a launch should be recording now. */
export function isIpfsUri(value: string | undefined): boolean {
  return !!value && /^ipfs:\/\//i.test(value.trim())
}

/**
 * Pins one file and returns its `ipfs://` URI.
 * The request goes to this app's own route, never to Pinata directly — the key lives on the server.
 */
export async function pinFile(file: File, name?: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  if (name) form.append('name', name)

  const response = await fetch('/api/upload', { method: 'POST', body: form })
  const body = (await response.json().catch(() => ({}))) as { uri?: string; error?: string }
  if (!response.ok || !body.uri) {
    throw new Error(body.error || `Upload failed (${response.status}).`)
  }
  return body.uri
}

/** Pins a metadata document and returns its `ipfs://` URI. */
export async function pinJson(value: unknown, name = 'metadata.json'): Promise<string> {
  const file = new File([JSON.stringify(value)], name, { type: 'application/json' })
  return pinFile(file, name)
}

/**
 * Reads what a token's `metadataURI` points at.
 *
 * Three shapes reach this function: an `ipfs://` pointer (current), a JSON document written straight into
 * the field (tokens launched before the pointer existed), and an empty string (a launch with no metadata).
 * Nothing here throws — a token with unreadable metadata still belongs in the list, just without a logo.
 */
export async function resolveMetadata(uri: string | undefined, signal?: AbortSignal): Promise<TokenMetadata | undefined> {
  const value = uri?.trim()
  if (!value) return undefined

  // The older shape: the document itself, stored inline.
  if (value.startsWith('{')) {
    try {
      return JSON.parse(value) as TokenMetadata
    } catch {
      return undefined
    }
  }

  const url = ipfsToHttp(value)
  if (!url) return undefined

  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return undefined
    const text = await response.text()
    return JSON.parse(text) as TokenMetadata
  } catch {
    // An unreachable gateway is not a reason to drop the token from the interface.
    return undefined
  }
}

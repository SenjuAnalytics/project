// Pinning a launch's logo and metadata to IPFS.
//
// A token stores one short pointer on chain — `ipfs://bafkrei…` — and everything it points at lives
// off chain. This route is the off-chain half: it takes the file, hands it to Pinata, and returns the
// CID the launch will record. The image itself never touches the chain.
//
// It runs on the server for one reason: the Pinata token. A key shipped to the browser is a key anyone
// can read out of the bundle and use to fill the account with their own uploads. `PINATA_JWT` therefore
// has no NEXT_PUBLIC_ prefix, which is what keeps Next.js from inlining it client-side.

import { NextRequest, NextResponse } from 'next/server'

const PINATA_UPLOAD_URL = 'https://uploads.pinata.cloud/v3/files'

/** Anything larger than this is not a token logo, and the launch form already downsizes before sending. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/json'])

export async function POST(request: NextRequest) {
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return NextResponse.json(
      { error: 'Pinning is not configured. Set PINATA_JWT in the environment and restart the server.' },
      { status: 503 },
    )
  }

  let incoming: FormData
  try {
    incoming = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected a multipart form upload.' }, { status: 400 })
  }

  const entry = incoming.get('file')
  if (!(entry instanceof Blob)) {
    return NextResponse.json({ error: 'No file in the request.' }, { status: 400 })
  }
  const file = entry as Blob & { name?: string }
  if (file.size === 0) {
    return NextResponse.json({ error: 'The file is empty.' }, { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `The file is ${Math.round(file.size / 1024)} KB; the limit is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` },
      { status: 413 },
    )
  }
  if (file.type && !TYPES.has(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 415 })
  }

  const outgoing = new FormData()
  outgoing.append('file', file, file.name || 'upload')
  // Pinata uploads to its private network unless told otherwise. A privately pinned logo returns a
  // perfectly valid CID that no public gateway will serve — and by the time that shows, the CID is
  // already written into the token for good. So this is never left to the default.
  outgoing.append('network', 'public')
  const name = incoming.get('name')
  if (typeof name === 'string' && name.trim()) outgoing.append('name', name.trim().slice(0, 120))

  let response: Response
  try {
    response = await fetch(PINATA_UPLOAD_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: outgoing,
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach Pinata.' }, { status: 502 })
  }

  const body = await response.text()
  if (!response.ok) {
    // A 401/403 here almost always means the key lacks the Files:Write scope, so say that rather than
    // passing along a bare status code.
    const hint =
      response.status === 401 || response.status === 403
        ? ' Check that the Pinata key is valid and has the Files → Write permission.'
        : ''
    return NextResponse.json(
      { error: `Pinata refused the upload (${response.status}).${hint}`, detail: body.slice(0, 400) },
      { status: 502 },
    )
  }

  let cid: string | undefined
  try {
    cid = (JSON.parse(body) as { data?: { cid?: string } }).data?.cid
  } catch {
    cid = undefined
  }
  if (!cid) {
    return NextResponse.json({ error: 'Pinata accepted the file but returned no CID.' }, { status: 502 })
  }

  const gateway = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud').replace(/\/+$/, '')
  return NextResponse.json({ cid, uri: `ipfs://${cid}`, gatewayUrl: `${gateway}/ipfs/${cid}` })
}

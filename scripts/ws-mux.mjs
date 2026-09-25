/**
 * Reusable multi-upstream WebSocket MULTIPLEXER for ONE JSON-RPC route.
 *
 * Each mux keeps EXACTLY ONE live upstream socket at a time and fans it out to any number of local
 * browser clients on the same route. That single server-side socket is what lets a plan with a
 * 1-connection limit — or a keyed endpoint a browser can't authenticate to — still serve many tabs
 * at once. Upstream URLs and any auth headers stay in the caller's route config (server-side); they
 * never reach the browser bundle.
 *
 * PROVIDER ROTATION (server-side failover)
 * ----------------------------------------
 * A route can carry an ORDERED list of providers (primary first, e.g. Alchemy -> Uniblock -> dRPC).
 * When the current upstream drops, errors, or is rejected (rate-limit / "connection limit reached"),
 * the mux ROTATES to the next provider instead of hammering the same dead endpoint. This keeps the
 * failover server-side (in the proxy) rather than relying on the browser to notice and switch — so a
 * `logs` subscription keeps flowing across a provider outage.
 *
 * SUBSCRIPTION SURVIVAL (no forced client teardown)
 * -------------------------------------------------
 * The mux remembers each client's active `eth_subscribe` requests. On reconnect/rotation it does NOT
 * force-close the browser clients; instead it RE-SUBSCRIBES their subscriptions on the fresh upstream
 * and remaps the old subscriptionId -> new subscriptionId, so notifications keep reaching the right
 * tab without the browser having to reconnect. This is what stops a freshly launched token from
 * waiting a full poll interval to appear whenever the upstream blipped.
 *
 * It multiplexes JSON-RPC safely by:
 *   - rewriting every client request `id` to a globally-unique id (so two tabs using id:1 never
 *     clash), remembering {client, originalId} to route the reply back with the tab's own id;
 *   - tracking `eth_subscribe` results so each `subscriptionId` maps to its owning client, then
 *     delivering each `eth_subscription` notification ONLY to that client;
 *   - forwarding `eth_unsubscribe` and cleaning up when a client disconnects;
 *   - rotating providers with backoff, and closing the upstream once the last client leaves.
 *
 * @param {{ name: string, url?: string, headers?: Record<string,string>,
 *           providers?: Array<{ url: string, headers?: Record<string,string>, name?: string }> }} route
 *        upstream config. Provide either a single `url` (+ optional `headers`) OR an ordered
 *        `providers` list (primary first). `url`/`headers` are treated as an implicit first provider.
 * @param {Function} WebSocket  the `ws` WebSocket class (passed in so this module stays dependency-free)
 * @param {(...args:any[])=>void} [logger]  defaults to console.log
 * @returns {{ handleClient: (client:any, req:any)=>void, shutdown: ()=>void, clientCount: ()=>number }}
 */
export function createMux(route, WebSocket, logger = console.log) {
  const log = (...args) => logger(`(${route.name})`, ...args)

  // Build the ordered provider list. Backward compatible: a single {url, headers} becomes provider[0].
  const providers = normalizeProviders(route)

  let providerIndex = 0
  let upstream = null
  let upstreamReady = false
  let reconnectDelay = 1000
  let globalId = 0
  let idleCloseTimer = null

  /** clients currently connected on this route. */
  const clients = new Set()
  /** globalId -> { client, originalId, isSubscribe } for pending requests awaiting an upstream reply. */
  const pendingById = new Map()
  /** upstream subscriptionId -> client, so eth_subscription notifications go to the right tab. */
  const subToClient = new Map()
  /**
   * client -> Map(clientFacingSubId -> { originalRequest }).
   * The clientFacingSubId is the subscriptionId the browser first saw; it stays STABLE across
   * rotations. originalRequest is the client's raw eth_subscribe message (params) used to re-subscribe.
   */
  const clientSubs = new Map()
  // gid -> { client, params } for eth_subscribe requests whose upstream reply hasn't arrived yet.
  const pendingSubParamsByGid = new Map()
  /** live upstream subId -> clientFacingSubId, so a rotated upstream's notifications map to the tab's stable id. */
  const liveSubToFacing = new Map()
  /** globalId -> { client, facingSubId } for in-flight RE-SUBSCRIBE requests we issue ourselves. */
  const pendingResub = new Map()
  /** outbound queue used while the upstream socket is still connecting. */
  const upstreamQueue = []

  function normalizeProviders(r) {
    const list = []
    if (Array.isArray(r.providers) && r.providers.length) {
      for (const p of r.providers) {
        if (p && p.url) list.push({ url: p.url, headers: p.headers || {}, name: p.name || p.url })
      }
    }
    if (r.url) {
      // Treat a bare url as the primary if it isn't already in the list.
      if (!list.some(p => p.url === r.url)) list.unshift({ url: r.url, headers: r.headers || {}, name: r.name || r.url })
    }
    return list
  }

  function currentProvider() {
    return providers[providerIndex] || null
  }

  function rotateProvider(reason) {
    if (providers.length <= 1) return // nothing to rotate to; ensureUpstream will retry the same one
    const from = currentProvider()
    providerIndex = (providerIndex + 1) % providers.length
    const to = currentProvider()
    log(`ROTATE provider (${reason}): ${from?.name} -> ${to?.name}`)
  }

  function sendUpstream(payloadStr) {
    if (upstreamReady && upstream && upstream.readyState === WebSocket.OPEN) {
      upstream.send(payloadStr)
    } else {
      upstreamQueue.push(payloadStr)
      ensureUpstream()
    }
  }

  function ensureUpstream() {
    const prov = currentProvider()
    if (!prov || !prov.url) return // route not configured — nothing to connect to
    if (upstream && (upstream.readyState === WebSocket.CONNECTING || upstream.readyState === WebSocket.OPEN)) {
      return
    }
    log(`opening upstream -> ${prov.name}`)
    upstream = new WebSocket(prov.url, {
      headers: prov.headers && Object.keys(prov.headers).length ? prov.headers : undefined,
      handshakeTimeout: 15_000,
    })

    let upstreamHeartbeatTimer = null

    upstream.on('open', () => {
      upstreamReady = true
      reconnectDelay = 1000
      log(`upstream OPEN via ${prov.name} — flushing`, upstreamQueue.length, 'queued msg(s)')
      // Re-subscribe every client's active subscriptions on the fresh upstream FIRST, so no
      // notification is missed, then flush any queued plain requests.
      resubscribeAll()
      while (upstreamQueue.length) upstream.send(upstreamQueue.shift())

      // Heartbeat every 25s to keep idle connection alive against upstream timeouts (prevents 1006)
      if (upstreamHeartbeatTimer) clearInterval(upstreamHeartbeatTimer)
      upstreamHeartbeatTimer = setInterval(() => {
        if (upstream && upstream.readyState === WebSocket.OPEN) {
          try { upstream.ping() } catch {}
        }
      }, 25_000)
    })

    upstream.on('message', (data) => {
      const text = data.toString()
      let msg
      try { msg = JSON.parse(text) } catch { return }

      // Case 0: a reply to a RE-SUBSCRIBE we issued ourselves -> update the id maps, do not forward.
      if (msg.id !== undefined && msg.id !== null && pendingResub.has(msg.id)) {
        const { client, facingSubId } = pendingResub.get(msg.id)
        pendingResub.delete(msg.id)
        if (typeof msg.result === 'string') {
          liveSubToFacing.set(msg.result, facingSubId)
          subToClient.set(msg.result, client)
        }
        return
      }

      // Case 1: a subscription notification -> translate live subId to the tab's stable id, route to owner.
      if (msg.method === 'eth_subscription' && msg.params && msg.params.subscription) {
        const liveSub = msg.params.subscription
        const facing = liveSubToFacing.get(liveSub) || liveSub
        const owner = subToClient.get(liveSub)
        if (owner && owner.readyState === WebSocket.OPEN) {
          const out = { ...msg, params: { ...msg.params, subscription: facing } }
          owner.send(JSON.stringify(out))
        }
        return
      }

      // Case 2: a reply to a specific client request -> map globalId back to the client + its original id.
      if (msg.id !== undefined && msg.id !== null && pendingById.has(msg.id)) {
        const { client, originalId, isSubscribe } = pendingById.get(msg.id)
        pendingById.delete(msg.id)
        // If this was an eth_subscribe, remember which client owns the returned subscriptionId, and
        // record it as the client-facing (stable) id for future rotations.
        if (isSubscribe && typeof msg.result === 'string') {
          subToClient.set(msg.result, client)
          liveSubToFacing.set(msg.result, msg.result) // facing == live on the first subscribe
        }
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ ...msg, id: originalId }))
        }
        return
      }

      // Anything else (rare) -> ignore (can't attribute it to a client).
    })

    upstream.on('close', (code, reason) => {
      if (upstreamHeartbeatTimer) {
        clearInterval(upstreamHeartbeatTimer)
        upstreamHeartbeatTimer = null
      }
      upstreamReady = false
      log(`upstream CLOSE code=${code} reason=${reason?.toString?.() || ''}`)
      // Clear only the transient upstream-side maps. We KEEP clientSubs so we can re-subscribe, and we
      // do NOT force-close the browser clients — their sockets (and stable facing subIds) survive.
      pendingById.clear()
      pendingResub.clear()
      subToClient.clear()
      liveSubToFacing.clear()
      upstream = null
      if (clients.size > 0) {
        // A drop/close often means the current provider is unhealthy or rate-limited -> rotate.
        rotateProvider(`close code=${code}`)
        log(`reconnecting in ${reconnectDelay}ms…`)
        setTimeout(ensureUpstream, reconnectDelay)
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000)
      }
    })

    upstream.on('unexpected-response', (_req, res) => {
      let body = ''
      res.on('data', (c) => { body += c.toString() })
      res.on('end', () => {
        log(`upstream handshake ${res.statusCode}: ${body.slice(0, 200)}`)
        // 429 / auth / connection-limit rejections -> rotate to the next provider immediately.
        if (res.statusCode === 429 || res.statusCode === 401 || res.statusCode === 403 || /connection limit/i.test(body)) {
          rotateProvider(`handshake ${res.statusCode}`)
        }
      })
    })

    upstream.on('error', (err) => {
      log('upstream ERROR:', err?.message || err)
      // The 'close' handler will fire next and perform the rotate + reconnect.
    })
  }

  /** Re-issue every client's active subscriptions on the current (fresh) upstream. */
  function resubscribeAll() {
    for (const [client, subs] of clientSubs) {
      if (client.readyState !== WebSocket.OPEN) continue
      for (const [facingSubId, entry] of subs) {
        const gid = ++globalId
        pendingResub.set(gid, { client, facingSubId })
        const req = { jsonrpc: '2.0', id: gid, method: 'eth_subscribe', params: entry.params }
        if (upstream && upstream.readyState === WebSocket.OPEN) upstream.send(JSON.stringify(req))
        else upstreamQueue.push(JSON.stringify(req))
      }
    }
    const total = [...clientSubs.values()].reduce((n, m) => n + m.size, 0)
    if (total) log(`re-subscribed ${total} subscription(s) on new upstream`)
  }

  /** Attach a freshly-accepted browser client to this route's upstream. */
  function handleClient(client, req) {
    if (idleCloseTimer) {
      clearTimeout(idleCloseTimer)
      idleCloseTimer = null
    }
    clients.add(client)
    clientSubs.set(client, new Map())
    log(`client connected from ${req.headers.origin || '(no origin)'} — ${clients.size} client(s) total`)
    ensureUpstream()

    client.on('message', (data) => {
      let msg
      try { msg = JSON.parse(data.toString()) } catch { return }

      const gid = ++globalId
      const originalId = msg.id
      const isSubscribe = msg.method === 'eth_subscribe'
      const isUnsubscribe = msg.method === 'eth_unsubscribe'

      // Record subscriptions so we can survive an upstream rotation. We key them by the client-facing
      // subId once the upstream replies (Case 2); until then we stash the request keyed by gid.
      if (isSubscribe) {
        pendingById.set(gid, { client, originalId, isSubscribe: true, subParams: msg.params })
        // We store the pending sub against the eventual facing id in Case 2 via a temporary tag:
        sendUpstream(JSON.stringify({ ...msg, id: gid }))
        // Remember the raw params immediately under a placeholder; upgraded to real subId in Case 2.
        pendingSubParamsByGid.set(gid, { client, params: msg.params })
        return
      }

      if (isUnsubscribe) {
        const facing = Array.isArray(msg.params) ? msg.params[0] : undefined
        if (facing) {
          const subs = clientSubs.get(client)
          if (subs) subs.delete(facing)
          // Best-effort: translate facing -> current live subId for the upstream unsubscribe.
          let liveSub = facing
          for (const [live, f] of liveSubToFacing) if (f === facing) { liveSub = live; break }
          pendingById.set(gid, { client, originalId, isSubscribe: false })
          sendUpstream(JSON.stringify({ jsonrpc: '2.0', id: gid, method: 'eth_unsubscribe', params: [liveSub] }))
          subToClient.delete(liveSub)
          liveSubToFacing.delete(liveSub)
        }
        return
      }

      if (originalId !== undefined && originalId !== null) {
        pendingById.set(gid, { client, originalId, isSubscribe: false })
        sendUpstream(JSON.stringify({ ...msg, id: gid }))
      } else {
        sendUpstream(JSON.stringify(msg))
      }
    })

    // Send periodic ping to browser client every 25s to prevent Cloudflare Tunnel 100s idle timeout
    const clientPingTimer = setInterval(() => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.ping() } catch {}
      }
    }, 25_000)

    const cleanup = () => {
      clearInterval(clientPingTimer)
      clients.delete(client)
      clientSubs.delete(client)
      for (const [gid, entry] of pendingById) if (entry.client === client) pendingById.delete(gid)
      for (const [gid, entry] of pendingResub) if (entry.client === client) pendingResub.delete(gid)
      for (const [gid, entry] of pendingSubParamsByGid) if (entry.client === client) pendingSubParamsByGid.delete(gid)
      for (const [subId, owner] of subToClient) {
        if (owner === client) {
          subToClient.delete(subId)
          liveSubToFacing.delete(subId)
          sendUpstream(JSON.stringify({ jsonrpc: '2.0', id: ++globalId, method: 'eth_unsubscribe', params: [subId] }))
        }
      }
      log(`client disconnected — ${clients.size} client(s) left`)
      if (clients.size === 0 && upstream) {
        if (idleCloseTimer) clearTimeout(idleCloseTimer)
        // 15-second grace period: prevents rapid connect/disconnect churn during page transitions from killing upstream
        idleCloseTimer = setTimeout(() => {
          if (clients.size === 0 && upstream) {
            log('no clients left after 15s grace period — closing upstream to release the slot')
            try { upstream.close(1000, 'no clients') } catch {}
            upstream = null
            upstreamReady = false
          }
        }, 15_000)
      }
    }

    client.on('close', cleanup)
    client.on('error', (err) => {
      log('client ERROR:', err?.message || err)
      cleanup()
    })
  }

  // Hook into Case 2 registration: when a subscribe reply arrives, promote the pending params into
  // clientSubs keyed by the real (facing) subId. We do this by wrapping subToClient.set via the
  // message handler above; here we reconcile any promotions on a short interval as a safety net.
  // (Kept simple: the message handler already sets subToClient/liveSubToFacing; we mirror params.)
  function reconcilePromotions() {
    for (const [gid, entry] of pendingSubParamsByGid) {
      // If this gid is no longer pending as a request, the subscribe reply was processed.
      if (!pendingById.has(gid)) {
        // Find the facing subId that was just registered for this client with no params stored yet.
        const subs = clientSubs.get(entry.client)
        if (subs) {
          for (const [live, facing] of liveSubToFacing) {
            if (subToClient.get(live) === entry.client && !subs.has(facing)) {
              subs.set(facing, { params: entry.params })
            }
          }
        }
        pendingSubParamsByGid.delete(gid)
      }
    }
  }
  const promotionTimer = setInterval(reconcilePromotions, 250)
  if (promotionTimer.unref) promotionTimer.unref()

  function shutdown() {
    try { if (idleCloseTimer) clearTimeout(idleCloseTimer) } catch {}
    try { clearInterval(promotionTimer) } catch {}
    try { if (upstream) upstream.close() } catch {}
  }

  return { handleClient, shutdown, clientCount: () => clients.size }
}

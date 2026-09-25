# Trade Page & Chart — Fixes Log and Roadmap

_Last updated: 2026-09-20_

This document records the fixes applied to the trade page price/candle pipeline and the
planned next phases (WebSocket, then an indexer + database). It is meant as a hand-off note
so anyone (human or agent) can understand **why** the code is shaped the way it is.

Primary files involved:
- `frontend/app/trade/page.tsx` — trade page; owns the shared `projects` state and the pollers.
- `frontend/lib/useTokenTrades.ts` — on-chain fills → candles / `lastPrice` / `volume24h` / `change24h`.
- `frontend/lib/useQualyraTokens.ts` — token list + curve/pool **spot** price (`CURVE_POLL_MS = 12000`).
- `frontend/lib/useLivePrices.ts` — `/api/prices` poll (25s) + `mergeProjectsWithLivePrices`.
- `frontend/components/trade/CandleChart.tsx` — lightweight-charts wrapper.

---

## Part 1 — Fixes completed

### 1.1 Candle builder produced invalid OHLC bars — FIXED
**File:** `frontend/lib/useTokenTrades.ts`
When a new candle bucket opened, `open` was seeded from the previous candle's `close` but
`high`/`low` were seeded only from the fill's price, so a bar that gapped from the prior close
could report `high < open` (an impossible candle). Now `high`/`low` are seeded from
`max/min(open, price)`, so a new bar can never be invalid.

### 1.2 Compact-price formatter power-of-ten carry bug — FIXED
**File:** `frontend/lib/formatters.ts`
`formatCompactSmall` could round the mantissa up to `10` (e.g. `9.9999e-11`), printing an extra
digit against the wrong zero-count and showing a price ~10× too small
(`0.0₁₀10000`). The fix detects the carry, rolls the exponent up by one, and re-rounds. Verified
against the live on-chain values.

### 1.3 permit2 submodule SHA was invalid (41 chars) — FIXED
**Files:** `contracts/DEPENDENCIES.md`, `contracts/script/install-deps.ps1`, `contracts/script/install-deps.sh`
The pinned commit `cc56ad0f34399c502c246fc5cfcc3db92bb8b7219` had an extra `9` at index 12
(41 chars). Corrected to the authoritative 40-char SHA from the actual v4-periphery submodule
checkout: `cc56ad0f3439c502c246fc5cfcc3db92bb8b7219`.

### 1.4 Anti-flicker round 1 (referential stability) — APPLIED
These reduced churn but did **not** fully stop the flicker (see 1.5 for the real root cause):
- `mergeProjectsWithLivePrices` returns the same object/array reference when nothing changed.
- `useTokenTrades` `setTrades` guard compares last fill `txHash` + `price` + `timestamp`, and the
  candle computation was split into a memo keyed only on `[trades, bucketSeconds]` so the
  `isLoading`/`refresh` toggles no longer rebuild the candle array each poll.
- `priceTrends` colour animation only fires when a move exceeds a small threshold.
- `CandleChart` is wrapped in `React.memo` with a custom comparator.

### 1.5 Price/candle flicker while idle — ROOT CAUSE FIXED ✅ (this is the important one)
**File:** `frontend/app/trade/page.tsx` — type-check (`tsc --noEmit`) passes clean.

**Root cause (confirmed from the code, not assumed):**
For a **graduated** on-chain token, the field `projects[viewedToken].price` was written by
**two competing effects on different intervals, holding different values**:

| Writer | Interval | Value written |
|---|---|---|
| `syncProjects` effect (`[livePrices, chainLive, chainProjects]`) → `setProjects([...chainProjects, ...])` | ~12s (`CURVE_POLL_MS`) | curve/pool **spot** price (≈ `7.7e-12`) |
| graduated-price effect (`chainHistory.lastPrice` …) → `setProjects(...)` | ~20s (+ re-fires on `isLoading` toggle & `curProject.price` change) | **last-fill** price (≈ `1.7e-11`) |

Because the two values differ, the field **ping-ponged** between them every few seconds. The
header re-rendered with alternating text, and `CandleChart`'s live-update effect (keyed on
`project.price`) called `series.update()` and moved the last candle's `close` between the two
values — **flicker with zero transactions**. Memoization couldn't help because the *value itself*
oscillated.

**Fix — one authoritative price per viewed graduated token** (canonical = `chainHistory.lastPrice`,
so the header and the trade-derived candles agree). Three edits in `page.tsx`:

1. Added `authoritativeFieldsRef` (a `useRef` holding `{ id, price, mcap, vol24, chg }`).
2. The graduated-price effect **records** those fields into the ref each time it computes them
   (and clears the ref to `null` for non-graduated tokens).
3. The `syncProjects` effect no longer blindly does `setProjects([...chainProjects, ...])`; it
   **re-applies** `authoritativeFieldsRef.current` onto the matching token, so the 12s spot
   refetch can no longer overwrite the traded price.

Result: both writers now converge on a single value, so when idle `project.price` is **stable**,
the chart's live-update effect does not re-fire, and the header/candle stop flickering. Non-graduated
tokens are unaffected (their price still comes from the curve spot).

> If any idle flicker remains after a `npm run dev` restart, the remaining suspect is another
> oscillating value (e.g. `hi`/`lo`) or the sheer number of pollers (see Part 2). The fastest way
> to confirm is temporary per-render logging of `project.price / hi / lo / chainHistory.lastPrice / spot`.

### 1.6 Chart timeline: forced ~30h look-back, negative Y-axis, dangling tail + fake volume — FIXED ✅
**File:** `frontend/components/trade/CandleChart.tsx` (`buildContinuousCandles`) — type-check clean.
Four issues in the continuous-timeline builder:
- **Forced ~30h look-back:** `startBucket` used `Math.min(firstTradeBucket - 12*interval, targetStart)`
  where `targetStart = currentBucket - 120*interval` (~30h at 15m). A token that only traded today drew
  one lone bar ~30h in the past, then a ~1.5-day empty gap, then the real spike. Fixed: when real trades
  exist, `startBucket = firstTradeBucket` (let lightweight-charts widen barSpacing to fill the width).
- **Negative Y-axis (`-0.0₁₀…`):** the synthetic filler rounded with `.toFixed(8)`, truncating micro
  prices (e.g. `2.5e-11`) to `0`; a zero-priced bar beside real micro-price bars made lightweight-charts
  autoscale below zero. Fixed: removed `.toFixed(8)` on the filler (real bars go through `cleanPrice`,
  which uses `toPrecision(8)` and preserves tiny values).
- **Carry-forward tail:** the fill loop ran `for (t = startBucket; t <= currentBucket; …)`, i.e. it
  forward-filled a flat carry-forward candle for **every empty bucket up to "now"**. For a token that
  traded a while ago this drew a long flat line dangling off to the right. Fixed by ending the loop at
  the **last real trade bucket** (`lastRealBucket`); a token with no trades still shows its baseline out
  to the current bucket. The live current-price bar is added by the live-update effect and sits adjacent
  to the last real bar (lightweight-charts uses ordinal bar spacing, so no empty gap is drawn).
- **Fake baseline volume:** the synthetic pre-first-trade baseline bars used
  `volume: Math.round(50 + rnd * 250)`, making past volume look thick/disproportionate. Set to `volume: 0`.

Note: the between-trade gap fill in `useTokenTrades.ts` `derived` is bounded (`t < bucket`, `volume: 0`)
and does **not** extend to "now", so it was left as-is.

---

## Part 2 — Roadmap (deferred — NOT yet implemented)

Context: the trade page currently runs **~6 independent pollers**, which is the underlying
"polling soup" reason live values churn:

| Interval | Source | Writes |
|---|---|---|
| 10s | `loadTransfers` | transfers |
| 12s | `CURVE_POLL_MS` (wagmi) | spot price |
| 15s | `/api/trades` | trades |
| 20s | `useTokenTrades` (getLogs) | lastPrice / candles |
| 25s | `useLivePrices` | live prices |
| — | limit-order engine | order checks |

### Phase 2 — WebSocket / event subscription (push instead of poll)
Replace the trade/price polling with a subscription so the client receives **only new events**
instead of re-fetching whole histories on a timer.
- Use viem `webSocket()` transport + `watchContractEvent` (or `eth_subscribe` logs) for pool swaps.
- On a new swap event, call `series.update()` for **only the affected/last bar** — never
  `setData()` the whole series while idle.
- **Caveats (must be handled):**
  - Pair it with incremental consumption **and** the single-source-of-truth from 1.5 — WebSocket
    alone won't help if the code still re-derives + `setData()` everything.
  - The curve/pool **spot** price is not an event; keep one lightweight source for it.
  - Handle testnet WS reliability: reconnect/backoff, and fall back to polling if the socket drops.
- **Outcome:** idle = truly idle (no updates, no flicker); live updates only on real trades.

### Phase 3 — Indexer + Database + API/SSE (production architecture)
For a token-launch DEX with charts, this is the correct long-term shape.
- A small backend service subscribes to chain events (or polls once, centrally) and writes trades
  to a database (e.g. Postgres or SQLite for a start).
- The server computes and stores derived data **once**: candles/OHLC per timeframe, 24h
  high/low/volume, market cap.
- The frontend reads from the app's own API and subscribes via WebSocket/SSE for live pushes.
- **Benefits:** single source of truth (price stops oscillating by construction), consistent
  ordered/deduplicated data, fast reads, no client RPC hammering, history survives refresh.
- **Trade-offs:** it is a real backend — hosting, migrations, chain-reorg handling, and keeping the
  indexer in sync. Likely overkill for a testnet MVP, but the right destination for production.
- **Suggested starting stack:** Node/TypeScript indexer using viem, Postgres (Prisma/Drizzle),
  a thin REST/tRPC read API, and SSE (or WS) for the live candle/price channel.

---

## Restart reminder
`NEXT_PUBLIC_*` values are inlined at build time, and these are frontend edits, so **stop and
restart `npm run dev`** for any of the above to take effect.

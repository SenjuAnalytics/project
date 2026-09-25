# Qualyra Battle Engine — TWAP + Hysteresis Hardening (Design)

> **Status: DESIGN ONLY. No Solidity in `src/` is changed by this document.**
> This is the implementation plan for making the eligibility/DQ engine resistant to
> single-trade price manipulation. It is grounded in the current code:
> `QualyraCompetitionVault.onTradeClose` / `_marketCapUsd`, `QualyraBondingCurve._spotPrice`,
> and `QualyraHook.afterSwap`.

---

## 1. Problem recap (mapped to current code)

Market cap is computed from an **instantaneous** price × full supply, with **no time-averaging**:

- `_marketCapUsd(token, tokenPriceInAsset, asset)` → `mcUsd = tokenUsdPrice18 × totalSupply()`.
- `tokenPriceInAsset` comes from a single trade:
  - Curve: `_spotPrice()` = `mulDiv(phantomQuote + quoteReserve, 1e18, tokenReserve)` (marginal price).
  - Pool: `afterSwap` → `priceInAsset = mulDiv(quoteAbs, 1e18, tokenAbs)` (realized swap price).

Because one trade fully moves this reading, an attacker can:

- **B1** (pre-eligible, `onTradeClose` ~L339): one settled close `< $100k` → **permanent DQ** + drain pot.
- **B2** (live battle, ~L319): one settled close `< $100k` → token **loses**, pot to opponent.

`eligible` is cheap to attack (1 close) vs expensive to earn (hold 24h). **TWAP removes the "1 trade = full move" primitive**, which is the root of B1/B2 (and the pump vector A).

**Non-goals of this design:** it does NOT change trading, fees, launch, buyback, or graduation. Those are wrapped in `try/catch` at the call sites and remain unaffected. It does NOT fix the oracle-pause freeze (separate decision, see §7).

---

## 2. Design goals

1. Feed eligibility/DQ a **time-weighted average price** (TWAP) instead of the instantaneous price.
2. Keep the change **gas-cheap** (measured budget: ~+5k gas/swap; see §8).
3. **Fail-safe**: "TWAP not ready" must map to **NOT-EVALUABLE (no-op)**, never to `mc = 0` (which would wrongly DQ).
4. Compose cleanly with **hysteresis + dwell** (§6).

---

## 3. TWAP design

### 3.1 Accumulator state (per token, at the price source)

Arithmetic price-cumulative (Uniswap-v2 style). Two storage slots per token:

```solidity
struct PriceObs {
    uint256 priceCumulative;   // Σ price * dt  (wrap allowed)
    uint128 lastPrice;         // last observed price-in-asset (1e18-scaled)
    uint48  lastTimestamp;     // block.timestamp of last accumulation
    uint48  startedAt;         // when this accumulator was first initialized (warm-up gate)
}
mapping(address token => PriceObs) internal _obs;   // lastPrice+lastTimestamp+startedAt pack into slot 2
```

### 3.2 Update rule (called on every trade, in the source)

```solidity
function _accumulate(address token, uint256 newPrice) internal {
    PriceObs storage o = _obs[token];
    uint48 nowTs = uint48(block.timestamp);
    if (o.startedAt == 0) { o.startedAt = nowTs; o.lastTimestamp = nowTs; o.lastPrice = uint128(newPrice); return; }
    uint256 dt = nowTs - o.lastTimestamp;
    if (dt > 0) {                                  // once-per-block: multiple trades in one block accumulate once
        o.priceCumulative += o.lastPrice * dt;     // accumulate the price that HELD during [last, now]
        o.lastTimestamp = nowTs;
    }
    o.lastPrice = uint128(newPrice);
}
```

Key property: the price that held during the elapsed interval is what gets integrated. A brief manipulated price only contributes for as long as it actually persists.

### 3.3 `consultTwap(token, window)` — rolling checkpoint (recommended)

Cheapest approach that is robust enough for a market-cap gate (not a liquidation oracle):

```solidity
// checkpoint = a stored (cumulative, timestamp) snapshot rolled forward ~every `window`
function consultTwap(address token, uint32 window) public view returns (uint256 twap, bool ok) {
    PriceObs storage o = _obs[token];
    // current cumulative, including the open segment up to `now`
    uint256 cumNow = o.priceCumulative + o.lastPrice * (block.timestamp - o.lastTimestamp);
    (uint256 cumThen, uint48 tsThen) = _checkpointBefore(token, window); // ~window seconds ago
    uint256 elapsed = block.timestamp - tsThen;
    if (block.timestamp - o.startedAt < window || elapsed == 0) return (0, false); // WARM-UP → NOT-EVALUABLE
    twap = (cumNow - cumThen) / elapsed;
    ok = true;
}
```

- **Recommended:** single rolling checkpoint → approximate window in `[window, 2*window)`. 1–2 extra slots, ~cheap.
- **Alternative (exact fixed window):** Uniswap-v3-style observation ring buffer + binary search. More storage/gas; only needed if an exact 30-min window is a hard requirement.
- **Extra hardening (optional):** use a **geometric** mean (tick-cumulative) instead of arithmetic to blunt extreme spikes further.

### 3.4 Where the accumulator lives — decision

- **Option A (recommended): pool-phase only.** Battles require `isGraduated` (`scheduleBattles`), so the token always trades on the v4 pool during a battle. Maintain the accumulator in `QualyraHook.afterSwap` only. **Curve-phase trades pay nothing extra.** The eligibility timer starts once graduated + TWAP warmed up.
- **Option B: curve + pool.** Maintain in both `QualyraBondingCurve` (buy/sell) and the hook, with a hand-off at graduation. More complete (pre-graduation eligibility) but curve trades also pay ~5k and the hand-off adds complexity.

Pick A unless pre-graduation eligibility is a product requirement.

---

## 4. Vault integration

The **source** (hook) already computes the spot price in `afterSwap`. Let it also update the accumulator and pass the **TWAP** into the vault, so the vault keeps one clean input and there is no extra external call:

```solidity
// QualyraHook.afterSwap (sketch)
uint256 spot = Math.mulDiv(quoteAbs, 1e18, tokenAbs);
_accumulate(config.token, spot);
(uint256 twap, bool twapOk) = consultTwap(config.token, TWAP_WINDOW);
if (twapOk) {
    try IQualyraCompetitionVault(competition).onTradeClose(config.token, twap, asset) {} catch {}
}
// if !twapOk (warm-up) → skip the call entirely → NOT-EVALUABLE, never mc=0 (goal #3)
```

- `onTradeClose(token, tokenPriceInAsset, asset)` **signature unchanged** — it now receives a TWAP-derived price.
- The `_marketCapUsd` math is **unchanged**; it just consumes a smoothed price.
- Skipping the call when TWAP is not ready gives the correct fail-safe (no timer, no DQ), matching the existing NOT-EVALUABLE semantics at `onTradeClose` L~313.

> Alternative integration: keep the hook passing spot, and have the vault call back `source.consultTwap(...)`. Cleaner separation but adds one external call + SLOADs per trade. The push-model above is cheaper.

---

## 5. Hysteresis + dwell (composes with TWAP)

Two bands + a persistence timer so DQ never fires on a single reading:

```solidity
uint256 constant MC_ELIGIBLE_USD = 100_000e18;  // enter / eligibility (upper band)
uint256 constant MC_DQ_USD       =  90_000e18;   // DQ trigger (lower band)
uint256 constant DQ_DWELL        = 30 minutes;   // must stay below MC_DQ this long
```

Add `uint48 belowSince;` to `struct Eligibility`. Replace the single-close DQ (L319–320 live, L339 pre-eligible) with:

```solidity
if (mcTwap < MC_DQ_USD) {
    if (e.belowSince == 0) e.belowSince = nowTs;
    else if (nowTs - e.belowSince >= DQ_DWELL) { e.disqualified = true; e.disqualifiedAt = nowTs; /* emit */ }
} else {
    e.belowSince = 0; // recovered → reset the dwell clock
}
```

The dead zone `$90k–$100k` prevents a marginal poke around exactly `$100k` from flipping state. Hysteresis alone adds **zero** trade gas (pure vault logic); it only closes the "exact-threshold poke" gap. TWAP is what closes the "big dump" gap.

---

## 6. Edge cases & fail-safes

| Case | Behavior |
|---|---|
| Freshly graduated / accumulator warming up (`now - startedAt < window`) | `consultTwap` returns `ok=false` → hook skips `onTradeClose` → NOT-EVALUABLE (no timer, no DQ). Never `mc=0`. |
| Dormant token (no trades for a long time) | Next trade accumulates `lastPrice × largeDt` → TWAP dominated by the long-held price. A single late dump can't crater the average. Desired resistance. |
| Oracle NOT-EVALUABLE (stock-feed pause, sequencer) | Unchanged: `onTradeClose` no-ops (`_marketCapUsd` returns `ok=false`). TWAP tracks token-in-asset price only; USD conversion still gated by the feed. **TWAP does not fix the pause freeze** — that is a separate decision (schedule battles outside pauses, or a permissionless poke). |
| Same-block trades | Accumulate once (`dt==0` short-circuit) → no double gas. |
| `eligible` + idle (sticky eligibility) | Still not re-checked outside a battle. Optionally add a TWAP re-validation at `scheduleBattles` (see §8, open decision). |

---

## 7. Gas impact (measured on this repo, `forge test --gas-report`)

Real per-trade gas today: pool `swapExactIn` median **280,040**, curve `buy` median **243,843**, curve `sell` median **169,024**.

- TWAP accumulator adds **~5,000 gas/swap** (one packed-slot cold write) → **+1.8% (pool)** to **+3.0% (curve sell)**.
- One-time accumulator init: ~22,100 gas per token.
- Hysteresis/dwell: **~0** extra trade gas (vault-side only).
- At live gas 0.044 gwei / ETH ≈ $2,670 → **~$0.0006 (~Rp10) per trade**.

---

## 8. Parameters & open decisions

1. **TWAP_WINDOW**: proposed **30 minutes** (balance of manipulation cost vs responsiveness).
2. **MC_DQ_USD / DQ_DWELL**: proposed **$90k** / **30 min**.
3. **Accumulator scope**: Option A (pool only) vs B (curve + pool). Recommend **A**.
4. **consult mode**: rolling checkpoint (recommended) vs ring buffer (exact window).
5. **Arithmetic vs geometric** mean. Recommend arithmetic first.
6. **Sticky eligibility**: re-validate MC (via TWAP) at `scheduleBattles`? (closes the pump→eligible→dump→battle path).
7. **Oracle-pause freeze**: accept, or add permissionless `poke(token)` (TWAP-gated).

---

## 9. Rollout / test plan

1. Land this design + parameters (this file).
2. Implement accumulator + `consultTwap` in `QualyraHook` (Option A).
3. Wire TWAP into the `afterSwap → onTradeClose` push path with the warm-up skip.
4. Add hysteresis + `belowSince` dwell in `QualyraCompetitionVault`.
5. Unit tests: warm-up NOT-EVALUABLE; single-dump does NOT DQ (TWAP); sustained-below DQ after dwell; dead-zone no-flip; dormant-token resistance; same-block once.
6. Re-run `forge test` (incl. fork tests) + `--gas-report`; confirm the +~5k/swap budget and 174-test suite still green.

---

## 10. Trade-offs summary

| Change | Benefit | Cost / risk |
|---|---|---|
| TWAP | Kills single-trade manipulation (A/B1/B2) | ~+5k gas/swap; adds lag (a genuine crash reflects over the window) |
| Hysteresis + dwell | No single-reading DQ; buffer around threshold | Dead zone must be chosen; DQ is slower |
| Warm-up = NOT-EVALUABLE | Never wrongly DQ on missing history | Newly graduated tokens can't battle until window elapses |
| `poke()` (optional) | Removes "no-trade freeze" | New public surface → must be TWAP-gated |

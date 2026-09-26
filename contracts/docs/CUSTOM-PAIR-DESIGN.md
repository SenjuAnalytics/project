# Qualyra — Community / Custom Pair Assets (Design)

> **Status: proposal — no Solidity changed.** Everything in §1 was read from the code at commit
> `b135a53`; the file:line references are the evidence. Sections 3 to 9 are the design space, §10 is
> the **chosen model** (permissionless, gated by an existing DEX pool) and §9 records the decisions.
> Written in the same spirit as `TWAP-HARDENING-DESIGN.md`.

The question this answers: *can anyone add their own pair asset (their own token, or a trending
token like PONS) so the platform becomes a multi-pair launchpad?* — **Yes, and most of the
foundation is already in place.** The decimals problem is already solved. The two real gaps are
(a) who is allowed to list an asset, and (b) where the USD price for the $100k gate comes from
when the asset has no Chainlink feed.

> **Decided (this session):** no application process. Anyone may add a pair, and the gate is a
> *fact the chain can verify* — the asset must already trade in a deep, established pool on the
> canonical DEX. See §10 for the exact rules, and why "a pool exists" alone must never be the gate.

---

## 1. What already works today (verified)

| # | Capability | Where | Note |
|---|---|---|---|
| 1 | Any quote asset with **6 to 36 decimals** | `QualyraFactory.sol:42,45,182,183` | Floor 6 (below it basis-point fees round to zero), ceiling 36 (hook arithmetic). |
| 2 | Decimals are **verified against the token on-chain** at listing | `QualyraFactory.sol:192` → `_requireQuoteAssetDecimals` | Claiming 6 for an 18-decimal token reverts (`QuoteAssetDecimalsMismatch`). |
| 3 | Pool prices are normalized to **whole asset units, 18-decimal fixed point** | `QualyraHook.sol:413` (`_toPrice18`), `:129` (`registerPool` reads the asset's decimals) | A 6-decimal USDG, an 8-decimal feed asset and an 18-decimal stock token all produce the same unit. Precision does not degrade with decimals. |
| 4 | Curve, router, executor and fee vault are **asset-agnostic** | `QualyraBondingCurve.sol:169-173,373-404`; `QualyraLaunchRouter.sol:37-64`; `QualyraFeeVault.sol:70-81` | ERC-20 quotes are pulled with `safeTransferFrom`, paid out with `safeTransfer`; balances are keyed `(token, asset)`. Native ETH is just `address(0)`. |
| 5 | Pot, battles, buyback and refunds are keyed by asset | `QualyraCompetitionVault.sol:145` (`pendingBattlePot[token][asset]`), `Battle.asset`, `:443` | Tokens only ever battle an opponent with the **same** pair asset. |
| 6 | A new asset's curve is **geometrically validated** before listing | `QualyraGraduationExecutor.sol:108` (`checkEconomics`), `:176` (`_poolRange`) | Proves the graduation pool is mintable in the v4 tick range for **both** currency orderings, so an asset can never be listed with economics that break graduation. |
| 7 | Oracle is **fail-safe**: no feed → no timer, no DQ, trading untouched | `QualyraOracle.sol:65,106`; `QualyraCompetitionVault.sol:414` (`_marketCapUsd`) | `ok == false` is a no-op for that trade. A non-evaluable token simply never becomes eligible. |
| 8 | Fees of a token that never qualifies are **not stuck** | `QualyraCompetitionVault.sol:116,300` (`PENDING_EXPIRY` 30 days, `releaseExpiredPending`) | The 15% competition share goes to the treasury instead of accumulating forever. |
| 9 | Frontend reads pair assets **from the factory**, indexer has a price seam | `frontend/lib/usePairAssets.ts:67-98` (`quoteAssetCount` / `quoteAssetAt` / `quoteAssetConfig`); `indexer/src/config.ts:177` (`PAIR_ASSETS`), `indexer/src/price/PriceProvider.ts` | Listing an asset is enough for the launch form to offer it; the indexer still needs a matching entry and USD basis. |

**Consequence:** a community asset that *does* have a Chainlink USD feed can be listed **today**
with two owner transactions (`setQuoteAsset` + `setPriceFeed`) and **zero Solidity changes** —
it can launch, trade, graduate and battle, because there is no hardcoded asset list anywhere in
the contracts.

### The two hard limits that remain

1. **Listing is admin-only.** `setQuoteAsset` is `onlyOwner` (timelock), and every parameter
   (`phantomQuote`, `graduationThreshold`) is picked by the operator, not the creator.
2. **Battle eligibility needs a USD price.** `_marketCapUsd` reads `factory.priceFeedOf(asset)`
   (`QualyraCompetitionVault.sol:419`) — a Chainlink `AggregatorV3` with a heartbeat. An asset
   with no feed is *trade-only*: it can launch, trade and graduate, but it can never start the
   24h timer, so it can never battle. Its competition fees go to the treasury after 30 days.

---

## 2. The three separate gaps

| Gap | Question | Cost to close |
|---|---|---|
| **G1 — Listing rights** | Curated (timelock) / creator-proposed with a bond / fully permissionless? | Governance decision + a small registration function |
| **G2 — USD price path** | How do we get `asset/USD` for an asset with no Chainlink feed? | The real engineering (new oracle kind + config + vault wiring + indexer path) |
| **G3 — Asset hygiene** | What stops a fee-on-transfer / rebasing / blacklisting / pausable quote asset from jamming the curve, the vault and payouts? | On-chain probe checks + a disable/kill switch |

G2 is a **spec change**: `docs/FEE-AND-BATTLE-SPEC.md` §2.2 states the USD price source is
Chainlink, decided as "Arah B". A pool-derived price needs the same kind of explicit decision as
the earlier TWAP hardening did.

---

## 3. G2 — the oracle, three options

### Option A — trade-only assets, no new oracle (zero code)
A community asset without a feed can be listed by the timelock today. It trades, graduates, pays
creator fees **in its own quote asset**, and never battles. Its 15% competition share drains to
the treasury after `PENDING_EXPIRY`.
Cheapest, safest, and already true. The product story is: *"any pair trades; battles are for
oracle-backed pairs."*

### Option B — anchored pool oracle (recommended if G2 is in scope)
```
asset/USD  =  TWAP(asset pool, in anchor units)  ×  Chainlink(anchor/USD)
```
* **Anchor** must itself have a Chainlink feed: ETH/USD or USDG/USD. Max **one hop** — no
  recursive chains, no `asset → tokenA → tokenB → ETH`.
* The source pool is registered in the factory, not discovered on the fly:
  `assetOracleOf[asset] = { kind, anchor, poolId/key, window, minDepthUsd18 }`.
* New code lives in `QualyraOracle` as a fourth reader (`readAnchoredUsdPrice`), so the vault's
  `_marketCapUsd` keeps its single "trusted or NOT-EVALUABLE" contract. The vault must stay under
  the 24 KB limit (see `README.md` §build; `via_ir` is on for exactly this reason).
* Guards, all fail-safe (violation ⇒ `ok = false`, never a wrong DQ):
  1. **Depth floor** — the source pool must hold at least `minDepthUsd18` of value; below it the
     price is not trustworthy and battles for that asset pause.
  2. **Age/warm-up** — the pool must be older than the TWAP window; a pool created 5 minutes ago
     has no meaningful average.
  3. **Time-weighted** — reuse the same idea as `QualyraHook._observe` (30-minute windows); a
     single-block push must not move the number.
  4. **Deviation sanity** — optional second source (or a slow exponential average); if the two
     disagree by more than X%, NOT-EVALUABLE.
  5. **Per-asset kill switch** — `setPriceFeed(asset, 0, 0)` already unsets a feed; the same must
     work for an anchored source.
  6. **Staleness** — heartbeat on the anchor feed (already implemented) plus a max age for the
     pool's last swap.
* Indexer: the same path must be usable off-chain, otherwise scoring and `datasetHash`
  verification disagree with the chain. `PriceProvider` is the seam for that.

### Option C — USD-stable battles only
Allow any quote asset for launching and trading, but **restrict battles to assets whose USD path
is trusted**. This is Option A plus a rule; it can be adopted now and Option B added later
without changing any token already launched.

**My recommendation:** ship **Option C now** (zero code, honest product rule), design Option B as
the follow-up, and never let an unbacked asset into the battle engine. The $100k gate decides who
receives real money — a price source that a whale can push is worse than no battle at all.

### Why this matters more in a volatile quote asset
Market cap becomes `f(token/quote) × f(quote/USD)`. A token paired to PONS can be disqualified
because **PONS** fell, even if the token itself held its price. That is intended behaviour, not a
bug, but it must be visible in the UI and understood by the operator — a volatile-quote battle is
a leveraged bet on the quote asset. If the quote asset's own price comes from a shallow pool, an
attacker can push **the quote** instead of the token to fake a $100k crossing. That is exactly why
Option B needs a depth floor, and why Option A/C is the safe default.

---

## 4. G1 — listing model, three options

| Model | Who lists | Risk | Ops cost |
|---|---|---|---|
| **M1 Curated** (today) | Timelock, one tx per asset | Lowest | Verify feed, decimals, threshold per asset |
| **M2 Propose + bond** | Anyone proposes with a bond; on-chain validation runs immediately; timelock (or an auto-rule when the oracle is already trusted) enables | Medium | Review exceptions, slashing/disable path |
| **M3 Permissionless** | Anyone, auto-enabled if the oracle path is trusted | Highest — spam, self-paired farming, scam assets | Monitoring + kill switch |
| **M4 Pool-gated permissionless** — **chosen, see §10** | Anyone, as soon as the asset is *provably already trading* in a deep, established pool on the canonical DEX | Low, if the gate is defined as a fact (canonical pool key + real depth + observed age) rather than "a pool exists" | Monitoring + kill switch; no per-asset approvals |

M2 sketch: `proposeQuoteAsset(asset, phantomQuote, graduationThreshold, expectedDecimals)`
* runs every check in §5,
* stores it as `pending` (not usable by `launchToken`),
* refundable bond (small, in ETH) that is returned when the asset's first launch graduates or is
  burned when the asset is disabled for cause,
* the timelock (or the guardian) enables it; the operator only ever *enables*, and can disable.

---

## 5. G3 — on-chain validation of a proposed asset (M2/M3)

Runs inside the registration/proposal transaction; anything that fails is rejected, not queued:

1. `asset != address(0)` (that key means native ETH), `asset.code.length > 0`.
2. `decimals()` readable, `6 <= decimals <= 36` — already implemented.
3. **Transfer probe**: the factory pulls `probeAmount` from the proposer and sends it straight
   back, requiring an exact balance match both ways. Catches fee-on-transfer, rebasing and
   "tax on transfer" tokens before they can ever hold a curve. Must be `nonReentrant` and must
   use balance deltas, not the return value.
4. `checkEconomics(asset, phantomQuote, graduationThreshold, TOKEN_SUPPLY)` passes — already
   implemented (`QualyraGraduationExecutor.sol:108`).
5. **Shape bounds**: `phantomQuote * 5 == graduationThreshold * 2` is the shipped ratio
   (`0.40`, same as ETH and the three Pons stock pairs — see `QualyraStockQuoteAsset.t.sol`).
   Permissionless listing should accept a small band around it, e.g. `0.2 … 1.0`, so curve shape
   stays comparable across pairs.
6. **Value bounds** using the asset's trusted USD path: graduation target within
   `[MIN_GRADUATION_USD, MAX_GRADUATION_USD]` (e.g. $2k … $250k). Without a trusted USD path this
   check cannot run ⇒ the asset is **not battle-eligible** (Option A/C) and its listing is
   trade-only.
7. **Battle flag** stored per asset: `battleEligible[asset]`. Set only when (6) passes. The vault
   keeps its fail-safe either way.

---

## 6. What changes for users and tokenomics

* Creator fees, the battle pot, buybacks and refunds are all denominated in **the quote asset**.
  A PONS-paired creator is paid in PONS, not ETH. The UI already shows the pair symbol
  (`LeaderboardSection.tsx`), but every USD conversion needs the asset's rate.
* **Battles only pair equal assets** (`Battle.asset`), so every new asset starts with an empty
  arena — the first two eligible tokens of that asset are guaranteed opponents. That is a feature
  for launch marketing and a cold-start problem for the league.
* A volatile quote asset makes the $100k rule *harder* to hold, and makes `DQ_DWELL` (30 minutes)
  fire more often. That is the honest consequence of "pair with anything".
* The indexer's `PAIR_ASSETS` (`indexer/src/config.ts:177`) is a hardcoded map: a new asset needs
  an entry **and** a USD basis, or it is invisible to the leaderboard. Its `PriceProvider` seam
  (`price/OnchainPriceProvider.ts`) is the place to plug the anchored price.
* **Frontend bug to fix before opening listings:** `getQuoteAssetPriceUsd` falls back to
  `$1` for an unknown symbol (`frontend/lib/pricing.ts:40`). A new asset would silently display as
  one dollar per unit. Unknown must be "no price" (hide the USD figure), never a fabricated rate.

---

## 7. Risks, ranked

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Quote-asset manipulation.** Shallow quote pool pushed up to fake a $100k crossing, then a battle pot is won. | Option B depth floor + TWAP + one-hop rule; otherwise no battle (Option A/C). |
| R2 | **Frozen/blacklisting quote asset.** Payouts, refunds and the 7-day refund path all pay in the frozen asset. | Probe at listing; disable switch; publish that pair risk is the quote asset's risk. |
| R3 | **Fee-on-transfer / rebasing quote asset.** Curve accounting and the fee vault's `(token, asset)` balances diverge from real balances. | Transfer probe (§5.3); reject anything that is not balance-exact. |
| R4 | **Self-paired pot farming.** A creator lists their own token as the quote asset, launches a second token against it, and plays both sides. | Bond + battle-eligibility flag + depth floor for the quote asset itself. |
| R5 | **Spam / UI & indexer degradation** with hundreds of assets. | M1/M2 gating, listing bond, asset registry with metadata and a "verified" flag the UI can filter on. |
| R6 | **Bad listing through governance.** A malicious feed/source makes a scam token battle-eligible. | Timelock (48h) + guardian pause + immediate `disableQuoteAsset`; keep the vault's fail-safe semantics. |
| R7 | **Code size.** The vault is already close to the 24 KB limit; a fourth oracle kind adds code. | `via_ir` is on; keep the new reader in `QualyraOracle` (library, inlined only where used) and measure with `forge build --sizes`. |

---

## 8. Phased plan

| Phase | Scope | Deliverable |
|---|---|---|
| **0** | Decide §9. Fix the `$1` fallback in `frontend/lib/pricing.ts`. | 1 frontend fix |
| **1** | List one community asset through the existing admin path (only if it has a Chainlink feed), end to end: launch, trade, graduate, battle. Proves the multi-asset path on a real chain. | 2 owner txs + `indexer/src/config.ts` entry |
| **2** | `battleEligible[asset]` flag + `disableQuoteAsset` hardening + docs/spec update (§2.2 wording for anchored sources). | Small Solidity change + tests |
| **3** | Option B: anchored pool oracle in `QualyraOracle` + factory config + vault wiring + indexer `PriceProvider` + keeper poke. | Design doc → code + tests |
| **4** | M2 listing: `proposeQuoteAsset` with bond, validation per §5, timelock enable, bond refund/slash. | Contract + tests + launch UI "propose a pair" form |
| **5** | M3 fully permissionless + auto-enable rules + monitoring dashboards. | Ops + monitoring |

> **Update:** the chosen model is **M4 (pool-gated permissionless)** — see §10. It merges the
> "no applications" goal of M3 with the technical gate of §5, so phases 4 and 5 below are replaced
> by the M4 phases in §10.4. M2 stays as a fallback if M4 turns out to need a human on the loop.

Each contract phase ends with the full `forge test` suite (a clean `via_ir` build takes several
minutes) and a doc update in the same commit, per repo convention.

---

## 9. Open decisions (my recommendation first)

1. **Listing model — DECIDED: M4** (permissionless, gated by a pool that already exists and is
   deep on the canonical DEX — §10). No applications, no per-asset vote. M2 stays as a fallback.
   Still to fix by numbers: `MIN_POOL_DEPTH_USD`, `MIN_SOURCE_AGE` (§10.3 item 4–5).
2. **Battle eligibility for non-Chainlink assets — DECIDED in shape:** automatic, but only behind
   the §10.3 gate (canonical key + depth + observed age + our own average). Option B's anchored
   price is exactly this; assets that fail the gate stay trade-only.
3. **Anchor asset for Option B** — ETH/USD. It is the deepest pair on the chain, its feed already
   exists, and USDG stays as the stable denomination for stock pairs.
4. **Gate semantics with a volatile quote asset** — keep one $100k line for v1 (spec-consistent),
   and instead require a **higher depth floor** for the quote asset's own pool. Revisit
   asset-relative gates only if real usage shows the need.
5. **Spam control** — a refundable bond (not a burned fee), so honest creators are not taxed while
   scammers still pay for the attempt.
6. **Scope now** — Phase 0 + Phase 1 + Phase 2 of §10.6 first: they are cheap, they fix a real
   display bug, and they prove the multi-asset path before the permissionless door opens.
7. **Numbers to set for the gate** — my starting proposal: `MIN_POOL_DEPTH_USD = $50k` of in-range
   value, `MIN_SOURCE_AGE = 7 days` of unbroken daily checks, graduation target band
   $2k–$250k with the 0.40 shape ratio (±band). All three are timelock parameters, not constants,
   so they can be tightened once real pools exist.

---

## 10. Chosen model — M4: permissionless, gated by an existing pool on the canonical DEX

> **Owner decision (this session):** *"Ketimbang harus mengajukan, lebih baik orang bisa menambahkan
> pair-nya sendiri jika pair tersebut sudah ada / sudah diperdagangkan di Uniswap."* This section turns
> that sentence into rules the chain can enforce by itself, so no one has to approve anything.

### 10.1 What "sudah diperdagangkan" must mean to be a real gate

"Ada pool" is **not** evidence of anything, and on Uniswap v4 it is not even a pair:

* **A v4 pool is a tuple, not a pair.** The pool id is `keccak(currency0, currency1, fee, tickSpacing,
  hooks)`. Anyone can create *another* pool for the **same** two tokens with a different fee tier,
  tick spacing or hook, put 1 wei in it, and point at it. A gate that only checks "a pool for this
  pair exists" is trivially defeated. The registration must pin the **exact pool key** and the
  canonical PoolManager.
* **v4 core has no oracle.** Uniswap removed the built-in accumulator, so a v4 pool carries **no**
  price history — not even `observe()`. Proof inside this repo: Pons V2's own hook reads the price
  with a single `StateLibrary.getSlot0(poolManager, poolId)` call and keeps no accumulator anywhere
  (`PonsV2MemeHook.sol`, in `docs/pons-reference/pons_src.json`). So "it has traded for months" is
  **not readable on-chain**. Age and average have to be observed *by us* (10.3).
* **A hook cannot be trusted by default.** A hook allowlisted by the timelock (with `address(0)`
  always allowed) is the safe rule: a hook cannot rewrite `slot0`, but the pool's own hook runs
  inside the swap with the PoolManager lock held, and things like `donate` move the price, so an
  unvetted hook can bend the feed. On Robinhood Chain the real pools use a known hook anyway
  (e.g. `PonsV2MemeHook`), so allowlisting costs nothing.

The gate is therefore: **canonical venue + exact pool key + real depth + observed age + our own
average + a trusted anchor feed.** Everything below is fail-safe in the existing sense: if any piece
is missing, the asset is simply *not battle-eligible* — trading, fees and graduation are untouched.

### 10.2 Two rails — this is what removes the need to "apply"

| Rail | Who gets in | What it unlocks | Checks |
|---|---|---|---|
| **Rail 1 — listing (trade-only)** | Anyone, immediately | Launch, trade, graduate on the curve, creator fees, refunds | Code exists, `decimals()` 6–36 (already enforced), **transfer probe** (§5.3), `checkEconomics` with derived economics (10.4) |
| **Rail 2 — `battleEligible`** | Unlocked **automatically**, by the chain, no application and no vote | The $100k timer may start; the token can be booked into a battle | All of 10.3 |

A token launched against a Rail-1-only asset behaves exactly like today's non-evaluable asset:
never eligible, 15% competition share drains to the treasury after `PENDING_EXPIRY`
(`QualyraCompetitionVault.sol:296-301`), and nothing is ever stuck.

### 10.3 The Rail 2 gate (all conditions, all on-chain, all automatic)

1. **Canonical venue.** The registered source is a pool on the factory's configured
   `poolManager` (the v4 singleton; `deployments/46630.json → external.poolManager`). The full
   `PoolKey` is stored, not just the two tokens.
2. **Exact key.** `{currency0, currency1}` are exactly `{asset, anchor}` in the canonical order;
   `fee`/`tickSpacing` are a standard tier pair; `hooks` is `address(0)` or on the timelock's
   allowlist. No substitutes.
3. **Trusted anchor.** The other side is **ETH or USDG**, both of which already have Chainlink USD
   feeds wired (`deployments/4663.feeds.json`). One hop only: `asset → anchor → USD`.
4. **Real depth.** The pool's in-range liquidity, valued at its current price, is at least
   `MIN_POOL_DEPTH_USD`. **Do not measure this with `balanceOf(pool)`** — in v4 every pool's tokens
   sit in the PoolManager, so that returns the *whole venue*. Use
   `StateLibrary.getLiquidity(poolId)` + `getSlot0` and value it (`≈ 2 × L·√P`).
5. **Observed age.** `firstSeenAt[asset]` is written when the registration transaction itself proves
   the pool exists with depth ≥ floor (that is an attestation by the chain, not by us). Rail 2 needs
   `firstSeenAt` older than `MIN_SOURCE_AGE` **and** a keeper re-check at least once per day that
   never saw depth below the floor. A gap restarts the clock — that is what makes "established"
   mean something without any oracle history to read.
6. **Our own average is ready.** A `ForeignPoolOracle` keeps the same 30-minute windowed sum the
   Qualyra hook already uses (`QualyraHook._observe`, `:365`), fed by **permissionless pokes**
   (`pokeSource(asset)`), so a foreign pool gets a genuine time-weighted price with no new trust
   assumption. Ready = a full previous window has elapsed. Below-threshold pokes simply don't count.
7. **Anchor freshness.** Chainlink heartbeat + sequencer gate, already implemented
   (`QualyraOracle.evaluateUsdPrice`).

**Losing Rail 2 later** (depth collapses, pool goes quiet, feed goes stale) flips `battleEligible`
back to false **for future bookings only** — a token already booked or live keeps its battle, so
nothing can be retroactively disqualified by an oracle hiccup.

**Kill switch stays.** `disableQuoteAsset` (exists) plus `forceBattleIneligible(asset)` for the
guardian, both timelock/guardian-scoped, because permissionless + money always needs a breaker.

### 10.4 Economics are derived, not chosen

The creator does not type `phantomQuote`/`graduationThreshold` numbers; they give a **USD graduation
target** and the factory converts it into asset units with the verified source price, then runs the
existing `checkEconomics` (`QualyraGraduationExecutor.sol:108`):

* shape stays in the shipped 0.40 ratio band (e.g. 0.2–1.0), so every pair is comparable;
* the target is bounded in USD (`MIN_GRADUATION_USD … MAX_GRADUATION_USD`, e.g. $2k … $250k) — this
  keeps the pool that opens after graduation deep enough that its market cap is not a two-click
  push, which also protects the Trader League share (30% of the competition split) from cheap fake
  volume;
* register-and-pump is pointless: to have a source worth trusting the attacker must *lock* real
  value in a pool that anyone can arbitrage, and the fixed-supply Qualyra token still has to earn
  $100k on its own pool.

### 10.5 Venue adapters (only what is needed, in this order)

| Venue | Historical price available? | Design |
|---|---|---|
| **Uniswap v4** (Qualyra, Pons V2 — Robinhood Chain today) | No | Our own windowed accumulator + permissionless pokes (§10.3.6) |
| Uniswap **v3** | Yes — `observe()`, a real built-in TWAP | Adapter: `OracleLibrary.consult(pool, 1800)` — no extra storage |
| Uniswap **v2** | Yes — cumulative price accumulators | Adapter: `price0/1CumulativeLast` + `blockTimestampLast` |

Only add the v3/v2 adapters if such a pool actually needs to be a source; a tiny interface in the
style of `AggregatorV3Interface` is enough (no new dependency). **Not verified from this sandbox:
the mainnet RPC is blocked here, so the canonical PoolManager on 4663, the exact PONS pool key and
the venue used by Long.xyz still have to be confirmed on chain before coding (§10.6 step 0).**

### 10.6 Phases (replaces phases 4–5 of §8)

| Phase | Scope | Gate to move on |
|---|---|---|
| **0** | Verifikasi on-chain (PoolManager 4663, PONS pool key + liquidity, Long.xyz venue) + fix `frontend/lib/pricing.ts:40` (`$1` fallback for unknown symbols) | Facts recorded in `deployments/4663.feeds.json` |
| **1** | Interim listing through the existing `setQuoteAsset` with one real feed-backed asset; prove launch → trade → graduate → book → battle end to end with a second pair asset | A real multi-asset battle on testnet |
| **2** | `registerQuoteAsset` (Rail 1, permissionless, no governance) + `battleEligible[asset]` + `forceBattleIneligible` + spec §2.2 wording for pool-derived sources | Full `forge test` + a Rail-1-only asset that never becomes eligible |
| **3** | `ForeignPoolOracle` + v4 source verification (key/tier/hook allowlist) + depth + observed age + automatic Rail 2 unlock + indexer `PriceProvider` path + keeper `pokeSource` | Attack tests: fake pool key, thin pool, hook swap, stale feed — all must fail to unlock |

### 10.7 Residual risks specific to M4 (adds to §7)

| # | Risk | Answer |
|---|---|---|
| R8 | Attacker creates a **second pool** for the same pair and registers it | Exact `PoolKey` + tier/tick-spacing pinning + hook allowlist; depth floor means the fake pool must hold real money |
| R9 | Source pool liquidity is **pulled** right after unlock | Keeper re-check + depth floor at every poke; a drop re-locks Rail 2 for future bookings |
| R10 | **Quiet pool**: no swaps, so the average never advances | Pokes advance the window (a poke is a price read, not a trade), so a quiet pool still has an average — and the same `pokeEligibility` keeper already handles the vault side |
| R11 | Asset is **rebasing / fee-on-transfer** | Transfer probe at registration + `disableQuoteAsset` |
| R12 | The quote asset's own price **falls**, DQ'ing honest tokens | Already true today whenever the quote is volatile; the UI must show the pair's contribution to MC, and the depth floor keeps the rate honest rather than cheap to bend |

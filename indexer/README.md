# Qualyra Deterministic Indexer

> ℹ️ **Scope note (design update):** Under the revised design (`docs/FEE-AND-BATTLE-SPEC.md`),
> **battle eligibility (MC ≥ $100k USD) is decided ON-CHAIN via Chainlink — NOT by this indexer.**
> The indexer's role is battle scoring, **Trader League scoring** (qualified volume, weekly winners) and the
> deterministic `datasetHash`/`resultHash` commitments. It does **not** gate who may enter a battle.
> Battle outcomes follow `docs/FEE-AND-BATTLE-SPEC.md`: a win sends the whole pot to the winner's buyback &
> burn. A token disqualified after its booking (30 minutes below the threshold on the pool's average price)
> loses; when both are, the first to drop loses and two drops dated to the same second void the battle. The
> vault records that and only accepts the outcome it forces, so the indexer reads the record and commits that
> outcome (`src/disqualification.ts`). On a draw or a
> void each token's own contribution buys back and burns that token (never a 50/50 split, never the Trader League).

An offline-reproducible indexer that reads Qualyra events from the Robinhood
Chain testnet (chainId `46630`) and produces **deterministic** battle results and
weekly leaderboards, plus the `datasetHash` / `resultHash` values that back the
on-chain `proposeBattleResult` / `proposeWeeklyWinners` commitments.

Given the same chain data, the same config, and the same params, the tool emits
**identical canonical bytes** and therefore **identical keccak256 hashes** on any
machine. This is enforced by an offline determinism test.

## 0. Deploy-driven config — auto, no manual `set`

Every address/block the indexer needs is derived from **one** file:
`deployments/<chainId>.json` (repo root), regenerated from the Foundry broadcast by:

```
cd indexer && npm run gen-deployments
```

So the **only** thing to do after any (re)deploy is re-run that command — nothing
in `config.ts` is hand-edited, and there is no per-run `set` to remember.

```
Foundry broadcast (contracts/broadcast/*/46630/run-latest.json)
        │  npm run gen-deployments   (scripts/gen-deployments.mjs)
        ▼
deployments/46630.json   ← SINGLE SOURCE OF TRUTH
        │  read at import time by src/config.ts
        ▼
indexer picks up  factory · swapRouter · poolManager · hook · … · usdg · ethUsdgPool · deployBlock
```

**What is now automatic (previously error-prone `set`s):**

| Value | Before | Now |
|-------|--------|-----|
| Scan floor | `set INDEXER_START_BLOCK=<block>` (too-high silently drops trades) | **auto** → `DEPLOY_BLOCK` = the factory `deployBlock` from the deployments file. Nothing platform-related (TokenLaunched / Bought / Sold / Swapped) can exist before the factory, so it is a provably-safe, tight, fast floor. |
| Testnet USDG address | `set INDEXER_USDG_ADDRESS=0x…` | **auto** → `deployments.contracts.usdg` (recorded by `gen-deployments` from the `DeployTestnetUsdgPool` broadcast). |
| ETH/USDG pool key (fee/tickSpacing/hooks) | hard-coded | **auto** → `deployments.ethUsdgPool` (falls back to `3000 / 60 / 0`). |

**Redeploy safety.** After a redeploy the `deployBlock` and `usdg` values move; because
they are read from the regenerated file, a stale value can no longer go unnoticed.
`INDEXER_START_BLOCK` still works as an **optional speed override** for a very large
history — and even then it is safe: **curve→token and creator discovery are decoupled
and ALWAYS scan from `DEPLOY_BLOCK`** (see `cli.ts`), so a too-high override can never
again silently drop a token's trades. `START_BLOCK` is **not** part of
`configSnapshot()`, so changing it never affects the hashes.

## Production operations (end-to-end weekly flow)

The whole point of the indexer is a **trust-minimized** loop: compute off-chain →
commit a hash on-chain → let anyone re-verify. For that loop to close, the
operator (commit) and the public (verify) must recompute **byte-identical**
hashes. Two rules make this hold in production.

**Rule 1 — always run on-chain (never `constant` in production).**
`INDEXER_PRICE_MODE` defaults to `onchain`, which reads ETH/USD from the
ETH/USDG v4 pool. `constant` exists **only** for offline/CI tests and must never
be used to commit — mixing modes produces different `datasetHash` values.

**Rule 2 — the per-week block is pinned deterministically (not `latest`).**
`resolveWeekToBlock(week)` computes the highest block whose timestamp is strictly
before `weekEnd(week)` via binary search, and `resolveWeekFromBlock(week)` the
first block at or after `weekStart(week)`. Both `index-week` (commit) and
`verify-commit week` (verify) scan exactly that window, so a week ranks only its
own trades, and they pin the on-chain price at the identical block. This is what
makes the committed `datasetHash` reproducible forever. Battles work the same
way over `[startTime, startTime + 24h)` (`src/window.ts`).

### Recommended production environment (chain 46630)

Chain `46630` is an **Arbitrum Orbit (Nitro)** L2 — single sequencer, ~`0.23s`
block time. The L2 can only reorg if its parent chain (Ethereum) reorgs or the
sequencer feed shifts, so a week-end pin is only truly immutable once the batch
carrying `weekEnd` reaches L1 **safe / finalized** (~12–15 min). Set the operator
env accordingly:

```
INDEXER_PRICE_MODE=onchain          # default; never `constant` for a commit
INDEXER_RPC_URL=<endpoint serving historical logs + headers>
INDEXER_CONFIRMATIONS=4000          # ~15.6 min @ 0.23s/block, >= L1 `safe` window
# leave INDEXER_START_BLOCK and INDEXER_PRICE_BLOCK UNSET (defaults are the safe path)
```

- **`INDEXER_CONFIRMATIONS=4000`** (~15–16 min) is the key production knob: a
  week is only flagged `CLOSED` once `weekEnd` is buried under that many blocks,
  so a shallow reorg near the boundary cannot shift the committed `toBlock`.
  Conservative alternative: `5000` (~20 min); do not go below ~`3100` (~12 min).
- It is a **commit-timing guardrail, not a hash input** — it is not in
  `configSnapshot()`, and for a week that closed a while ago the resolved
  `toBlock` (hence the hash) is identical for **any** value, so operator and
  verifier need not use the same number.
- If operator policy already commits **>= ~1 h after `weekEnd`**, `weekEnd` is
  buried by ~15k+ blocks and `0` is effectively safe — but keep the value set as
  an automatic guardrail.

### Weekly steps

```
# Once, after any (re)deploy
npm run gen-deployments

# The operator service (below) does all of this on its own. By hand:
# When a week has fully closed (see "week CLOSED" in the output below)
npm run index-week -- <week>
#   -> prints datasetHash + resultHash and writes out/week-<week>.*.json
#   -> operator submits: proposeWeeklyWinners(week, winners, datasetHash, resultHash)

# Anyone, during the challenge period (LEAGUE = 48h)
npm run verify-commit -- week <week>
#   MATCH    -> the commitment reproduces the public data; safe to finalize
#   MISMATCH -> guardian should VETO within the challenge window
```

### Commit only CLOSED weeks

`index-week` reports the week state on the `blocks:` line:

- **`week CLOSED -> reproducible / safe to commit`** — the week has fully
  elapsed; `toBlock` is a fixed historical block. Safe to commit.
- **`week OPEN -> PROVISIONAL, do not commit yet`** — the week is still running;
  `toBlock` tracks the moving chain tip, so the hash will change. Do **not**
  commit yet; re-run after the week closes.

### Pre-deploy weeks are refused

A `week` that ends at or before the factory `DEPLOY_BLOCK` has zero indexable
activity (the platform did not exist yet). `resolveWeekToBlock` flags it as
`predatesDeploy`, and:

- `index-week <week>` **refuses** it (exits non-zero) instead of committing an
  empty leaderboard, and
- `verifyWeek(week)` **throws** rather than "verifying" an empty result.

Pick a week at or after the deploy week.

### RPC requirement (logs + historical headers, NOT archive state)

The on-chain price is derived from the ETH/USDG pool's **event logs** (the last
`Swap` / `Initialize` at or before the pinned block), **not** from historical
`slot0` state — so **no archive node is required**. The RPC (`INDEXER_RPC_URL`)
must, however, serve **historical logs and block headers** across
`[DEPLOY_BLOCK, weekEnd]`, because `resolveWeekToBlock` binary-searches block
timestamps and the price scan reads past logs. `INDEXER_LOG_PAGE_SIZE` only
tunes pagination and does **not** affect the resulting hashes.

**Resilience (built in).** Every `getBlock` / `getLogs` call is wrapped
(`src/rpc.ts`) so a public / rate-limited RPC does not fail a long scan for
reasons unrelated to determinism:

- Transient failures (HTTP 429 / 5xx, timeouts, dropped sockets) are retried
  with exponential backoff — `INDEXER_RPC_RETRIES` (default `4`) and
  `INDEXER_RPC_BACKOFF_MS` (default `250`).
- A "block range too large / too many results" response **auto-splits** the
  window in half and retries each half, so a large `INDEXER_LOG_PAGE_SIZE` (or a
  dense range) is safe on any RPC. This never changes which logs are returned,
  so the `datasetHash` is unaffected.

**Reorg safety.** Set `INDEXER_CONFIRMATIONS` (default `0`) to a depth `>=` the
chain's practical finality in production: a week is only reported `CLOSED` once
`weekEnd` is buried under that many blocks, so a shallow reorg near `weekEnd`
cannot shift the committed `toBlock` after the fact.

**Fail-fast.** `index-week` / `index-battle` resolve the on-chain price basis
**before** the long trade scan, so a misconfigured / uninitialized ETH/USDG pool
fails in seconds instead of after minutes of scanning.

### Debug-only price override (unsafe)

`INDEXER_PRICE_BLOCK` pins the price read to a specific block. It is **ignored**
unless `INDEXER_ALLOW_UNSAFE_PRICE_BLOCK=1` is also set, because a hand-picked
price block that a verifier does not also set makes an honest commitment
MISMATCH. When honored it prints a loud `NON-REPRODUCIBLE … MUST NOT be
committed` warning. Use it only for local debugging — never to commit.

### Consistency checklist (all parties)

| Knob | Production value | Why |
|------|------------------|-----|
| `INDEXER_PRICE_MODE` | `onchain` | `constant` yields a different `datasetHash` |
| price / scan block | pinned via `resolveWeekToBlock` (never `latest`) | reproducible bytes |
| RPC | archive-capable | historical price read at the pinned block |
| week state | `CLOSED` before commit | `OPEN` hashes still move |
| `INDEXER_CONFIRMATIONS` | `>=` finality depth (prod) | a reorg near `weekEnd` can't shift `toBlock` |
| `INDEXER_START_BLOCK` | unset | no longer read by `index-*` / `verify-commit`: every window starts at its own first block |
| `INDEXER_PRICE_BLOCK` | unset | debug-only; needs the unsafe flag; breaks reproducibility |

## Operator service

`src/operator/` runs the recurring on-chain work, so nobody has to click anything: battles are booked for
00:00 UTC, results and weekly winners are posted from this indexer, and everything permissionless (finalizing,
buyback tranches, sweeps) is sent as soon as it is due. Every rule runs on chain time, never the host clock.

### Wallets and roles

| Role | Held by | Can |
|------|---------|-----|
| Admin | 48h timelock behind the Admin Safe | `setOperator`, `setGuardian`, `startLeague`, `unpause`, configuration |
| Guardian | Guardian Safe (2-of-3) | veto a posted result inside its challenge window, cancel a booked battle before it starts, pause |
| Operator | `OPERATOR_PRIVATE_KEY`, hot wallet run by this service | book battles, post battle results and weekly winners |
| Keeper | `KEEPER_PRIVATE_KEY`, hot wallet with no role anywhere | pay for finalizing, buyback tranches, sweeps and expiry releases |

The operator key can't move funds: the worst it can do is post a wrong result or a bad booking, which the guardian
vetoes or cancels. The keeper key has no rights at all. Keep only gas money in both, keep them in the host's secret
store (or an untracked `indexer/.env`), never in the repo and never behind a `NEXT_PUBLIC_` name; the service refuses
to start if it finds a key there. Point the vault at the operator wallet once, through the timelock:
`setOperator(<operator address>)`.

### What runs when

| Duty | Wallet | When |
|------|--------|------|
| Book ready tokens for the coming 00:00 UTC, neighbours by market cap on the same pair asset, skipping any token whose market cap is below $100k right now | operator | from `OPERATOR_BOOKING_HOUR_UTC` (18:00) |
| Post a battle's result (the vault's disqualification record decides first) | operator | when its 24 hours are over and buried under `INDEXER_CONFIRMATIONS` |
| Post a league week's winners | operator | when the week is over (Monday 00:00 UTC) and buried |
| Finalize a battle; its first buyback tranche runs in the same transaction | keeper | 24h after the result is posted |
| Run the remaining buyback tranches | keeper | every 30 minutes until the pot is spent |
| Run the eligibility check (`pokeEligibility`) of a token in a drop below $100k, booked or live, or bookable while booking is open | keeper | once it has gone `OPERATOR_POKE_QUIET_SECONDS` (600) without a swap, at most that often |
| Finalize a league week, which opens the claims | keeper | 48h after the winners are posted |
| Sweep the fees the pool hook holds; release expired pending pots | keeper | daily at `OPERATOR_SWEEP_AT_UTC` (23:40) |
| Recompute posted results; alert on a mismatch or a duty running late | none | every pass |

Alerts go to the log and, when `ALERT_WEBHOOK_URL` is set, to a Slack or Discord webhook. On a mismatch the guardian
vetoes the result. A vetoed result is not posted again automatically: check the dataset, fix the cause, then post it
by hand from the `index-battle` / `index-week` output.

### Running it

```
cp .env.example .env                  # fill in both keys and the webhook
npm run operate -- --dry-run --once   # plan and simulate one pass, send nothing
npm run operate                       # operator + keeper + watcher, every OPERATOR_POLL_SECONDS
npm run keeper                        # keeper duties only
npm run watch                         # watcher only, no key; worth running on a second machine too
```

The service keeps a small state file, `out/operator-state.json`, with what it already did or reported; deleting it
is safe. Every result it posts is also written to `out/` like the CLI writes it, so anyone can diff it against their
own `verify-commit` run.

## Layout

```
indexer/
  package.json            ESM package, dep: viem ^2.56.5, Node >=18
  tsconfig.json
  connected-wallets.json  v1 connected-wallet denylist (array of addresses)
  .gitignore              ignores node_modules/, out/ and .env
  .env.example            settings of the operator service
  src/
    config.ts             chain, addresses, price basis, QV params, week/score constants
    types.ts              NormalizedTrade + CreatorMap types
    abi/index.ts          ABIs re-exported from ../../contracts/abi + typed event fragments
    ingest.ts             viem client, paginated getLogs, deterministic trade ordering
    qualifiedVolume.ts    per-wallet QV (USD micro), unique buyers, exclusion filters
    score.ts              BigInt 70/30 battle scoring + Outcome mapping
    leaderboard.ts        global weekly leaderboard + week math
    canonical.ts          canonical JSON encoder + keccak256 hash
    build.ts              network-free pipeline assembly (dataset/result/hashes)
    window.ts             block windows of battles and weeks, from block timestamps
    disqualification.ts   the outcome the vault's disqualification record forces
    jobs.ts               one battle or week end to end, shared by CLI, verifier and service
    outputs.ts            writes the canonical dataset / result / hashes to out/
    cli.ts                index-battle / index-week / verify-commit commands
    verify.ts             recompute a posted commitment and compare
    operator/             the operator service (env, chain reads, plan, passes, alerts, state)
  test/
    determinism.test.mjs  OFFLINE determinism + correctness + snapshot test
```

## 1. Qualified Volume (QV) filter rules — as implemented (v1, open)

QV is computed per wallet, normalized to USD, using **integer/BigInt math only**
(micro-USD units, `1e6`). No JS float ever enters the QV total or the canonical
form. All parameters live in `config.ts` (`QV_PARAMS`) and are env-overridable.

**Trades in scope — both markets.** Curve trades (`Bought`/`Sold`, emitted per
token by its `BondingCurve`) *and* pool trades after graduation (`Swapped`, emitted
by the periphery `SwapRouter`). Neither event carries a pair asset, so it is
resolved from the token's `TokenLaunched` record: by emitting curve for the curve
market, by token for the pool market (a token's pair asset never changes at
graduation). A token with no launch record is skipped — never priced by guess.
Regression test: `test/ingestNormalize.test.mjs`.

Rules applied, in order:

1. **Minimum USD per trade** (`minTradeUsd`, default `$1.00`, env
   `INDEXER_MIN_TRADE_USD`): trades whose USD notional is below the threshold are
   dropped.
2. **Round-trip netting** (`netRoundTrips`, default `true`, env
   `INDEXER_NET_ROUNDTRIPS`): a wallet's sell notional on a token nets against its
   buy notional on that token before QV is computed; QV floors at 0. With netting
   off, only buy-side notional contributes.
3. **Per-token creator exclusion**: a token's creator wallet (from
   `TokenLaunched.creator`) is excluded for that token.
4. **Connected-wallet denylist** (`connected-wallets.json`, env
   `INDEXER_DENYLIST_PATH`): explicitly listed wallets are excluded.
5. **Buyback-contract exclusion**: purchases originating from `buybackBurner` are
   excluded.
6. **Wash / circular / coordinated volume**: v1 relies on the explicit denylist.
   Automated Sybil / connected-wallet clustering is **future work** (see §3).

Unique qualifying buyers per token = distinct buy-side wallets whose net QV on
that token is `> 0` after the filters above.

USD normalization:
```
usdMicro(trade) = notionalQuote * priceUsdMicro(quoteAsset) / 10**decimals
```

## 2. Price-basis assumption & configuration

USD reference prices are a **documented, reproducible config constant — NOT a live
oracle**:

| Asset | Basis | Configure via |
|-------|-------|---------------|
| USDG  | pinned `$1.00` | (fixed) |
| ETH   | default const  | `INDEXER_PRICE_ETH_USD` |
| NVDA  | default const  | `INDEXER_PRICE_NVDA_USD` |
| AAPL  | default const  | `INDEXER_PRICE_AAPL_USD` |
| SPY   | default const  | `INDEXER_PRICE_SPY_USD` |

> **On-chain vs constant (default mode).** In the default `onchain` price mode
> (§2.1) **ETH and USDG are read from the ETH/USDG v4 pool** (ETH from the pool's
> last `Swap` / `Initialize`; USDG pinned at `$1`); **NVDA / AAPL / SPY have no
> pool yet, so they always use the constants above**. The `INDEXER_PRICE_ETH_USD`
> override only takes effect in `constant` mode — but every asset's resolved
> basis is frozen into the dataset either way, so commit and verify agree.

To reproduce a run exactly, pin every price with the env vars above. The chosen
values are embedded (as integers, folded into micro-USD at compute time) into the
dataset `config` snapshot, so the hash reflects the exact basis used.

### 2.1 Price mode — on-chain is the DEFAULT (event-based, no archive node)

By default the ETH/USD basis is read from the on-chain Uniswap-v4 **ETH/USDG**
pool — the **same code path on testnet `46630` and mainnet `4663`**, no chain
branch. The pool key is built from the **auto-derived** USDG address and
`ethUsdgPool` params (§0), so a normal run needs **no price env at all**:

```
node --experimental-strip-types src/cli.ts index-week 2960
```

**How the price is read (LOGS, not historical STATE).** The `sqrtPriceX96` is
taken from the pool's **events**, not from `slot0` state:

- the indexer picks the **last `Swap` event** whose block is `<=` the pinned
  upper-bound block (the week-end block), and
- falls back to the pool's **`Initialize` event** when it has never been swapped.

Both v4 events carry `sqrtPriceX96` in their payload. This matters because
**non-archive RPCs do not serve historical `slot0` state** (`extsload` at a past
block returns *"historical state … is not available"*), but they **do** retain
and index **logs**. Reading logs therefore reproduces the identical price on any
ordinary node — so the public verifier needs **no archive RPC**. The backward
window scan always takes the global **max `(blockNumber, logIndex)`** at/below the
pin, so the result is **independent of the getLogs page size** → operator and
verifier resolve byte-identical values. The resolved micro-USD numbers are frozen
into the dataset `priceBasis` so the `datasetHash` reproduces. USDG stays the `$1`
numeraire; assets without their own pool fall back to the documented constants above.

The `priceBasis.source` records exactly which event was used, e.g.
`onchain-ethusdg-v4-swap@upto:<pinBlock>|at:<block>.<logIndex>|pool:<poolId>|sqrtPriceX96:<value>`
(or `…-v4-init@…` for the Initialize fallback).

**OPEN vs CLOSED weeks.** `index-week` pins BOTH the trades and the price to the
same block:

- **Open week** (still in progress) → price pinned at the chain **tip**; the run
  is flagged **`PROVISIONAL — do not commit yet`**.
- **Closed week** (fully elapsed) → price pinned at the deterministic **week-end
  block** → the run is **reproducible** and safe to commit on-chain.

To force the offline, no-RPC **constant** basis (e.g. CI or a machine without an
RPC), set `INDEXER_PRICE_MODE=constant`.

## 3. Exclusion list & Sybil note

v1 exclusions = **per-token creator** (`TokenLaunched.creator`) +
**connected-wallet denylist** (`connected-wallets.json`) + **buybackBurner**
purchases. Automated Sybil detection / connected-wallet clustering (funding-source
graph analysis) is deliberately **out of scope for v1** and noted as future work;
until then, coordinated wallets must be added to the denylist.

## 4. Canonical + hashing scheme

`canonical.ts` implements a strict canonical JSON encoding:

- Object keys sorted ascending (JS default UTF-16 order).
- Arrays kept in the order provided (callers pre-order; trades are sorted by
  `(blockNumber, transactionIndex, logIndex)`).
- `bigint` and integer `number` → **decimal strings** (no `0x`, no exponent).
- **JS floats are rejected** (the encoder throws) — all numerics are integers.
- Standard JSON escaping for strings; `true` / `false` / `null` literals.
- No insignificant whitespace.

Hashing:
```
datasetHash = keccak256(toBytes(canonical(DATASET)))
resultHash  = keccak256(toBytes(canonical(RESULT)))   // via viem
```

Shapes:
```
DATASET       = { config, params, trades: [orderedFilteredTrades] }
RESULT battle = { battleId, outcome, scoreA, scoreB }
RESULT week   = { week, winners, ranking }
```

### Battle scoring (score.ts)

```
SCORE_SCALE = 1e18, DRAW_MARGIN = 1e16 (1%)
qvShareX_scaled    = qvX     * 1e18 / qvTotal        (0 if total 0)
buyerShareX_scaled = buyersX * 1e18 / buyersTotal    (0 if total 0)
scoreX = roundHalfUp( 7*qvShareX_scaled + 3*buyerShareX_scaled , 10 )
```
`roundHalfUp(n, d) = (n + d/2) / d` (integer). Each score is in `[0, 1e18]`.

Outcome:
```
WinnerA iff scoreA >= scoreB + 1e16
WinnerB iff scoreB >= scoreA + 1e16
else Draw
Enum: None=0, WinnerA=1, WinnerB=2, Draw=3, DisqualifiedA=4, DisqualifiedB=5, Void=6
```

### Week math (leaderboard.ts)

```
WEEK = 604800, WEEK_SHIFT = 259200  (Monday 00:00 UTC aligned)
weekIndex = floor((unixTs + 259200) / 604800)
weekStart = week*604800 - 259200
weekEnd   = (week+1)*604800 - 259200
```
Ranking: wallets by USD QV descending, tie-break by wallet address ascending.
`winners` = top-5 addresses, zero-address padded to length 5 (the `address[5]` that `proposeWeeklyWinners` takes).

## 5. Reproduction from public chain data

> **No fragile `set` needed.** The scan floor and testnet USDG address are
> auto-derived from `deployments/<chainId>.json` (§0) — you never pass
> `INDEXER_START_BLOCK` or `INDEXER_USDG_ADDRESS`. On-chain pricing is the
> **default** (§2.1); pass `INDEXER_PRICE_MODE=constant` only for an offline,
> no-RPC run. After a (re)deploy, run `npm run gen-deployments` once and every
> value refreshes automatically.

1. `cd indexer && npm install`
2. (Optional) pin prices & params:
   `INDEXER_PRICE_ETH_USD=... INDEXER_PRICE_NVDA_USD=... INDEXER_MIN_TRADE_USD=1`
3. Set RPC if needed: `INDEXER_RPC_URL=https://rpc.testnet.chain.robinhood.com`
4. Battle: `node src/cli.ts index-battle <battleId>` (tokens and window read from the vault), or
   `node src/cli.ts index-battle <battleId> <tokenA> <tokenB> <fromBlock> <toBlock>` to replay a given range
5. Week: `node src/cli.ts index-week <week>`
6. Outputs land in `indexer/out/`:
   `*.dataset.json`, `*.result.json`, `*.hashes.json`; both hashes are printed.
7. Re-running with the same inputs yields byte-identical files and identical
   hashes.

## 6. Mapping printed hashes to on-chain commitments

The two printed hashes map **directly** to the contract commitment args:

```
proposeBattleResult(battleId, outcome, scoreA, scoreB, datasetHash, resultHash)
                                                        ^^^^^^^^^^^  ^^^^^^^^^^
proposeWeeklyWinners(week, winners[5], datasetHash, resultHash)
                                       ^^^^^^^^^^^  ^^^^^^^^^^
```

- `datasetHash` = keccak256 of the canonical DATASET.
- `resultHash`  = keccak256 of the canonical RESULT.
- Both are non-zero (the contract reverts `MissingCommitment` on zero), and the
  `outcome` / `scoreA` / `scoreB` (battle) or `winners` (week) printed by the CLI
  are the exact values to pass alongside the hashes.

For the full operator loop end-to-end (confirm the week is CLOSED → prove the
hashes reproduce → `proposeWeeklyWinners` → public `verify-commit` → **MATCH**
within the challenge window), follow the step-by-step checklist:
[`docs/PRODUCTION-DRESS-REHEARSAL.md`](../docs/PRODUCTION-DRESS-REHEARSAL.md).

## Testing

```
npm test
```
Runs nine suites offline (no network):

- `test/determinism.test.mjs` — asserts identical canonical bytes and identical
  keccak256 hashes across two runs, verifies a hard-coded snapshot hash (drift
  detection), and checks exclusions and the draw/winner margin logic.
- `test/verify.test.mjs` — exercises `compareCommitment` (faithful operator →
  MATCH; tampered result / manipulated dataset → MISMATCH).
- `test/weekBlock.test.mjs` — exercises `resolveWeekToBlock` against a **fake
  block client** (no RPC): OPEN week → `closed:false` at the tip; CLOSED week →
  `closed:true` at the exact last block before `weekEnd` (reproducible as the
  tip grows); the `weekEnd`-exclusive boundary; and the **pre-deploy guard**
  (a week ending at/before `DEPLOY_BLOCK` → `predatesDeploy`, never a
  committable closed week). It also covers the reorg `INDEXER_CONFIRMATIONS`
  buffer and `checkScanFloor` (a bad `INDEXER_START_BLOCK` → warning/fatal).
- `test/onchainPrice.test.mjs` — exercises the **event-based**
  `OnchainPriceProvider` against a **fake `getLogs` client** (no RPC): it asserts
  the exact BigInt price math (a known `sqrtPriceX96` → `$2659.999999`),
  deterministic **last-event** selection that is **independent of page size**,
  that events after the pin block are ignored, the `Initialize` fallback, and a
  loud throw when the pool has no events.
- `test/rpc.test.mjs` — exercises the **resilient RPC layer** (`src/rpc.ts`)
  against fake clients (no RPC): transient errors (429 / 5xx / timeouts) are
  retried with backoff while non-transient errors are not, and a "range too
  large" response auto-splits the window and returns **all** logs exactly once
  (page-size independent, hash-neutral).
- `test/window.test.mjs` — battle and week block windows on a fake chain that packs
  several blocks into each second: exact first and last blocks, open vs closed,
  the confirmation buffer, and a week that began before the deploy.
- `test/disqualification.test.mjs` — how `buildBattle` commits the outcome the
  vault's disqualification record forces (`forcedOutcomeOf`) without touching the
  scores or the dataset. The rule itself is tested in the contracts' suite.
- `test/operatorPlan.test.mjs` — what the service finds due: results, finalizing,
  tranches per token, league weeks, 00:00 UTC starts, pairing by market cap, the
  daily sweep.
- `test/operatorService.test.mjs` — one full pass against a fake chain: the exact
  transactions the keeper and the operator send, the vetoed result left alone,
  and a dry run that sends nothing.

To (re)capture the determinism snapshot after an intentional change:
`UPDATE_SNAPSHOT=1 npm test`, then paste the printed hashes into `SNAPSHOT`.

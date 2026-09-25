# Qualyra — Public Result Verification

Qualyra's competition results (token **Battles** and the weekly **Trader League**
leaderboard) are computed off-chain from public on-chain data, then **committed
on-chain** so that **anyone can independently reproduce and check them**. You do
not have to trust the operator — you can verify.

This is the design the concept document already calls for:

> *"Aliran uang berjalan otomatis on-chain. Hanya filter dan ranking yang
> dihitung di luar chain, lalu hasilnya dicatat on-chain dan bisa dicek publik
> sebelum hadiah cair."*

## Trust model (optimistic + open recompute)

1. The operator runs the **deterministic indexer** (`/indexer`) over public chain
   data and obtains a `datasetHash` (commitment to the exact inputs used) and a
   `resultHash` (commitment to the exact outcome/leaderboard).
2. The operator calls, on-chain:
   - `proposeBattleResult(battleId, outcome, scoreA, scoreB, datasetHash, resultHash)`
   - `proposeWeeklyWinners(week, winners, datasetHash, resultHash)`
   Both hashes **must be non-zero** — the contract reverts `MissingCommitment`
   otherwise, so a result can never be proposed without a commitment.
3. A **challenge period** runs before funds move:
   - Battle: `BATTLE_CHALLENGE_PERIOD` = **24 h**
   - Trader League: `LEAGUE_CHALLENGE_PERIOD` = **48 h**
4. **Anyone** re-runs the indexer, recomputes both hashes, and compares them to
   the on-chain commitment (see below). If they do **not** match, the **guardian
   vetoes** during the challenge period. On veto, the stored hashes are reset to
   zero and the operator must re-commit.

The hashes commit to *exactly* the values that go on-chain, so a `MATCH` proves
the operator did not manipulate the outcome; a `MISMATCH` is a public,
objective red flag.

> Note: this is optimistic verification (commit + open recompute + veto). It is
> intentionally the "do it now, cheaply" layer. A future upgrade can add a
> cryptographic (ZK) proof so the operator need not be trusted at all — the
> indexer is already designed to be reproducible so that upgrade is additive.

## The open Qualified Volume (QV) filter rules

Winner score for a Battle:

```
score = 70% * share(Qualified Volume) + 30% * share(unique qualifying buyers)
share(X for token) = X(token) / ( X(tokenA) + X(tokenB) )
```

A lead of **less than 1 percentage point** is recorded as a **Draw**
(`DRAW_MARGIN = 1e16`, `SCORE_SCALE = 1e18`).

Trader League: one **global** weekly leaderboard across **all** Qualyra tokens
(not per token), ranked by USD-normalized Qualified Volume; top-5 split
**40 / 30 / 15 / 10 / 5**. Weeks are aligned to **Monday 00:00 UTC** using the same math
as the contract (`WEEK = 604800`, `WEEK_SHIFT = 259200`).

Qualified Volume filters implemented by the indexer (all parameters live in
`indexer/src/config.ts` so a reproduction pins the exact values):

- **Minimum USD per trade** — dust trades below the configured minimum are dropped.
- **Creator exclusion** — a token's own creator wallet (from the Factory
  `TokenLaunched` event) is excluded for that token.
- **Connected-wallet denylist** — addresses in `indexer/connected-wallets.json`
  are excluded (v1). Automated Sybil / connected-wallet clustering is a
  documented **future refinement**, not yet automated.
- **Buyback exclusion** — purchases originating from the buyback/burn contract
  are excluded.
- Trader identity is taken from the router-level event (`Swapped.payer` /
  `Bought.payer` / `Sold.seller`) because the pool hook only sees the router.

## USD price basis — on-chain by default, reproducible without an archive node

Normalizing volume to USD requires an ETH/USD basis. By **default** this is read
from the on-chain Uniswap-v4 **ETH/USDG** pool (same code path on testnet `46630`
and mainnet `4663`); `USDG` is the pinned `$1` numeraire.

**Read from LOGS, not historical state.** The `sqrtPriceX96` is taken from the
pool's **events** — the last `Swap` at/below the pinned week-end block, falling
back to the pool's `Initialize` event if it was never swapped. This is the key to
trust-minimized verification: ordinary (non-archive) RPCs **cannot** serve
historical `slot0` state, but they **do** retain logs, so any verifier reproduces
the identical price on a normal node — **no archive RPC required**. The backward
scan takes the global max `(blockNumber, logIndex)` ≤ the pin, so the resolved
value is **independent of the getLogs page size** → operator and verifier agree
byte-for-byte. The resolved micro-USD numbers are frozen into the dataset's
`priceBasis` (part of the `datasetHash`), and `priceBasis.source` records exactly
which event was used.

**Open vs closed weeks.** `index-week` pins trades **and** price to the same
block: an **open** week prices at the chain tip and is flagged
`PROVISIONAL — do not commit yet`; a **closed** week prices at the deterministic
week-end block and is reproducible/safe to commit.

**Offline / constant fallback.** For CI or a machine with no RPC, set
`INDEXER_PRICE_MODE=constant` to use a documented constant map instead. `USDG`
stays `$1`; the rest are configurable via environment variables (defaults in
`config.ts`):

| Asset | Env var                 | Default |
|-------|-------------------------|---------|
| ETH   | `INDEXER_PRICE_ETH_USD` | 3000    |
| NVDA  | `INDEXER_PRICE_NVDA_USD`| 120     |
| AAPL  | `INDEXER_PRICE_AAPL_USD`| 210     |
| SPY   | `INDEXER_PRICE_SPY_USD` | 550     |

To reproduce a specific commitment, set these to the **same values the operator
used** (the values are captured in the dataset's `config` snapshot, which is part
of the `datasetHash`).

## Canonical serialization + hashing

Both hashes are `keccak256` of a **canonical** JSON encoding (see
`indexer/src/canonical.ts`):

- object keys sorted recursively,
- `bigint` / integers serialized as **decimal strings** (never JS floats),
- stable array ordering (trades sorted by `blockNumber`, then `txIndex`, then
  `logIndex`),
- no insignificant whitespace.

```
datasetHash = keccak256(utf8Bytes(canonical(DATASET)))
resultHash  = keccak256(utf8Bytes(canonical(RESULT)))
```

- `DATASET = { config, params, trades[] }` — pins the exact inputs + config.
- `RESULT` (battle) = `{ battleId, outcome, scoreA, scoreB }` — the exact on-chain args.
- `RESULT` (week) = `{ week, winners[3], ranking[] }` — the winners are the on-chain args.

## Reproduce & verify — step by step

Prerequisites: Node ≥ 18, then `cd indexer && npm install`.

### Offline sanity check (no network)

```bash
cd indexer
npm test        # determinism + verification-logic tests must pass
```

This proves the pipeline is deterministic (same input → identical canonical
bytes → identical hashes), that the comparison detects tampering, and — via
`onchainPrice.test.mjs` — that the event-based ETH/USDG price resolves the exact
expected micro-USD value and is independent of RPC pagination.

> **No archive node needed.** On-chain verification reads the price from the
> pool's **logs** (last `Swap` ≤ the week-end block, else `Initialize`), which
> ordinary RPCs retain — so `INDEXER_RPC_URL` can point at the public endpoint
> `https://rpc.testnet.chain.robinhood.com`. Only **closed** weeks are
> reproducible/committable; an open week prints `PROVISIONAL — do not commit yet`.

### Verify a Battle against its on-chain commitment

```bash
cd indexer
# reads the committed hashes on-chain, recomputes locally, prints MATCH/MISMATCH
npm run verify-commit -- battle <battleId> <tokenA> <tokenB> <fromBlock> <toBlock>
```

### Verify a weekly Trader League commitment

```bash
cd indexer
npm run verify-commit -- week <week>
```

A `MATCH` means the operator committed to exactly the public dataset + result
this indexer reproduces. A `MISMATCH` exits non-zero and should be escalated to
the guardian to **veto** within the challenge period.

### Recompute hashes from scratch (operator's view)

```bash
cd indexer
npm run index-battle -- <battleId> <tokenA> <tokenB> <fromBlock> <toBlock>
npm run index-week   -- <week>
```

These write `indexer/out/*.dataset.json`, `*.result.json`, `*.hashes.json` and
print `datasetHash` / `resultHash` — the exact values to pass to
`proposeBattleResult` / `proposeWeeklyWinners`.

### Production dress rehearsal (CLOSED week → commit → verify → MATCH)

For the full end-to-end operator loop — confirm the week is CLOSED, prove the
hashes reproduce before committing, call `proposeWeeklyWinners`, then have anyone
run `verify-commit` and observe **MATCH** within the challenge window — follow the
step-by-step checklist: [`PRODUCTION-DRESS-REHEARSAL.md`](./PRODUCTION-DRESS-REHEARSAL.md).

## Mapping to the on-chain commitment

| Off-chain (indexer output) | On-chain argument |
|----------------------------|-------------------|
| `datasetHash`              | `datasetHash` in `proposeBattleResult` / `proposeWeeklyWinners` |
| `resultHash`               | `resultHash` in the same call |
| battle `outcome/scoreA/scoreB` | same-named args (also bound inside `resultHash`) |
| week `winners[3]`          | `winners` arg (also bound inside `resultHash`) |

Read the committed hashes back on-chain via `getBattle(battleId)` /
`getWeekResult(week)` (both structs now carry `datasetHash` and `resultHash`), or
from the `BattleResultProposed` / `WeeklyWinnersProposed` events, which now
include both hashes.

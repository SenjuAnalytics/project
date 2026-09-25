# Qualyra — Production Dress Rehearsal (CLOSED-week commit → verify → MATCH)

The end-to-end rehearsal to run **once week `2960` has fully elapsed** (its window
closes ~6 days after the pool went live). It exercises the real production loop:

> `index-week` (CLOSED) → `proposeWeeklyWinners` on-chain → public `verify-commit` → **MATCH**

Everything the indexer does is **off-chain, read-only** — no contract redeploy is
required (audited: factory / competitionVault / poolManager are live and
`getWeekResult` / `proposeWeeklyWinners` already exist on the deployed vault).

---

## 0. Reference facts (chain 46630)

| Item | Value |
| --- | --- |
| RPC (public, non-archive OK) | `https://rpc.testnet.chain.robinhood.com` |
| Factory | `0xD4b09E6Fc567769E4EEb1e2bd2Ca04950584610c` |
| CompetitionVault | `0xfAC6D5ebf4992713b86f2375D39C68F52D522850` |
| PoolManager (v4) | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |
| ETH/USDG poolId | `0x1466e64802414ec5a67a905f05aaf3c137ea2ecabfbb3ea5902568073b575c55` |
| Week under test | `2960` |
| Expected winner #1 (proven live) | `0xe4fe0dfc18f90c455a8981bfd7d794a7a70a2786` |
| League challenge period | **48 h** (`LEAGUE_CHALLENGE_PERIOD`) |

> **Do not start** until `index-week 2960` prints `week CLOSED -> reproducible`.
> While it prints `week OPEN -> PROVISIONAL, do not commit yet`, the week has not
> closed — abort and wait.

---

## 1. Pre-flight (offline, no chain writes)

- [ ] **Deploy config is current.** `cd indexer && npm run gen-deployments`, then
      confirm `deployments/46630.json` still shows factory `0xD4b09E6F…`,
      competitionVault `0xfAC6D5eb…`, and `ethUsdgPool` `fee 3000 / tickSpacing 60 / hooks 0x0`.
- [ ] **All tests green.** `cd indexer && npm test` → **22/22 pass** (determinism,
      verify, event-price, week-block PROVISIONAL/CLOSED).
- [ ] **RPC reachable.** `set INDEXER_RPC_URL=https://rpc.testnet.chain.robinhood.com`
      (or leave default). No archive node needed — price is read from logs.

---

## 2. Confirm the week is CLOSED

- [ ] Run the indexer for the week:

  ```bash
  cd indexer
  npm run index-week -- 2960
  ```

- [ ] The `toBlock:` line reads **`week CLOSED -> reproducible / safe to commit`**.
      (If it reads `week OPEN -> PROVISIONAL, do not commit yet` → **STOP**, wait.)
- [ ] Note the printed **`winners`**, **`datasetHash`**, **`resultHash`**.
- [ ] Sanity: winner #1 == `0xe4fe0dfc…a2786` and `priceBasis.source` starts with
      `onchain-ethusdg-v4-swap@upto:` (or `-init@` if never swapped).

---

## 3. Prove reproducibility BEFORE committing (still off-chain)

- [ ] Re-run `npm run index-week -- 2960` a second time (independent run).
- [ ] Confirm **byte-identical** `datasetHash` **and** `resultHash` across both runs.
      Compare the two `out/week-2960.hashes.json` (e.g. save a copy, diff).
      - If they differ → **DO NOT COMMIT**; investigate (RPC returning inconsistent
        logs, wrong pin, or a non-closed week). Reproducibility is the whole point.
- [ ] (Optional) Have a second machine/operator reproduce the same two hashes to
      simulate the public verifier path ahead of time.

---

## 4. Commit the result on-chain (state-changing — authorized operator only)

Only the authorized operator key does this. Both hashes MUST be non-zero or the
contract reverts `MissingCommitment`.

- [ ] Call `proposeWeeklyWinners(week, winners, datasetHash, resultHash)` on the
      CompetitionVault `0xfAC6D5eb…`, using the exact values from §2:

  ```bash
  cast send 0xfAC6D5ebf4992713b86f2375D39C68F52D522850 \
    "proposeWeeklyWinners(uint256,address[3],bytes32,bytes32)" \
    2960 \
    "[<winner1>,<winner2>,<winner3>]" \
    <datasetHash> <resultHash> \
    --rpc-url https://rpc.testnet.chain.robinhood.com \
    --account <operatorKey>
  ```

- [ ] Transaction succeeds; note the tx hash and confirm the `WeeklyWinnersProposed`
      event carries the same `datasetHash` / `resultHash`.
- [ ] Read it back: `getWeekResult(2960)` now returns **non-zero** hashes equal to
      the committed values (before commit they are `0x000…0`).

---

## 5. Public verification (anyone, read-only) — expect MATCH

- [ ] From a clean checkout / independent machine, on the public RPC:

  ```bash
  cd indexer
  npm run verify-commit -- week 2960
  ```

- [ ] Output reports **MATCH** (`datasetMatch` ✅ and `resultMatch` ✅) and exits `0`.
      A **MISMATCH** exits non-zero → escalate to the guardian to **veto** within the
      48 h challenge period.
- [ ] Confirm the verifier used a **non-archive** public RPC (proving the log-based
      price path needs no archive node).

---

## 6. Challenge window & payout

- [ ] Start of the **48 h** `LEAGUE_CHALLENGE_PERIOD` is the commit block time.
- [ ] During the window, keep an independent verifier watching; on any MISMATCH the
      guardian vetoes (stored hashes reset to zero → operator must re-commit).
- [ ] After the window with no veto, the payout can settle per the contract flow.

---

## 7. Rollback / abort conditions

- [ ] **Week not closed** (`PROVISIONAL`) → do not commit; wait.
- [ ] **Two runs disagree** on hashes → do not commit; investigate RPC/log
      consistency and the pinned block.
- [ ] **verify-commit returns MISMATCH** → guardian **veto** within 48 h; recompute
      and re-commit only after the discrepancy is understood.
- [ ] **RPC/network error mid-run** → the CLI exits non-zero with a clear message;
      re-run (reads are idempotent; nothing is written on-chain by the indexer).

---

## Notes

- The indexer is **read-only** on-chain; only §4 writes state, and only via the
  operator key. No contract redeploy is involved.
- OPEN weeks are intentionally uncommittable (`PROVISIONAL`); only CLOSED weeks pin
  to a fixed historical block and are reproducible. See
  [`docs/VERIFICATION.md`](./VERIFICATION.md) and
  [`indexer/README.md`](../indexer/README.md) §2.1.
- The same loop applies to Battles via `proposeBattleResult(...)` /
  `verify-commit battle …` (24 h `BATTLE_CHALLENGE_PERIOD`).

# Audit & Fix Notes

Living document tracking the code review of this project — what was found, what
was fixed, and what is still open. Read this before assuming any part of the
system works the way the README or the pitch describes it.

**Last updated:** contracts complete at 124 passing tests, second review merged,
frontend aligned to the contracts, ABIs generated from the build.

> **History:** everything before this line concerned an earlier design built
> around `VaultLaunchpad.sol`, `VaultGuard.sol`, `VaultStaking.sol`,
> `TripleRevenue.sol`, `VaultScore.sol` and `AdaptiveVesting.sol`. That design was
> dropped. Staking was removed on the team's decision and can be added manually
> later if it is ever wanted. Those notes were retired with the contracts they
> described; the current system is the nine platform contracts and two
> per-launch templates listed in the README.

---

## Contracts

### Fixed in the first security review

- **`QualyraHook.sol` — fee charged on the requested amount, not the traded one (HIGH).**
  When the pair asset was the specified currency and the pool stopped early at a
  price limit, the fee was taken on the full requested amount while only part of
  it traded. Swaps that cannot fill completely are now rejected with
  `PartialSwap`, using transient storage to compare the charged fee against what
  actually traded. Routers that pass the full price range are unaffected.
- **`QualyraBuybackBurner.sol` — pots stacking on one token (MEDIUM).**
  A token that won several battles could have all of its pots bought in the same
  block, multiplying the price impact past the per-tranche limit. The tranche
  clock is now tracked per token rather than per pot.
- **`QualyraCompetitionVault.sol` — treasury share lost on late sweeps (LOW).**
  Battle fees swept after a battle ended skipped the treasury half of the
  non-battle split.

### Fixed in the second review

- **Pair asset decimals were never checked.** `setQuoteAsset` took the decimals on
  trust. Listing USDG (6 decimals) with 18-decimal parameters would have
  mispriced the curve by 10^12. It now reads `decimals()` off the token, rejects a
  mismatch, and refuses anything below 6.
- **Snipe window was 5 seconds, not 15.** The figure came from web research rather
  than Pons's source. Verified against their deployed contract:
  `snipeTaxStartBps = 9_900`, `snipeTaxSeconds = 15`, `MAX_SNIPE_TAX_SECONDS = 60`.
- **Deploy script had no pre-flight.** It now checks that the PoolManager has code,
  that USDG reports 6 decimals, that the CREATE2 deployer and the listed stock
  tokens exist, and on chain 4663 that the PoolManager and USDG match their
  canonical addresses byte for byte. It also asserts the ownership hand-off is
  aimed at the timelock.
- **No deploy rehearsal.** `DeployQualyraForkTest` dry-runs the whole deploy against
  a Robinhood Chain fork. Skipped unless `ROBINHOOD_RPC_URL` is set, so the
  default `forge test` stays offline.

### Deliberate trade-offs, not defects

- **Buyback price cap is 5%, above the point where sandwiching pays.** The burner's
  swaps are exempt from the 1% pool fee while a trader pays it on both legs, so any
  cap above roughly **2.1%** leaves room to buy ahead of a tranche and sell after
  it. Measured: at a 2.00% cap the attacker loses at every position size; at 2.25%
  they profit even with 0.03 ETH. 5% was chosen anyway, because a 1% cap left the
  buyback invisible and stretched a 20 ETH pot over 7.3 days, versus 35 hours at
  5%. The cap never changes how much of a pot is spent or burned — unspent
  remainder stays in the pot — only how fast. `QualyraAttacks.t.sol` pins both
  sides of the threshold rather than asserting the attack away.
- **Four tranches, not ten.** With a 5% cap the tranche count only matters for small
  pots, where 4 tranches move 4.6% each over 2 hours instead of 2.3% over 4.5 hours.

### Known, not yet addressed

- No independent audit. The two reviews above were internal.
- ~~No testnet run.~~ **Basi:** sistem sudah live di testnet 46630 (lihat `docs/FEE-AND-BATTLE-SPEC.md`).
  Fork dry run tetap butuh RPC endpoint agar berguna.
- Dependency versions are pinned in the README but not enforced in CI.
- No runbook for a stock split or redenomination of a listed stock token.
- GOOGL, GME, SPCX and SGOV are deliberately not listed at deploy. Their addresses
  and economics are recorded in the deploy script for a later timelock listing.

---

## Frontend

### Headline finding: the UI promised a protection system that does not exist

The frontend implemented an entire subsystem with no contract behind it —
roughly 250 references across 19 files. Removed and replaced with what the
contracts actually do:

- **Creator "Dev Allocation" milestone claims.** The portfolio page had working
  buttons that credited the creator 150,000 and 250,000 tokens at "$25k MC" and
  "$50k MC" milestones, persisted in `localStorage`. The contracts give creators
  **zero** token allocation — the entire supply goes to the curve. A creator using
  this would have watched their balance grow and believed they were owed tokens.
  Replaced with the real earnings path: 70% of the trading fee plus the creator
  tax, accruing per pair asset in the fee vault, withdrawable at any time.
- **Shield Escrow.** A 20–60% escrow slider, "KPI-gated unlock", 30/60/90/120-day
  checkpoints, proportional escrow redemption and a `VaultGuard.sol` reference.
  None of it exists. The slider now sets the creator tax (0–5%), which is a real
  launch parameter.
- **LP burn vs lock.** Five different claims for one mechanic: "100% LP burn is
  mandatory", "10% LP Burn & Shield Escrow Lock", "10-year lock", "Final 50% LP
  10-Yr Lock", "25% LP Timelocked". The truth is one sentence: 100% of the
  graduation liquidity is owned by `QualyraLiquidityLocker`, which has no function
  to remove it, with no unlock date.
- **Community voter payouts.** The battle simulator split a pot 60/30/10 between
  winner, voters and an LP burn. The whole pot goes to buyback and burn. Voting is
  kept as a sentiment feature and now says plainly that it does not pay out and
  does not decide the result.
- **False assurance badges.** "● ACTIVE & AUDITED", "● 100% AUDITED" and
  "100% Protected" were removed. No audit has happened.

### Fixed: `lib/contracts.ts` did not match the real contracts at all

It declared `QualyraLaunchpad`, `QualyraBattle`, `QualyraShield` and
`QualyraTreasury` with hand-written ABIs built around `projectId` and
`escrowPct` — none of which exist in any contract. Nothing in the app imported
it, so it had never failed loudly. Replaced with ABIs generated from the Foundry
build (`scripts/sync-abi.mjs`), a per-chain address registry with environment
overrides, and an `isDeployed()` guard so the UI can say "not deployed" instead
of calling the zero address. (Kontrak kini sudah live di testnet 46630 — lihat `docs/FEE-AND-BATTLE-SPEC.md`.)

### Still solid

`lib/wagmi.ts`'s chain config — chain ID 4663 mainnet, 46630 testnet, RPC URLs,
explorer — checks out against Robinhood Chain's public docs. This was accurate
before the rewrite and still is.

### Not yet reviewed

`app/stocks/page.tsx` beyond its escrow references, `components/trade/*` beyond
the two files touched here, `lib/storage.ts`'s simulated trading engine, and
whether the mock data in `lib/data.ts` should survive at all once the contracts
are deployed and real reads replace it.

---

## Open questions for the project owner

- The frontend still runs on simulated data in `lib/data.ts` and `lib/storage.ts`.
  Is that a deliberate demo mode to keep until deployment, or should it be swapped
  for live chain reads as soon as the contracts land on testnet?
- The Trader League needs an off-chain indexer to score wallets, and the platform
  needs a keeper for sweeps, finalizations and buyback tranches. Neither exists in
  this repo yet. Who is building them, and does `startLeague()` wait on the
  indexer being ready?
- Battle eligibility (market cap, holder count, history) is checked off-chain
  before scheduling. Those rules are not written down anywhere in this repo.

> **Update (source of truth: `docs/FEE-AND-BATTLE-SPEC.md`).** Beberapa catatan di atas kini basi:
> eligibility satu-satunya = MC ≥ $100k USD, dicek **ON-CHAIN via Chainlink** tiap trade (bukan off-chain,
> syarat holder/history dibuang); battle outcomes — menang → 100% pot → buyback & burn pemenang; keduanya
> gugur → yang gugur duluan kalah, satunya menang (selalu ada pemenang, **bukan void**); draw & void → tiap
> token dapat kembali kontribusinya sendiri → buyback & burn token itu (**bukan 50/50, bukan Trader League**);
> dan sistem sudah **live di testnet 46630** (tidak lagi "not deployed"). Lihat spec untuk detail.

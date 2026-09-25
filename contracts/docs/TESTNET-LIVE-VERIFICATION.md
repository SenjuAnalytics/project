# Qualyra — Testnet-Live Verification (Robinhood Chain, chain 46630)

On-chain verification of the live Qualyra deployment on **Robinhood Chain Testnet**
(chainId **46630 / 0xB626**, RPC `https://rpc.testnet.chain.robinhood.com`).

All checks below were run **read-only** via JSON-RPC (`eth_call` / `eth_getCode`) against the
deployed contracts, cross-checked with the contract source in `src/`. No private keys were used
for verification; state-changing steps (launch / buy / sell) were executed by the project wallets
with `cast send`.

- **Deployed (current):** 2026-09-21 — **redeployed** with deployer `qualyra_deployer2` to ship the **verifiable-results commit-hash feature** — `datasetHash`/`resultHash` added to `proposeBattleResult` and `proposeWeeklyWinners` (revert `MissingCommitment` if zero) — plus the **Batch-1 lint fixes** (`QualyraLaunchDeployer` constructor zero-check reverting `ZeroFactory`; `QualyraCompetitionVault` new `FeesReceived(address indexed asset, uint256 amount)` event in `_receive`). See the new §10. Contracts are non-upgradeable so a fresh deploy was required. Earliest factory deploy block `122327405`, total gas paid **0.000204 ETH** — `ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`.
- **Status:** ✅ Platform re-deployed & fully wired (9 singletons + `initialize` + `setQuoteAsset(ETH)` + `transferOwnership(timelock)`). ✨ **New:** verifiable results are now enforced on-chain — `proposeBattleResult`/`proposeWeeklyWinners` require non-zero `datasetHash`/`resultHash` commitments and revert `MissingCommitment` otherwise (§10). ✅ Batch-1 lint fixes applied (LaunchDeployer constructor zero-check `ZeroFactory`; CompetitionVault `FeesReceived` event). ✅ The periphery `QualyraSwapRouter` has been redeployed against the new factory at `0x68a0B2567fD2F435d49b27229B46f47e2bD2A0B8` (block 122331513) — it is deployed separately from `DeployQualyra.s.sol` — and wired into `frontend/lib/contracts.ts`, so graduated-pool trading is enabled. ⏳ The lifecycle & fee-split proofs in §3–§5 are **pending re-verification** on this fresh deployment — no tokens launched here yet.

> **Deployment history (chain 46630).** Contracts are non-upgradeable, so every feature change requires a fresh deployment. The active factory is always the most recent row.
>
> | Date | Factory | Change |
> | --- | --- | --- |
> | 2026-09-21 | `0xD4b09E6Fc567769E4EEb1e2bd2Ca04950584610c` | **current** — adds on-chain verifiable-results commitments (datasetHash/resultHash, revert MissingCommitment on §-verify) + Batch-1 lint fixes (LaunchDeployer zero-check, CompetitionVault FeesReceived event) (§10) |
> | 2026-09-19 | `0x492E786d10178a4B622C5103F71A7e68889e10Df` | superseded — fixes automatic graduation: completing buy reverts on insufficient gas so graduation runs atomically (§9); retains on-chain `metadataURI` (§8) |
> | 2026-09-19 | `0x6A97ed143bEb6076cD331c3cdf9c65479b58D429` | superseded — added on-chain `metadataURI` on every launch token (§8) |
> | 2026-09-18 | `0xA35c98aC5a328a2e3A5aFB02c105b4867A567b0a` | superseded — first redeploy under `qualyra_deployer2` |
> | (earlier) | `0x247b9BBBdAefd6A56b30316BB391377aF3b1A7bA` | superseded — original deployment where §3–§5 lifecycle proofs were run |

---

## 1. Platform contracts (singletons — deployed once)

All addresses were read directly from the factory getters (`hook()`, `feeVault()`, etc.).

> Addresses below are the **current** deployment (factory `0xD4b09E6F…`, 2026-09-21). Each was read
> from the deploy return log; getters (`factory.hook()`, `factory.feeVault()`, …) return the same values.

| Contract | Address | Deploy tx | Block |
| --- | --- | --- | --- |
| `QualyraFactory` | `0xD4b09E6Fc567769E4EEb1e2bd2Ca04950584610c` | — | 122327405 |
| `QualyraLaunchDeployer` | `0xB55aEf20698A6AA09223c915BD48579cB146F235` | — | 122327422 |
| `QualyraFeeVault` | `0xcc2cFce2f0875680f4102D747f6c9a90964A641E` | — | 122327435 |
| `QualyraCompetitionVault` | `0xfAC6D5ebf4992713b86f2375D39C68F52D522850` | — | 122327449 |
| `QualyraGraduationExecutor` | `0x86553165c8D986c63E07513d36D7e572eA2aA6e2` | — | 122327453 |
| `QualyraLiquidityLocker` | `0x7891417ee1a979A22DD0C357b8991cBE43D3E7E9` | — | 122327470 |
| `QualyraBuybackBurner` | `0x320E3DA0d639C302070aD5d34909a14CFEcbaaF8` | — | 122327480 |
| `QualyraLaunchRouter` | `0x9Ed736580Fe5d927e12372FFefa4e0CBC6078985` | — | 122327487 |
| `QualyraHook` | `0x48f5b1aD2F6624222D53ADD2Afe4a4da9Da1E8cC` | — | 122327494 |

Post-deploy wiring txs on the factory (2026-09-21 deploy, all in the same broadcast right after the 9 singletons, from block `122327494`): `initialize(...)`, `setQuoteAsset(ETH, 0.0032e18, 0.008e18, 18)`, `transferOwnership(timelock)` — all ✅ (`ONCHAIN EXECUTION COMPLETE & SUCCESSFUL`, 12/12 txs OK, total gas 0.000204 ETH).

Per-launch contracts (`QualyraLaunchToken`, `QualyraBondingCurve`) are deployed with each token — see §4.

### External & governance

| Role | Address | Notes |
| --- | --- | --- |
| Uniswap v4 `PoolManager` | `0x8366a39CC670B4001A1121B8F6A443A643e40951` | external; verified has bytecode |
| Factory `owner()` (current) | `qualyra_deployer2` | temporary deployer/owner on the 2026-09-21 redeploy, until the timelock accepts ownership |
| Timelock (`pendingOwner`) | `0x9bc884c527bed77fad3e0dafc501a12617d18382` | ⚠️ handoff **initiated, not yet accepted** — timelock must call `acceptOwnership()` (Ownable2Step) |

---

## 2. Fee model (from `src`, verified on-chain)

Constants: `BPS = 10_000`, `TRADE_FEE_BPS = 100` (**1%**), snipe tax starts at **99%** and decays over the snipe window.

- **Launch fee — 0.0005 ETH (always ETH):** split **50% treasury / 50% Trader League** (`QualyraFeeVault.collectLaunchFee`).
- **Trading fee — 1% of every trade (pair asset):** split **70% creator / 15% platform / 15% competition**, locked per token at launch (`QualyraFeeVault.collectFees`):
  - `creatorAmount   = tradeFee * creatorShareBps   / 10000`
  - `competitionAmount = tradeFee * competitionShareBps / 10000`
  - `platformAmount  = tradeFee - creatorAmount - competitionAmount`
- **Competition share (no active battle):** the 15% is halved → **7.5% Trader League + 7.5% treasury**.
- **Creator tax:** optional, chosen at launch (0% for the test tokens here).
- Balances are **pull, never push** — creator & treasury withdraw their own funds.

---

## 3. Lifecycle verification (previous deployment — re-verification pending)

> ⚠️ The results in §3–§5 were verified on the **superseded** deployment (old factory `0x247b9BBBdAefd6A56b30316BB391377aF3b1A7bA`). Re-run them on the current deployment once a token is launched.

### 3.1 Launch → Trading
`launchAndBuy(...)` via the router mints the fixed **1,000,000,000** supply to the bonding curve; the
curve opens in phase **Trading (0)**. Launch fee event `LaunchFeeCollected` shows **2 × 0.00025 ETH**
(treasury + Trader League) — the 50/50 launch-fee split. ✅

### 3.2 Buy (below threshold)
A trader buy stays in phase Trading; the trade fee is exactly **1%** of the amount in, routed to the
FeeVault, with no creator/snipe tax (creator tax 0, snipe window elapsed). ✅

### 3.3 Overshoot + refund
A buy **above** the graduation target does **not** revert — the curve only consumes what it needs to
reach the threshold and **refunds the excess** to the buyer. Verified: sending 0.01 ETH used ~0.006 ETH
and refunded ~0.004 ETH, ending `quoteReserve()` at exactly the **0.008 ETH** threshold. ✅

### 3.4 Graduation
With enough gas, the auto-graduate branch runs in the same buy tx: `phase()` → **2 (Graduated)**,
`quoteReserve()` → **0** (funds moved to the pool), `factory.isGraduated(token)` → **true**. ✅

### 3.5 Permanent liquidity lock — verified 2 ways
- **On-chain state:** `liquidityLocker.positionOf(UTST)` returns a live position owned by the locker:
  `poolId = 0x5d17a1ab…09616`, `tickLower = -887220`, `tickUpper = 264720`,
  **`liquidity = 1,787,851,678,127,664,…` (> 0)**. The locker and the v4 PoolManager both have bytecode.
- **No withdraw path:** the deployed `QualyraLiquidityLocker` bytecode exposes **only 5 selectors** —
  `lockLiquidity` (`0x0c8fe0e7`, add-only), `unlockCallback` (`0x91dd7346`), `factory` (`0xc45a0155`),
  `poolManager` (`0xdc4c90d3`), `positionOf` (`0xfd2d39c5`). There is **no** `removeLiquidity` /
  `withdraw` / `collect` / `decreaseLiquidity`. The only `modifyLiquidity` call uses a **positive**
  `liquidityDelta` (add). Source comment confirms: _"There is no function to remove or move liquidity,
  so the position stays in the pool forever."_ ✅

---

## 4. Test tokens launched (previous deployment)

| Token | Symbol | Token address | Bonding curve | State |
| --- | --- | --- | --- | --- |
| TestnetRocket | TRK | `0xc9d0e0dd7dc55f580e7d3a7c88d6e0d3a6191d1e` | `0x9d67a40e14526c075056eeaaab3511a4167377ec` | Graduated |
| UserTest | UTST | `0x5f29c7bd212b5db48541ff88b4175a406897f939` | `0xb4103fbd1238155fcd838072868d7412191bab0b` | Graduated |
| SellTest | SELL | `0x4da0d7bd048025b6795a343110bdc6dbab78887a` | `0x5cab7f6c63b601a58d19ef0311aaef22da87609e` | Trading (fresh) |

Wallets used: **creator** `0x37C7D7B715fE2f2bE2E2573d63F2AD71B943813c`, **trader** `0x8ff56deb425e829343b82a10fc4ed7fcbd51015c`.

---

## 5. Fee-split verification — worked example (UTST, previous deployment)

**Configured split** — `factory.getLaunch(UTST)`:

| Field | On-chain | Value |
| --- | --- | --- |
| `creatorShareBps` | `0x1b58` | **7000 = 70%** |
| `platformShareBps` | `0x05dc` | **1500 = 15%** |
| `competitionShareBps` | `0x05dc` | **1500 = 15%** |
| `creatorTaxBps` | `0x00` | 0% |
| `snipeStartBps` | `0x26ac` | 9900 = 99% |
| `snipeWindow` | `0x0f` | 15 s |
| `graduated` | `0x01` | true |

**Actual fees collected** (two buys: 0.002 ETH + 0.01 ETH):
total trade fee = `20,000,000,000,000` + `60,808,080,808,081` = **80,808,080,808,081 wei** (≈ 0.0000808 ETH).

| Share | Formula | Expected (wei) | On-chain | Match |
| --- | --- | --- | --- | --- |
| Creator 70% | `fee × 7000 / 10000` | 56,565,656,565,656 | `creatorBalance[UTST][ETH]` = **56,565,656,565,656** | ✅ exact |
| Competition 15% | `fee × 1500 / 10000` | 12,121,212,121,212 | → ½ Trader League + ½ treasury | ✅ |
| Platform 15% | remainder | 12,121,212,121,212 | → treasury | ✅ |

**Vault reconciliation (aggregate ETH across all tokens):**
- `treasuryBalance[ETH]` = **786,363,636,363,640 wei** = 3 × launch-fee treasury (0.00025 each: TRK+UTST+SellTest) + 2 × trading treasury share (18,181,818,181,818 each: TRK+UTST) = 786,363,636,363,636 wei ✅ (±rounding).
- `accounted[ETH]` = **899,494,949,503,144 wei** = all creator balances + treasury still held; Trader-League portions were already forwarded to the CompetitionVault.

**Conclusion:** the fee split matches the configured percentages **exactly, to the wei**. ✅

---

## 6. How to reproduce (function selectors)

Each check is an `eth_call` to the address above with the 4-byte selector (+ ABI-encoded args), or
`eth_getCode` for bytecode presence. The Postman collection
`postman/collections/Robinhood Chain - Testnet-Live Verification (chain 46630)` automates the sanity checks.

| Signature | Selector | Target |
| --- | --- | --- |
| `phase()` | `0xb1c9fe6e` | bonding curve |
| `quoteReserve()` | `0x9da771f4` | bonding curve |
| `curveOf(address)` | `0x05adc47e` | factory |
| `isQualyraToken(address)` | `0x45f5bc1f` | factory |
| `isGraduated(address)` | `0x68a4c8b7` | factory |
| `getLaunch(address)` | `0xb3964f23` | factory |
| `launchFee()` | `0xcf3cf573` | factory |
| `owner()` | `0x8da5cb5b` | factory |
| `feeVault()` | `0x478222c2` | factory |
| `hook()` | `0x7f5a7c7b` | factory |
| `competitionVault()` | `0x3df6a7e2` | factory |
| `buybackBurner()` | `0x82d14fd9` | factory |
| `graduationExecutor()` | `0xcc6d7a39` | factory |
| `liquidityLocker()` | `0x9759164a` | factory |
| `launchRouter()` | `0x523925bf` | factory |
| `positionOf(address)` | `0xfd2d39c5` | liquidity locker |
| `creatorBalance(address,address)` | `0x67c2d1fd` | fee vault |
| `treasuryBalance(address)` | `0x54445ae6` | fee vault |
| `accounted(address)` | `0xee1a56ce` | fee vault |
| `balanceOf(address)` | `0x70a08231` | launch token (ERC-20) |
| `metadataURI()` | `0x03ee438c` | launch token (off-chain metadata pointer) |

---

## 7. Open items

- [ ] Timelock to call `acceptOwnership()` on the factory (finalize governance handoff).
- [ ] Fill `usdg_testnet` in the Postman collection and verify `USDG.decimals() == 6`.
- [ ] Exercise a swap on a **graduated** v4 pool to verify `QualyraHook` charges the trading fee + creator tax.
- [ ] Launch a token on the **current** deployment (`0x492E786d…`) and re-run the full lifecycle + fee-split verification (§3–§5), including reading `metadataURI()` on the new token (§8).
- [x] **Redeploy to activate on-chain token metadata** — **done 2026-09-19.** The current factory `0x6A97ed14…` ships `QualyraLaunchToken` with an on-chain `metadataURI` (§8). Every token launched from this factory now exposes `metadataURI()` (selector `0x03ee438c`).
- [ ] Update the Postman collection variable `qualyra_factory` to the **current** deployment (`0x492E786d10178a4B622C5103F71A7e68889e10Df`) — ⚠️ collection is now doubly stale (still points at `0xA35c98aC…`).
- [x] **Redeploy the periphery QualyraSwapRouter** — done 2026-09-19. Deployed at `0xdb1697CebCa427ed88F8432fAD312B87512dB307` (tx `0x51a987fb…c8bae84`, block 121823354) via `script/DeploySwapRouter.s.sol` against the new factory `0x492E786d…`; verified `swapRouter.factory()` = `0x492E786d…10Df` and wired into `frontend/lib/contracts.ts` (`swapRouter`). Graduated-pool buy/sell is now enabled.
- [x] **Fix automatic graduation** — done 2026-09-19 (§9). Completing-buy now graduates atomically; no manual `graduate()` needed. `forge test`: 124 passed / 0 failed.

---

## 8. On-chain token metadata (`metadataURI`) — new in the 2026-09-19 deployment

### 8.1 What changed & why
Launchpads let a creator attach a **logo + social links** to their token. The industry-standard way
to do this (pump.fun, Metaplex, token lists) is to store **one short URI string on-chain** that points
to an off-chain **JSON metadata document**; the JSON holds the logo image URL and all social links.
The image file itself is **never** stored on-chain (that would be prohibitively expensive — an image is
tens of KB to several MB of gas).

Previously (before this feature) `QualyraLaunchToken` was a bare ERC-20 with no metadata: the factory received a
`metadataURI` in `LaunchParams` but only **emitted it in the `TokenLaunched` event** — it was not stored,
so it could not be read back with `eth_call`. This deployment fixes that: the URI is now **persisted on
the token** and readable by anyone.

### 8.2 Contract change (`src/QualyraLaunchToken.sol`)
```solidity
/// @dev `metadataURI` is a single off-chain pointer (e.g. `ipfs://...`) to a JSON document holding the
///      logo image and social links. Only the pointer lives on-chain, matching the standard launchpad
///      pattern (pump.fun / Metaplex): contract stores the URI, the JSON + image stay off-chain.
contract QualyraLaunchToken is ERC20Burnable {
    /// @notice Off-chain metadata pointer (JSON with image + socials). Set once at deployment.
    string public metadataURI;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        address holder,
        uint256 supply
    ) ERC20(name_, symbol_) {
        metadataURI = metadataURI_;
        _mint(holder, supply);
    }
}
```
The URI now flows end-to-end: `LaunchParams.metadataURI` → `QualyraFactory.launchTokenFor` →
`QualyraLaunchDeployer` (`params.name, params.symbol, params.metadataURI, …`) → token constructor →
stored in `string public metadataURI` (auto-generated getter, selector `0x03ee438c`). It is set once at
deployment and never mutated. The `TokenLaunched` event still carries `metadataURI` too, so indexers get
it without an extra call.

### 8.3 How the data is layered (nothing but a pointer is on-chain)
```
QualyraLaunchToken.metadataURI   →  "ipfs://Qm…"   (on-chain: ~1 short string)
        │
        ▼
JSON metadata document (off-chain, IPFS/Arweave):
    { "name", "symbol", "description",
      "image":   "ipfs://…/logo.png",   ← logo
      "twitter", "telegram", "website" } ← socials
        │
        ▼
image file (off-chain: IPFS/Arweave/CDN)   ← the actual PNG/JPG
```
**Compression/resize of a large uploaded image is a frontend/backend concern, not the contract's** —
the contract never sees the image and imposes no size limit. The website resizes/uploads the image and
JSON off-chain, then passes the resulting URI to `launch`.

### 8.4 Gas note vs. Pons (the reference platform)
Both Qualyra and Pons keep the image off-chain — only text is stored on-chain. The difference is *how
much* text:
- **Pons** stores **7 separate on-chain strings** per launch (`logo`, `description` up to 2048 bytes,
  `twitter`, `telegram`, `discord`, `website`, `farcaster`) — every launch pays storage gas for all of them.
- **Qualyra** stores **one** `metadataURI` string; logo + every social lives inside the off-chain JSON it
  points to. Fewer storage writes per launch → cheaper, and it matches the pump.fun/Metaplex convention.

### 8.5 How to verify on-chain (after a launch on `0x6A97ed14…`)
`eth_call` the token with selector `0x03ee438c` (`metadataURI()`); the ABI-decoded return is the URI
string. Expected value equals whatever the launch passed (e.g. `ipfs://…`). No token has been launched
on the current factory yet, so this check is **pending a first launch** (see §7).

| Signature | Selector | Target |
| --- | --- | --- |
| `metadataURI()` | `0x03ee438c` | launch token (off-chain metadata pointer) |

### 8.6 Test coverage
`forge test` stays at **124/124 green**. The fork lifecycle test sets `params.metadataURI` on both the
ETH and USDG paths (`test/DeployQualyraFullFlowFork.t.sol`: `"ipfs://fork-eth"` / `"ipfs://fork-usdg"`),
and the local suites (`test/utils/LaunchTestBase.sol`, `SystemTestBase.sol`) launch with
`params.metadataURI = "ipfs://rocket"`, so the field is exercised through the full launch → graduation path.

---

## 9. Automatic graduation fix — new in the (second) 2026-09-19 deployment

### 9.1 Symptom
A token could **fill the bonding curve** (Raised **0.008 / 0.008 ETH**, phase **Completed**) and yet stay
**un-graduated**. In that stuck state, `buy()`, `sell()`, `quoteBuy()` and `quoteSell()` **all revert
`WrongPhase()`** — so buy *and* sell were both dead and the frontend "Receive (est.)" quote just hung. This
was confirmed on-chain for token **TST2** (curve `0x1a5748fb1b7da60d8CB3c07b21c7a0b27E71D9f0`):
`phase()` = **1 (Completed)**, `isGraduated` = **false**, `quoteReserve` = **0.008 ETH**.

### 9.2 Root cause
In `QualyraBondingCurve.buy()`, the **completing-buy** path wrapped auto-graduation in a `try/catch`
**and** treated the `gasleft() < GRADUATION_GAS_BUFFER` branch as a *successful* path that merely emitted
`GraduationDeferred`. Because `eth_estimateGas` searches for the **cheapest non-reverting** execution, it
always picked the **defer branch** → wallets were quoted (and therefore sent) too little gas → graduation
was **systematically skipped for normal wallet buys**. Foundry tests passed only because they send large
gas by default, masking the bug.

### 9.3 Fix (`src/QualyraBondingCurve.sol`)
The low-gas branch now **`revert InsufficientGasForGraduation()`** instead of silently deferring, and
`GRADUATION_GAS_BUFFER` was raised to **900_000** (safely above the measured **~576,340** gas that
graduation actually consumes). Because graduation is now on the **success** path, `eth_estimateGas`
includes pool creation in its estimate, funds it, and graduation happens **atomically in the same
completing buy** — no manual trigger. The `try/catch` is kept **only** as the safety net for an executor
that *genuinely* reverts (the curve then stays safely in **Completed** for the 7-day refund path).

```solidity
// BEFORE — defer branch looked like a success path, so eth_estimateGas always chose it
if (gasleft() < GRADUATION_GAS_BUFFER) {
    emit GraduationDeferred(token);          // ← wallets never sent enough gas
} else {
    try graduationExecutor.graduate(token) { /* ok */ }
    catch { emit GraduationDeferred(token); }
}

// AFTER — low gas now reverts, so estimateGas funds graduation and it runs atomically
if (gasleft() < GRADUATION_GAS_BUFFER) {     // GRADUATION_GAS_BUFFER = 900_000
    revert InsufficientGasForGraduation();   // ← forces estimateGas onto the graduating path
}
try graduationExecutor.graduate(token) { /* graduated atomically in this buy */ }
catch { emit GraduationDeferred(token); }    // safety net only for a genuinely reverting executor
```

### 9.4 Verification
`forge build` OK; `forge test` = **124 tests passed, 0 failed** (up from 115). Coverage includes the new
regression test **`test_completingBuy_revertsWhenUnderfunded`** plus the retained
`test_completingBuy_refundsExcessAndGraduates` and `test_completingBuy_defersGraduationWhenExecutorFails`.
Frontend ABIs were regenerated via `scripts/sync-abi.mjs` (which adds the new
`InsufficientGasForGraduation` error to the client bindings).

### 9.5 Outstanding
**Resolved 2026-09-19.** The periphery `QualyraSwapRouter` has been redeployed against the new factory at
`0xdb1697CebCa427ed88F8432fAD312B87512dB307` (see §7) and wired into `frontend/lib/contracts.ts` (`swapRouter`),
so graduated-pool trading is now **enabled in the frontend**. No items remain outstanding.

---

## 10. Verifiable-results commitments + Batch-1 lint fixes — new in the 2026-09-21 deployment

### 10.1 What changed & why
The `QualyraCompetitionVault` result-proposal path now carries **anti-manipulation commit hashes**.
`proposeBattleResult` and `proposeWeeklyWinners` each gained two new parameters —
`bytes32 datasetHash` and `bytes32 resultHash` — and now **`revert MissingCommitment`** if either is
zero. This binds every proposed battle/weekly-winner result to a committed dataset + computed-result
digest, so a submitted outcome can be independently checked against the data it claims to derive from.
See `docs/VERIFICATION.md` for the full trust model (how the off-chain dataset/result are hashed and how
a third party re-derives and matches these on-chain commitments). Because the contracts are
non-upgradeable, shipping this required a fresh deployment (the 2026-09-21 factory in §1).

### 10.2 Batch-1 genuine lint fixes
Two genuine correctness/lint fixes shipped alongside the feature:
- **`QualyraLaunchDeployer` constructor zero-check** — the constructor now rejects a zero factory
  address, reverting **`ZeroFactory`**, preventing a deployer wired to `address(0)`.
- **`QualyraCompetitionVault` `FeesReceived` event** — a new
  `event FeesReceived(address indexed asset, uint256 amount)` is now emitted in `_receive`, so incoming
  fee transfers into the competition vault are observable on-chain by indexers.

### 10.3 Validation (pre-deploy)
- **`forge test`: 124 tests passed, 0 failed** across **16 test suites**.
- **`forge build`: clean** (no warnings/errors).
- **ABIs re-synced** via `scripts/sync-abi.mjs` — `QualyraCompetitionVault` is now **104 entries** and
  includes the new `FeesReceived` event (and the updated `proposeBattleResult`/`proposeWeeklyWinners`
  signatures + `MissingCommitment` error).
- **Frontend `tsc --noEmit`: 0 errors** against the regenerated bindings.

### 10.4 On-chain verification (post-deploy)
Read-only `eth_call` checks against the new deployment (§1) all matched:
- `competitionVault.factory()` → **new factory** `0xD4b09E6Fc567769E4EEb1e2bd2Ca04950584610c`. ✅
- `competitionVault.operator()` → **`QUALYRA_OPERATOR`** from `.env`. ✅
- `swapRouter.factory()` → **new factory** `0xD4b09E6Fc567769E4EEb1e2bd2Ca04950584610c`. ✅

**SwapRouter redeploy note.** The periphery `QualyraSwapRouter` stores an **immutable** factory address,
so it had to be redeployed to point at the new factory. It was deployed separately via
`script/DeploySwapRouter.s.sol --broadcast` to `0x68a0B2567fD2F435d49b27229B46f47e2bD2A0B8`
(block 122331513, tx `0x3b125c…5494`, cost **0.0000127 ETH**) and wired into
`frontend/lib/contracts.ts`. The main platform deploy (`forge script script/DeployQualyra.s.sol
--broadcast`) completed **ONCHAIN EXECUTION COMPLETE & SUCCESSFUL** (earliest factory block 122327405,
total gas **0.000204 ETH**).

---

## 11. Testnet USDG + ETH/USDG price-reference pool + deploy-driven indexer config — new in the 2026-09-21 session

### 11.1 What & why
So the indexer can read the ETH/USD basis **on-chain** through the *same code path on testnet
(`46630`) and mainnet (`4663`)* — no chain branch — a testnet **USDG mock** and a Uniswap-v4
**ETH/USDG price-reference pool** were deployed via `script/DeployTestnetUsdgPool.s.sol`. In v4,
`initialize` emits an `Initialize` event carrying `sqrtPriceX96` immediately even at zero liquidity,
and each `Swap` event carries the updated `sqrtPriceX96`; the indexer derives the price from these
**events (logs)**, so USDG + `initialize` is the low-gas core (liquidity is single-sided USDG,
cosmetic, `try/catch` so it can never block the deploy).

> The testnet pool price = the ratio we seed (1 ETH = 2660 USDG); it is **not** a live market —
> expected for testnet. What is identical to mainnet is the **on-chain read path**, not the number.

### 11.2 Deployed artifacts (chain 46630)

| Item | Value |
| --- | --- |
| `USDG` (MockERC20, 6 dec) | `0xfd039E717e5f3d2C98332FeebAa1F28ab8961933` (deploy block `122432200`) |
| ETH/USDG v4 poolId | `0x1466e64802414ec5a67a905f05aaf3c137ea2ecabfbb3ea5902568073b575c55` |
| Pool key | `currency0 = address(0)` (native ETH) · `currency1 = USDG` · `fee = 3000` · `tickSpacing = 60` · `hooks = address(0)` |
| `sqrtPriceX96` (set = read-back) | `4086207363329542387775121` → ETH ≈ `$2659.999999` (`micro 2659999999`) |
| PoolManager (external, v4) | `0x8366a39CC670B4001A1121B8F6A443A643e40951` |

The indexer's off-chain read derives the price from the pool's **events (logs)**, not from
historical `slot0` state: `poolId = keccak256(abi.encode(poolKey))`, then it takes the
`sqrtPriceX96` from the **last `Swap` event** at/below the pinned week-end block (falling back to the
pool's `Initialize` event when never swapped) — verified to round-trip to the same `$2659.999999`.
This is deliberate: ordinary **non-archive RPCs cannot serve historical `slot0`** (`extsload` at a
past block returns *"historical state … is not available"*), but they **do** retain logs, so any
public verifier reproduces the identical price on a normal node — **no archive RPC required**.

### 11.3 Single source of truth — `deployments/46630.json` (no manual `set`)
`indexer/scripts/gen-deployments.mjs` now also parses the `DeployTestnetUsdgPool` broadcast and
records `contracts.usdg`, `ethUsdgPool` (fee/tickSpacing/hooks), and `deployBlocks.usdg` into
`deployments/46630.json`. `indexer/src/config.ts` reads them from there, so after **any** (re)deploy
the only step is:

```
cd indexer && npm run gen-deployments
```

- **Scan floor** auto-derives from the factory `deployBlock` (`122327405`) — no `INDEXER_START_BLOCK`.
  (Nothing platform-related can exist before the factory, so it is a provably-safe, tight floor;
  curve/creator discovery is decoupled and always scans from it, so a too-high override can never
  silently drop trades.)
- **USDG address / pool key** auto-derive from the file — no `INDEXER_USDG_ADDRESS` / pool env.

### 11.4 On-chain-pricing proof (zero fragile env)
```
node --experimental-strip-types src/cli.ts index-week 2960   # on-chain is the default now
```
- winner **#1 = `0xe4fe0dfc18f90c455a8981bfd7d794a7a70a2786`** ✅
- `resultHash = 0x739b3372e1169d0f962ddc3decd0565b1506b6ac16f759dbdf6ec60d8714579e` — **byte-identical**
  to the earlier pinned-env proof (the winner determination reproduces exactly).
- `priceBasis.source = onchain-ethusdg-v4-swap@upto:<pinBlock>|at:<block>.<logIndex>|pool:0x1466…5c55|sqrtPriceX96:4086207363329542387775121`
  (or `…-v4-init@…` when the pool has only been initialized, not yet swapped).
- `npm test` = **22/22** (determinism + verify + event-price + week-block PROVISIONAL/CLOSED suites;
  offline tests are pinned deployment-independent).

> **OPEN vs CLOSED.** `index-week` pins BOTH trades and price to the same block. An **open** week
> prices at the chain tip and prints `PROVISIONAL — do not commit yet`; a **closed** week prices at
> the deterministic week-end block, so `datasetHash`/`resultHash` reproduce byte-identically and the
> result is safe to commit. Because the price is read from **logs** (last `Swap` ≤ the pin, else
> `Initialize`), a closed week reproduces on any non-archive RPC.

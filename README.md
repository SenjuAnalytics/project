# 🚀 QUALYRA
### *Bonding curve launchpad, stock-token pairs and token battles*
**Built natively for Robinhood Chain (Chain ID: 4663) 🦅**

---

## 📌 Overview

**QUALYRA** is a launchpad and trading protocol on **Robinhood Chain**. Anyone can launch a token against ETH, USDG or an approved stock token. It trades on a bonding curve until the curve raises its target, then moves into a Uniswap v4 pool whose liquidity is locked permanently. Part of every trading fee funds two competitions.

**Launch. Trade. Battle.**

| # | What it does | Why it matters |
|---|---|---|
| 1 | **Locked liquidity** | The pool position is owned by a contract with no function to remove it. Not a timelock — there is no unlock date. |
| 2 | **No creator allocation** | The entire 1B supply goes to the curve. Creators earn from fees, not from tokens they were handed. |
| 3 | **Stock-token pairs** | Launch priced in NVDA, AAPL or SPY instead of ETH, using Robinhood Chain's tokenized stocks. |
| 4 | **Token League** | 24 hour battles between graduated tokens. The pot buys and burns the winning token, and every battle has a single winner. |
| 5 | **Trader League** | One weekly leaderboard across every token on the platform, paid to the top five wallets. |

> **Status:** the contracts are **live on Robinhood Chain testnet (chain 46630)** — see `deployments/46630.json` for addresses. No independent audit has been done yet, and nothing is live on **mainnet** (chain 4663). The finalized fee/battle model is defined in [`docs/FEE-AND-BATTLE-SPEC.md`](docs/FEE-AND-BATTLE-SPEC.md) (the single source of truth); the currently deployed testnet contracts still run the **older** fee logic until redeployed.

---

## 🏗️ Smart contract architecture

Nine contracts deployed once. Every launch adds two more: its token and its bonding curve.

```
QUALYRA PROTOCOL
│
├── QualyraFactory.sol             ← Entry point for launches, pair asset list, per-token registry
├── QualyraLaunchDeployer.sol      ← Deploys each token and curve with CREATE2
├── QualyraLaunchRouter.sol        ← Launch plus the creator's first buy in one transaction
├── QualyraLaunchToken.sol         ← ERC-20 template: 1B fixed, no owner, no mint, no tax, no blocklist
├── QualyraBondingCurve.sol        ← Primary market, constant product over a virtual pair asset reserve
├── QualyraGraduationExecutor.sol  ← Creates the Uniswap v4 pool at the curve's final price
├── QualyraLiquidityLocker.sol     ← Owns every pool position. No function removes liquidity.
├── QualyraHook.sol                ← Uniswap v4 hook charging the fee and creator tax on each swap
├── QualyraFeeVault.sol            ← Splits fees, holds creator and treasury balances until withdrawn
├── QualyraCompetitionVault.sol    ← Battle schedules and pots, weekly league pools, results, claims
└── QualyraBuybackBurner.sol       ← Buys the winning token of a battle in tranches and burns it (on a draw/void, each token's own contribution buys back and burns that token)
```

---

## 📁 Project structure

```
Qualyra/
├── contracts/              ← Foundry project, Solidity 0.8.26
│   ├── src/                ← The contracts above, plus interfaces and libraries
│   ├── script/             ← DeployQualyra.s.sol
│   ├── test/               ← 124 tests, including attack scenarios and an invariant test
│   ├── abi/                ← Generated ABI JSON, one file per contract
│   └── docs/               ← Pre-mainnet verification and Pons reference data
├── frontend/               ← Next.js 16 app
│   ├── app/                ← Trade, Stocks, Battles, Launch, Portfolio
│   ├── components/         ← UI components and Web3 widgets
│   └── lib/                ← wagmi config, generated ABIs, contract addresses
├── scripts/
│   ├── sync-abi.mjs        ← Copies ABIs from the Foundry build into the frontend
│   └── generate_og_image.py
├── README.md
└── AUDIT_NOTES.md          ← Review findings, what was fixed, what is still open
```

---

## 💸 How money moves

- **Launch fee:** 0.0005 ETH, always paid in ETH. **100% to the treasury.**
- **Trading fee:** 1% of every trade, on the curve and in the pool, taken in the pair asset. Split **70% creator, 15% platform (treasury), 15% competition**, locked for each token at launch.
- **Competition share (15%):** routing depends on the token's battle status —
  - **From its booking until the battle's 24 hours end:** the **full 15% goes to that battle's pot** (both the 70% and 30% shares). The token's accumulated `pendingBattlePot` seeds the pot at the booking.
  - **Before it has ever battled:** **70% is held in `pendingBattlePot` for that token, 30% to the Trader League.** When a battle is booked, the held amount seeds the pot.
  - **No eligibility timer within 30 days of launch:** from then on the battle share goes to the treasury, and whatever the token held in `pendingBattlePot` follows it.
  - **After it has battled once (retired; a token battles at most once in its lifetime):** **70% to the treasury, 30% to the Trader League** — no longer to `pendingBattlePot`.
  - **Disqualified before its battle is booked:** the **full 15% plus its entire `pendingBattlePot` goes to the treasury**. The same happens when a token disqualified while booked has that booking cancelled.
  - **Disqualified after its booking (before or during the battle):** the fee still goes **100% to the pot** until the battle's 24 hours end, and the pot becomes the other token's.
  - See [`docs/FEE-AND-BATTLE-SPEC.md`](docs/FEE-AND-BATTLE-SPEC.md) for the authoritative flow.
- **Pool fees are recorded, then swept:** a trade in a graduated pool only records its fees in the hook, so it costs no extra gas. The operator service sweeps them into the vaults every day, a creator withdrawal sweeps its own token first, and finalizing a battle sweeps that battle's fees. The app adds what the hook still holds to every balance it shows.
- **Creator tax:** optional, 0–5% chosen at launch, same rate on buys and sells, paid to the creator in full.
- **Snipe tax:** buys in the first 15 seconds pay a tax starting at 99% that halves roughly once a second. The creator, the fee recipient and up to 32 wallets the creator names are exempt.
- **Graduation:** 5/7 of supply is sold on the curve. At the target (4.2 ETH or 8,090 USDG) the raise and the remaining 2/7 seed the pool at the same price.

Balances are pulled, never pushed. Creators, the treasury and league winners withdraw their own funds.

---

## ⚔️ Competitions

### Token League

- **Eligibility (revised):** the **only** requirement is **market cap ≥ $100,000 USD** (in USD, not the pair asset). Market cap is computed **on-chain** from the pool's **30-minute time-weighted average price**, which the hook keeps, and **Chainlink** (`AggregatorV3Interface`) price feeds (no off-chain trust), so a price pushed for a moment can't start or break anything. Bonding curve trades don't count. The 24-hour timer starts the first time the token reaches $100k on its pool, and it qualifies once the 24 hours pass. From the timer's start until its battle ends, a token whose market cap stays below $100k for **30 minutes** is **permanently disqualified**, whether it is still qualifying, waiting for a booking, booked or live. A drop only ends once the market cap has held $100k for another 30 minutes, so a short bounce doesn't reset the clock, and a token in a drop can't be booked. A drop that has lasted 30 minutes by the end of a battle counts even if no trade came along to confirm it. Every swap runs the check, and the keeper runs it for quiet tokens where timing matters, so a drop caused by the pair asset's own dollar price is caught too. Each token may battle **at most once in its lifetime**. The old "minimum 100 holders" requirement has been dropped. Feed addresses are configurable (testnet chain 46630 vs mainnet chain 4663). See [`docs/FEE-AND-BATTLE-SPEC.md §2`](docs/FEE-AND-BATTLE-SPEC.md).
- Every battle runs from 00:00 to 24:00 UTC. The operator books eligible, graduated tokens sharing a pair asset for a coming midnight, paired by market cap; bookings are recorded before they start and cannot be edited. A token can battle at most once in its lifetime. The guardian can cancel a booking before it starts: each token's contribution goes back to its `pendingBattlePot` and both can be booked again. A token disqualified while booked can't battle again, so its contribution goes to the treasury instead.
- Winner is scored 70% on qualified volume and 30% on unique qualifying buyers. A lead under one percentage point is recorded as a draw.
- The guardian can veto a result within 24 hours; after that the battle settles on its own (the operator service finalizes it, and anyone can), and the first buyback tranche runs in the same transaction. There is no early finalize — every battle runs the full 24 hours. A token disqualified after its booking has lost, but the winner is only declared at finalize; its fees keep flowing 100% to the pot until the battle's 24 hours end. Once those 24 hours are over, a drop no longer changes anything.
- **Winner (won on score, or won because the opponent was disqualified):** the **entire pot (100%) buys back and burns the winning token through its own pool**.
- **Both tokens disqualified:** the one whose market cap went below $100k **first loses**; the token that **survived longer (dropped later) wins** → the full pot buys back and burns the winner. **There is always a winner — this is not a void.** A true void only occurs if both drops are dated to the same second, which is then handled the same as a draw (below). The vault records every drop and only accepts the outcome that record implies, so a posted result can't overturn it.
- **Draw (final scores tied, no winner):** the pot is **not split 50/50**. Each token gets back **only the portion it contributed** (its `pendingBattlePot` seed + the competition fees from its own trades during the battle), and that amount is used to **buy back and burn that same token** — token A's contribution burns A, token B's contribution burns B. Nothing goes to the Trader League.
- **Void (battle cancelled / no valid result):** handled the **same as a draw** — each token gets its own contribution back and it buys back and burns that token (not 50/50, not to the Trader League).
- The burner spends a pot in **4 tranches**, at most one every 30 minutes per token, each raising the price by at most **5%**. Unspent remainder stays in the pot, so the limit sets pace, not size. On a draw/void the same tranching applies, run per token against its own contribution.

### Trader League

- One weekly leaderboard across every token on Qualyra, not one per token. Weeks start Monday 00:00 UTC.
- After a week ends the operator publishes the top five wallets. The guardian can veto within 48 hours, then anyone can finalize.
- Winners take 40%, 30%, 15%, 10% and 5% of every asset in that week's pool, claimed per asset. (This 40/30/15/10/5 split is the Trader League leaderboard payout — separate from battle pots, which are never split evenly.)
- Empty places roll into the next week. Prizes unclaimed after 60 days roll into the week in progress.

---

## 🪙 Pair assets

| Asset | Decimals | Listed at deploy |
|---|---|---|
| ETH (native) | 18 | ✅ |
| USDG | 6 | ✅ |
| NVDA · AAPL · SPY | 18 | ✅ |
| GOOGL · GME · SPCX · SGOV | 18 | Held back for review, listed later through the timelock |

Virtual reserve and graduation target are set per asset. `setQuoteAsset` reads `decimals()` off the token, rejects a mismatch and refuses anything below 6 decimals.

---

## 🚦 Quick start

### Contracts

```bash
cd contracts
forge install foundry-rs/forge-std@v1.16.2
forge install OpenZeppelin/openzeppelin-contracts@v5.6.1
forge install Uniswap/v4-periphery@a7af5b345b479b05fde9182d7e40913a73b3e18f
forge build
forge test
```

The build uses the IR pipeline (`via_ir = true`), which keeps `QualyraCompetitionVault` well under the 24 KB contract size limit; a clean build takes several minutes. The suite runs offline. One test dry-runs the production deploy against a fork and is skipped unless an RPC endpoint is given:

```bash
ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-contract DeployQualyraForkTest -vv
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

`frontend/.env.local`:

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
# Testnet (chain 46630) is live — see deployments/46630.json / frontend/lib/contracts.ts
NEXT_PUBLIC_QUALYRA_FACTORY=0x...
```

### After changing a contract

```bash
cd contracts && forge build
node scripts/sync-abi.mjs
```

This regenerates `frontend/lib/abis/*.ts` and `contracts/abi/*.json`. Never edit either by hand.

### Deployment

```bash
cd contracts
cp .env.example .env    # fill it in
source .env
forge script script/DeployQualyra.s.sol --rpc-url $RPC_URL --broadcast --account <keystore-name>
```

The script deploys the nine contracts, mines a salt so the hook address carries the right Uniswap v4 permission flags, wires everything together, lists the pair assets and starts the ownership transfer to the timelock. The timelock must then call `acceptOwnership()`.

---

## 🔒 Roles and safety

| Role | Held by | Can | Cannot |
|---|---|---|---|
| Admin | Timelock (48h) behind the Admin Safe | Change parameters for future launches within hard limits, list pair assets, set operator and guardian, unpause, start the league | Touch liquidity, creator balances or tokens already launched |
| Operator | Hot wallet run by the operator service (`indexer`, `npm run operate`) | Book battles, publish results and weekly winners | Move funds or change prize shares |
| Guardian | Guardian Safe (2-of-3) | Pause the prize contracts, veto results during a challenge period, cancel a booked battle before it starts | Move funds or unpause |
| Keeper | A second hot wallet of the service, with no role | Send the permissionless calls: finalize, buyback tranches, sweeps, expired pending releases | Anything restricted |
| Creator | Creator wallet | Withdraw fees, change the fee recipient | Change fees, tax or supply |

- **Operator key.** The operator is a hot wallet so battles and results run on schedule without anyone signing. It can't move funds, and a wrong result or booking is vetoed or cancelled by the guardian; the service's watcher recomputes every posted result and alerts on a mismatch. Keep only gas money in the operator and keeper wallets, and never commit their keys or give them a `NEXT_PUBLIC_` name.
- **No upgrades.** Contracts cannot be changed after deployment. A new version means a new deployment.
- **Pause scope.** Only the competition vault and the burner can pause. Curves, pools, the hook, the fee vault and the factory never pause, so trading is never blocked.
- **Stuck launches.** If a completed curve cannot graduate for 7 days, the admin can open proportional refunds through the factory.
- **Draw / void payouts.** On a draw or void the pot is **not** split 50/50 and **nothing** goes to the Trader League — each token gets back only what it contributed and that amount buys back and burns that same token. When both tokens are disqualified the one that dropped first loses and the survivor (dropped later) wins; only two drops in the same second void the battle. See [`docs/FEE-AND-BATTLE-SPEC.md §5`](docs/FEE-AND-BATTLE-SPEC.md).

---

## ⚠️ Before mainnet

- An independent audit.
- A full run on Robinhood Chain testnet, from launch through graduation, a battle (winner / draw / void / both-disqualified), a buyback and a weekly payout.
- The fork dry run of the deploy script, read end to end.
- Confirm how USDG and each stock token behave under pauses, freezes and blocklists.
- Set up the timelock with the Admin Safe as proposer and the Guardian Safe as canceller.
- Point the vault at the operator wallet (`setOperator`, through the timelock) and run the operator service from `indexer/` (`npm run operate`): it books battles, posts results and weekly winners, and sends the keeper calls (sweeps, finalizations, buyback tranches). Fund both wallets with gas, set an alert webhook, and run `npm run watch` on a second machine. Battle eligibility stays on-chain via Chainlink; the indexer only scores.

See `AUDIT_NOTES.md` for review findings and `contracts/docs/PRE-MAINNET-VERIFICATION.md` for the on-chain verification record.

---

- **Official Website**: [https://www.qualyra.xyz/](https://www.qualyra.xyz/)
- **Block Explorer**: [https://robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com)

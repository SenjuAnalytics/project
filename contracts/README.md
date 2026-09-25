# Qualyra contracts

Smart contracts for Qualyra, a token launchpad on Robinhood Chain. Anyone can launch a token against ETH, USDG or an approved stock token. It trades on a bonding curve until the curve raises its target, then moves into a Uniswap v4 pool with permanently locked liquidity. Part of every trading fee pays for two competitions: token battles settled with buyback and burn, and a weekly leaderboard for traders.

**Launch. Trade. Battle.**

## Contracts

The platform is nine contracts deployed once. Every launch adds two more: its token and its bonding curve.

| Contract | Role |
| --- | --- |
| `QualyraFactory` | Entry point for launches and registry for the other contracts. Holds the pair asset list and the parameters for future launches. |
| `QualyraLaunchDeployer` | Deploys each token and curve with CREATE2. |
| `QualyraLaunchRouter` | Launch plus the creator's first buy in one transaction. |
| `QualyraLaunchToken` | ERC-20 template for launched tokens. Fixed 1B supply, no owner, no mint, no tax, no blocklist. |
| `QualyraBondingCurve` | Primary market of a launch. Constant product over a virtual pair asset reserve. |
| `QualyraGraduationExecutor` | Creates the Uniswap v4 pool at the curve's final price. |
| `QualyraLiquidityLocker` | Owns every pool position. There is no function to remove liquidity. |
| `QualyraHook` | Uniswap v4 hook on every graduated pool. Charges the trading fee and creator tax on each swap. |
| `QualyraFeeVault` | Splits fees and holds creator and treasury balances until they are withdrawn. |
| `QualyraCompetitionVault` | Battle schedules and pots, weekly Trader League pools, results, challenge periods and claims. |
| `QualyraBuybackBurner` | Buys the winning token of a battle in tranches and burns it. |

## How money moves

- **Launch fee:** 0.0005 ETH, always paid in ETH. Half goes to the treasury, half to the Trader League.
- **Trading fee:** 1% of every trade, on the curve and in the pool, taken in the pair asset. Split 70% creator, 15% platform, 15% competition. The split is locked for each token at launch.
- **Competition share:** while a token is in a battle, the full 15% goes to that battle's pot. At any other time, 7.5% goes to the Trader League and 7.5% to the treasury.
- **Creator tax:** optional, chosen at launch (5% maximum by default), same rate on buys and sells, paid in full to the creator.
- **Snipe tax:** buys in the first 15 seconds pay a tax that starts at 99% and halves roughly once a second (about 25% at three seconds, 6% at five). It is capped so that fee, creator tax and snipe tax never take more than 99% of a buy. The creator, the creator's fee recipient and up to 32 wallets chosen by the creator are exempt. It is split like the trading fee.
- **Full fills only:** when a swapper specifies the pair asset side (an exact-input buy or an exact-output sell), the fee is taken before the swap runs, so the pool has to trade the whole amount. A swap that would stop early at its own price limit is rejected instead of charging a fee on the part that never traded. Routers that pass the full price range are unaffected.
- **Graduation:** 5/7 of the supply is sold on the curve. When the curve raises its target (4.2 ETH or 8,090 USDG), the raised amount and the remaining 2/7 of the supply seed the pool at the same price and depth.

Balances are pulled, never pushed. Creators, the treasury and Trader League winners withdraw or claim their own funds.

## Competitions

### Token League

- Every battle runs from 00:00 to 24:00 UTC. The operator books graduated, eligible tokens with the same pair asset for a coming midnight, at most 7 days ahead. Bookings cannot be edited, and a token battles once in its lifetime.
- Eligibility is decided on-chain: a market cap of at least $100,000, held for 24 hours. Market cap uses the pool's 30-minute time-weighted price, which the hook keeps, converted to USD through Chainlink; bonding curve trades don't count. From the start of its timer until its battle ends, a token whose market cap stays below $100,000 for 30 minutes is disqualified. A drop only ends once the market cap has held the threshold for another 30 minutes, a token in a drop can't be booked, and a drop that has lasted 30 minutes by the end of a battle counts even without a trade to confirm it (`forcedOutcomeOf`). Swaps run the check; `pokeEligibility` runs it without one, and the operator service does that for quiet tokens where timing matters.
- From the booking until the 24 hours end, the whole competition share of both tokens' fees goes into the pot, on top of what each token held as pending.
- After a battle, the operator publishes the outcome with both scores and commitments to the dataset and the result. A lead of less than one percentage point must be recorded as a draw. The vault's disqualification record comes first: the token that dropped loses, the first of two to drop loses, and two drops dated to the same second void the battle. A drop is dated from when the market cap went below the threshold.
- The guardian can veto a result within 24 hours, and can cancel a booking before it starts, which returns each token's contribution to its pending pot and gives both tokens their battle back. A token disqualified while booked sends its contribution to the treasury instead.
- After the challenge window anyone can finalize; the operator service does it automatically. A win or a disqualification of the opponent sends the whole pot to the buyback of the winner, and the first tranche runs in the same transaction. On a draw or a void each token's own contribution buys back and burns that token.
- The burner spends a pot in 4 tranches, and a token gets at most one tranche every 30 minutes however many pots it has won. Each tranche can raise the token price by at most 5%, and burner swaps pay no fee.

### Trader League

- One weekly leaderboard across every token launched on Qualyra, not one per token. Weeks start on Monday at 00:00 UTC.
- Funds collected before `startLeague` are spread evenly over the first four league weeks.
- After a week ends, the operator publishes the top five wallets. The guardian can veto within 48 hours, then anyone can finalize the week.
- Winners receive 40%, 30%, 15%, 10% and 5% of every asset in that week's pool, claimed per asset. Anyone can trigger a claim, but the prize always goes to the winner.
- Empty places roll into the next week. Prizes not claimed within 60 days roll into the week in progress.

## Roles and safety

| Role | Held by | Can | Cannot |
| --- | --- | --- | --- |
| Admin | Timelock (48 hours) controlled by the Admin Safe | Change parameters for future launches within hard limits, list pair assets, set operator and guardian, unpause, start the league, emergency migration of the prize contracts | Touch liquidity, creator balances or tokens already launched |
| Operator | Hot wallet run by the operator service in `indexer/` | Book battles, publish battle results and weekly winners | Move funds or change prize shares |
| Guardian | Guardian Safe (2-of-3) | Pause the prize contracts, veto results during a challenge period, cancel a booked battle before it starts | Move funds or unpause |
| Keeper | A second wallet of the service, with no role | Send the permissionless calls listed under Operations | Anything restricted |
| Creator | Creator wallet | Withdraw fees, change the fee recipient | Change fees, tax or supply |

- **No upgrades.** Contracts cannot be changed after deployment. A new version means a new deployment.
- **Pause scope.** Only `QualyraCompetitionVault` and `QualyraBuybackBurner` can pause. Curves, pools, the hook, the fee vault and the factory never pause. Fee deposits into the competition vault keep working while it is paused, so trading is never blocked.
- **Emergency migration.** While paused, the admin can point the competition vault or the burner at a replacement contract, once. Balances can then only be swept to that address. The replacement is expected to honour the pots, pools and prizes still readable in the old contract.
- **Stuck launches.** If a completed curve cannot graduate for 7 days, the admin can open pro rata refunds through the factory.

## Getting started

### Install Foundry

- macOS, Linux, or Git Bash on Windows: `curl -L https://foundry.paradigm.xyz | bash` and then `foundryup`
- Any platform with Node.js: `npm install -g @foundry-rs/forge`

### Install dependencies

Run this from this folder:

```sh
forge install foundry-rs/forge-std@v1.16.2
forge install OpenZeppelin/openzeppelin-contracts@v5.6.1
forge install Uniswap/v4-periphery@a7af5b345b479b05fde9182d7e40913a73b3e18f
```

`v4-periphery` brings in `v4-core` (59d3ecf5), `permit2` and `solmate` as submodules. The remappings in `foundry.toml` expect exactly these paths.

### Build and test

```sh
forge build
forge test
```

The build uses the IR pipeline (`via_ir = true`) so `QualyraCompetitionVault` stays well under the 24 KB limit; a clean build takes several minutes. Tests read the clock through `vm.getBlockTimestamp()` and move it with `skip()`, because the IR optimizer may reuse a `block.timestamp` read across `vm.warp` inside one test function.

The suite covers launches and curve math, fee splitting, graduation and pool fees for both currency orderings, both leagues, buybacks, the launch router, the deploy script, attack scenarios and a stateful invariant test of the fee flow.

## Deployment

Copy `.env.example` to `.env`, fill it in, then:

```sh
source .env
forge script script/DeployQualyra.s.sol --rpc-url $RPC_URL --broadcast --account <keystore-name>
```

The script deploys the nine contracts, mines a salt so the hook address carries the right Uniswap v4 permission flags, wires everything together, lists ETH (and USDG when `USDG` is set), and starts the ownership transfer of the factory to the timelock.

After deployment:

1. **Timelock:** schedule and execute `QualyraFactory.acceptOwnership()`. Until it runs, the deployer account is still the owner.
2. **Stage 1, launch and trade:** live as soon as the contracts are deployed. League funds already accumulate in the bootstrap pool.
3. **Stock tokens:** list each approved stock token with `setQuoteAsset` through the timelock, using its own virtual reserve and graduation target.
4. **Stage 2, Trader League:** once the indexer is ready, call `startLeague()` through the timelock. Payouts begin the following Monday.
5. **Stage 3, Token League:** set the operator wallet with `setOperator` through the timelock and start the operator service (`indexer`, `npm run operate`). It books ready tokens every day for 00:00 UTC.

## Operations

These calls are open to anyone. The operator service sends them from its keeper wallet as soon as they are due:

- `QualyraHook.sweepFees(token, battleId)`: moves accrued pool fees to the fee vault. League pools are credited when fees are swept, so the keeper sweeps every token daily at 23:40 UTC, which also lands each week's fees before it ends. A creator withdrawal sweeps its own token first, and finalizing a battle sweeps that battle's fees.
- `QualyraCompetitionVault.finalizeBattle(id)` and `finalizeWeek(week)` once challenge periods pass. Finalizing a battle also runs its first buyback tranche.
- `QualyraCompetitionVault.releaseExpiredPending(token, asset)` for a token that let 30 days pass after launch without starting its eligibility timer.
- `QualyraBuybackBurner.executeBuyback(battleId, token)` every 30 minutes until a pot is spent.
- `QualyraCompetitionVault.claim(week, rank, assets)` on behalf of winners, and `rolloverUnclaimed(week)` after 60 days.
- `QualyraFactory.graduate(token)` if a completing buy did not graduate its curve.
- `QualyraFeeVault.withdrawTreasury(asset)` and `withdrawCreatorFees(token, asset)`, and `sweepSurplus(asset)` for funds sent to the vault by mistake.

## Before mainnet

- An independent audit.
- A full run on Robinhood Chain testnet, from launch through graduation, a battle, a buyback and a weekly payout.
- Confirm the Uniswap v4 PoolManager address and that the CREATE2 deployer `0x4e59b44847b379578588920cA78FbF26c0B4956C` exists on the chain.
- Confirm how USDG and each stock token behave under pauses, freezes and blocklists, and set per-asset parameters for stock tokens.
- Set up the timelock with the Admin Safe as proposer and add the Guardian Safe as a canceller.
- Fund the operator and keeper wallets with gas, set the service's alert webhook, and run its watcher on a second machine.

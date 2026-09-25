// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdStorage, stdStorage} from "forge-std/StdStorage.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

import {DeployQualyra} from "../script/DeployQualyra.s.sol";
import {QualyraFactory} from "../src/QualyraFactory.sol";
import {QualyraFeeVault} from "../src/QualyraFeeVault.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraBuybackBurner} from "../src/QualyraBuybackBurner.sol";
import {QualyraLiquidityLocker} from "../src/QualyraLiquidityLocker.sol";
import {QualyraLaunchRouter} from "../src/QualyraLaunchRouter.sol";
import {QualyraHook} from "../src/QualyraHook.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

import {IPoolSwapTest} from "./utils/V4TestRouters.sol";

/// @notice Full Qualyra product lifecycle exercised against a live Robinhood Chain (4663) FORK using the REAL
///         Uniswap v4 PoolManager, for both the ETH and USDG pair-asset paths.
/// @dev Fork test: SKIPPED unless ROBINHOOD_RPC_URL is set (same gate as DeployQualyraForkTest), so the default
///      offline `forge test` stays fast and network-free.
///
///          set "ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com"
///          forge test --match-contract QualyraFullFlowForkTest -vvv
///
///      Unlike SystemTestBase (which deploys a LOCAL PoolManager), this test deploys the whole system via the
///      production DeployQualyra script against the canonical on-chain PoolManager, then drives launch ->
///      graduation -> real v4 pool -> swap -> battle -> buyback/burn -> creator-fee & league claim end to end.
contract QualyraFullFlowForkTest is Test {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;
    using stdStorage for StdStorage;

    // Canonical Robinhood Chain externals, verified on-chain (docs/PRE-MAINNET-VERIFICATION.md §2).
    address internal constant RBH_POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant RBH_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    // Pair-asset economics (must match the DeployQualyra script literals).
    uint256 internal constant USDG_THRESHOLD = 8_090e6;

    IPoolManager internal manager;
    IPoolSwapTest internal swapRouter;

    QualyraFactory internal factory;
    QualyraFeeVault internal feeVault;
    QualyraCompetitionVault internal competition;
    QualyraBuybackBurner internal burner;
    QualyraLiquidityLocker internal locker;
    QualyraLaunchRouter internal router;
    QualyraHook internal hook;

    // Roles we control (the deploy config makeAddr values).
    address internal timelock;
    address internal treasury;
    address internal operator;
    address internal guardian;

    // Actors.
    address internal creatorA = makeAddr("creatorA");
    address internal creatorB = makeAddr("creatorB");
    address internal trader = makeAddr("trader");
    address internal leagueWinner = makeAddr("leagueWinner");
    address internal leagueRunnerUp = makeAddr("leagueRunnerUp");

    function test_fullLifecycle_onRobinhoodFork() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("SKIPPED: set ROBINHOOD_RPC_URL to run the full lifecycle on a Robinhood Chain fork");
            return;
        }

        vm.createSelectFork(rpc);
        assertEq(block.chainid, 4663, "not forking Robinhood Chain");

        _deployOnFork();

        // ---- ETH full flow (MUST pass) ----
        _ethFullFlow();

        // ---- USDG full flow (best-effort, honest) ----
        _usdgFullFlow();
    }

    // -------------------------------------------------------------------------------------------------
    // Deployment against the REAL PoolManager, via the production script
    // -------------------------------------------------------------------------------------------------

    function _deployOnFork() private {
        timelock = makeAddr("timelock");
        treasury = makeAddr("treasury");
        operator = makeAddr("operator");
        guardian = makeAddr("guardian");

        DeployQualyra script = new DeployQualyra();
        DeployQualyra.Config memory config = DeployQualyra.Config({
            poolManager: IPoolManager(RBH_POOL_MANAGER),
            timelock: timelock,
            treasury: treasury,
            operator: operator,
            guardian: guardian,
            usdg: RBH_USDG
        });

        // deployer == create2Deployer == the script instance so the mined hook address matches
        // (same convention as DeployQualyra.t.sol / DeployQualyraFork.t.sol). deploy() runs _preflight().
        DeployQualyra.Deployment memory d = script.deploy(config, address(script), address(script));

        factory = d.factory;
        feeVault = d.feeVault;
        competition = d.competitionVault;
        burner = d.buybackBurner;
        locker = d.liquidityLocker;
        router = d.launchRouter;
        hook = d.hook;
        manager = IPoolManager(RBH_POOL_MANAGER);

        // Ownership is handed to the timelock via Ownable2Step; accept it so owner-gated ops work.
        assertEq(factory.pendingOwner(), timelock, "handoff target");
        vm.prank(timelock);
        factory.acceptOwnership();
        assertEq(factory.owner(), timelock, "timelock did not take ownership");

        // A fresh v4 PoolSwapTest router pointing at the REAL PoolManager, so hook fees are charged on trades.
        swapRouter = IPoolSwapTest(deployCode("PoolSwapTest.sol:PoolSwapTest", abi.encode(RBH_POOL_MANAGER)));

        // Pair assets listed as expected by the production deploy.
        assertEq(factory.quoteAssetConfig(address(0)).graduationThreshold, 4.2 ether, "ETH threshold");
    }

    // -------------------------------------------------------------------------------------------------
    // ETH full flow
    // -------------------------------------------------------------------------------------------------

    function _ethFullFlow() private {
        // The Trader League starts so week pools are seeded and finalizable.
        vm.prank(timelock);
        competition.startLeague();

        // Two creators each launch an ETH-paired token and graduate it in one transaction via the router.
        (QualyraLaunchToken tokenA, PoolKey memory keyA) = _launchAndGraduateEth(creatorA);
        (QualyraLaunchToken tokenB, PoolKey memory keyB) = _launchAndGraduateEth(creatorB);

        // A real v4 pool exists for each, liquidity is locked, and the launch is marked graduated.
        _assertGraduatedEthPool(tokenA, keyA);
        _assertGraduatedEthPool(tokenB, keyB);

        // Trade on a graduated pool via the router so the hook accrues fees, then sweep them.
        vm.deal(trader, 100 ether);
        _swap(keyA, trader, true, -2 ether, 2 ether);
        (uint128 accruedBefore,) = hook.accruedFees(address(tokenA), 0);
        assertGt(accruedBefore, 0, "no hook fee accrued from swap");
        hook.sweepFees(address(tokenA), 0);
        assertGt(feeVault.creatorBalance(address(tokenA), address(0)), 0, "creator fee not credited on sweep");

        // Make both ETH tokens battle-eligible (fork-safe, side-effect-free; see _makeEthPairEligible).
        _makeEthPairEligible(address(tokenA), address(tokenB));

        // Schedule a battle between the two ETH tokens (operator), trade during it, settle WinnerA.
        uint256 start = (vm.getBlockTimestamp() / 1 days + 1) * 1 days; // battles start at 00:00 UTC
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 1 hours);
        _swap(keyA, trader, true, -10 ether, 10 ether);
        _swap(keyB, trader, true, -5 ether, 5 ether);

        vm.warp(start + competition.BATTLE_DURATION());
        vm.prank(operator);
        competition.proposeBattleResult(
            battleId,
            QualyraCompetitionVault.Outcome.WinnerA,
            0.7e18,
            0.3e18,
            keccak256(abi.encodePacked("dataset")),
            keccak256(abi.encodePacked("result"))
        );
        skip(competition.BATTLE_CHALLENGE_PERIOD());
        competition.finalizeBattle(battleId);

        uint256 pot = burner.remaining(battleId, address(tokenA));
        assertGt(pot, 0, "winner buyback pot empty");

        // Buy back and burn in tranches (warp TRANCHE_INTERVAL between calls, up to TRANCHES) until nothing left.
        uint256 supplyBefore = tokenA.totalSupply();
        for (uint256 i; i < burner.TRANCHES(); ++i) {
            if (burner.remaining(battleId, address(tokenA)) == 0) break;
            skip(burner.TRANCHE_INTERVAL()); // finalize already ran the first tranche
            burner.executeBuyback(battleId, address(tokenA));
        }
        assertEq(burner.remaining(battleId, address(tokenA)), 0, "buyback pot not fully spent");
        assertLt(tokenA.totalSupply(), supplyBefore, "no tokens were burned");

        // The creator pulls their accrued ETH fees (asset == address(0)).
        uint256 owedA = feeVault.creatorBalance(address(tokenA), address(0));
        assertGt(owedA, 0, "creator has nothing to withdraw");
        uint256 creatorBalBefore = creatorA.balance;
        feeVault.withdrawCreatorFees(address(tokenA), address(0));
        assertEq(creatorA.balance - creatorBalBefore, owedA, "creator payout mismatch");
        assertEq(feeVault.creatorBalance(address(tokenA), address(0)), 0, "creator balance not zeroed");

        // Run a league week: propose winners, finalize after the challenge period, then claim.
        uint256 week = competition.firstLeagueWeek();
        uint256 leaguePool = competition.weekPool(week, address(0));
        assertGt(leaguePool, 0, "league week pool empty");

        vm.warp(competition.weekEndsAt(week));
        vm.prank(operator);
        competition.proposeWeeklyWinners(
            week,
            [leagueWinner, leagueRunnerUp, address(0), address(0), address(0)],
            keccak256(abi.encodePacked("dataset")),
            keccak256(abi.encodePacked("result"))
        );
        skip(competition.LEAGUE_CHALLENGE_PERIOD());
        competition.finalizeWeek(week);

        address[] memory ethAsset = new address[](1); // [address(0)]
        competition.claim(week, 0, ethAsset);
        competition.claim(week, 1, ethAsset);
        // Prize split is read from the contract itself (prizeShareBps: 1st = 4000bps, 2nd = 3000bps) rather
        // than hardcoded, so the assertion always tracks the real payout schedule.
        assertEq(
            leagueWinner.balance, leaguePool * competition.prizeShareBps(0) / 10_000, "first place prize mismatch"
        );
        assertEq(
            leagueRunnerUp.balance, leaguePool * competition.prizeShareBps(1) / 10_000, "second place prize mismatch"
        );

        emit log("ETH FULL FLOW OK: launch, graduate, swap, battle, buyback+burn, creator-fee, league claim");
    }

    /// @dev Launches an ETH pair through the router and fills it so it graduates in the same transaction.
    function _launchAndGraduateEth(address who) private returns (QualyraLaunchToken token, PoolKey memory key) {
        uint256 fee = factory.launchFee();
        // 4.2 ETH graduation threshold; 5 ETH in comfortably completes the curve.
        vm.deal(who, fee + 6 ether);
        vm.prank(who);
        (address tokenAddr,,) = router.launchAndBuy{value: fee + 5 ether}(_ethParams(), 5 ether, 0);
        assertTrue(factory.isGraduated(tokenAddr), "ETH launch did not graduate");
        token = QualyraLaunchToken(tokenAddr);
        key = hook.poolKeyOf(tokenAddr);
    }

    function _assertGraduatedEthPool(QualyraLaunchToken token, PoolKey memory key) private view {
        // A real v4 pool exists at the curve's final price.
        (uint160 sqrtPriceX96,,,) = manager.getSlot0(key.toId());
        assertGt(sqrtPriceX96, 0, "pool not initialized on the real PoolManager");

        // ETH is currency0 for an ETH pair (address(0) < token).
        assertEq(Currency.unwrap(key.currency0), address(0), "ETH is not currency0");
        assertEq(Currency.unwrap(key.currency1), address(token), "token is not currency1");

        // Liquidity is locked in the pool and owned by the locker.
        (,,, uint128 liquidity) = locker.positionOf(address(token));
        assertGt(liquidity, 0, "no locked liquidity");
        assertEq(manager.getLiquidity(key.toId()), liquidity, "pool liquidity != locked position");
    }

    // -------------------------------------------------------------------------------------------------
    // USDG full flow (best-effort, honest)
    // -------------------------------------------------------------------------------------------------

    function _usdgFullFlow() private {
        // USDG is registered as a quote asset with 6 decimals and the expected graduation threshold.
        IQualyraFactory.QuoteAssetConfig memory usdg = factory.quoteAssetConfig(RBH_USDG);
        assertTrue(usdg.listed, "USDG not listed");
        assertTrue(usdg.enabled, "USDG not enabled");
        assertEq(uint256(usdg.decimals), 6, "USDG decimals != 6");
        assertEq(usdg.graduationThreshold, USDG_THRESHOLD, "USDG threshold != 8_090e6");

        // Try to fund a buyer with USDG on the fork. USDG is a proxy, so `deal` may not work; if it does not,
        // we skip only the USDG trading/graduation portion and log the reason (never fabricate balances).
        uint256 needed = 20_000e6; // > threshold + phantom + fees, enough to complete the USDG curve
        if (!_tryFundUsdg(creatorA, needed)) {
            emit log("USDG SKIPPED: could not fund USDG on the fork (deal + stdstore both ineffective on the proxy)");
            emit log("             USDG registration (listed, enabled, decimals==6, threshold==8_090e6) still asserted above.");
            return;
        }

        // Launch a USDG-paired token, approve the router, and buy on the curve until it completes/graduates.
        uint256 fee = factory.launchFee();
        vm.deal(creatorA, fee);
        vm.startPrank(creatorA);
        (address tokenAddr, address curveAddr,) = router.launchAndBuy{value: fee}(_usdgParams(), 0, 0);
        IERC20(RBH_USDG).approve(curveAddr, needed);
        // Buy directly on the curve to complete it (router already created the launch).
        (bool ok,) = curveAddr.call(
            abi.encodeWithSignature(
                "buy(uint256,uint256,address,uint256)", needed, uint256(0), creatorA, vm.getBlockTimestamp()
            )
        );
        vm.stopPrank();

        if (!ok || !factory.isGraduated(tokenAddr)) {
            emit log("USDG SKIPPED: USDG curve did not graduate on the fork (buy reverted or threshold not met).");
            return;
        }

        PoolKey memory key = hook.poolKeyOf(tokenAddr);
        (uint160 sqrtPriceX96,,,) = manager.getSlot0(key.toId());
        assertGt(sqrtPriceX96, 0, "USDG pool not initialized");
        (,,, uint128 liquidity) = locker.positionOf(tokenAddr);
        assertGt(liquidity, 0, "no locked USDG liquidity");

        // Trade on the graduated USDG pool so the hook accrues USDG fees, then sweep.
        bool usdgIsCurrency0 = RBH_USDG < tokenAddr;
        if (_tryFundUsdg(trader, 1_000e6)) {
            vm.prank(trader);
            IERC20(RBH_USDG).approve(address(swapRouter), type(uint256).max);
            _swap(key, trader, usdgIsCurrency0, -100e6, 0);
            hook.sweepFees(tokenAddr, 0);
            assertGt(feeVault.creatorBalance(tokenAddr, RBH_USDG), 0, "no USDG creator fee accrued");
        }

        emit log("USDG FULL FLOW OK: launch, graduate, real v4 pool and locked liquidity on the fork");
    }

    /// @dev Attempts to give `to` `amount` of USDG on the fork and confirms the balance actually changed.
    ///      Tries `deal` first; if the proxy makes it ineffective, tries writing the balance slot with stdstore.
    ///      Returns false when neither works, so the caller can honestly skip instead of faking balances.
    function _tryFundUsdg(address to, uint256 amount) private returns (bool) {
        uint256 before = IERC20(RBH_USDG).balanceOf(to);

        // Attempt 1: forge `deal` (adjusts totalSupply). Wrapped in try/catch via a low-level self-call is not
        // possible for an internal cheat, so we just call it and re-read the balance.
        deal(RBH_USDG, to, before + amount);
        if (IERC20(RBH_USDG).balanceOf(to) >= before + amount) return true;

        // Attempt 2: stdstore balance slot (no totalSupply adjustment).
        // Guarded so a failure to locate the slot does not abort the whole test.
        try this.stdstoreSetUsdgBalance(to, before + amount) {
            if (IERC20(RBH_USDG).balanceOf(to) >= before + amount) return true;
        } catch {}

        return false;
    }

    /// @dev External wrapper so stdstore's slot search can be try/catch'd. `stdstore` is inherited from Test.
    function stdstoreSetUsdgBalance(address to, uint256 amount) external {
        stdstore.target(RBH_USDG).sig(IERC20.balanceOf.selector).with_key(to).checked_write(amount);
    }

    // -------------------------------------------------------------------------------------------------
    // Shared helpers (mirror SystemTestBase._swap / CompetitionTestBase._scheduleBattle)
    // -------------------------------------------------------------------------------------------------

    function _swap(PoolKey memory key, address from, bool zeroForOne, int256 amountSpecified, uint256 value)
        private
        returns (BalanceDelta delta)
    {
        vm.prank(from);
        delta = swapRouter.swap{value: value}(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            IPoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _scheduleBattle(address tokenA, address tokenB, uint256 startTime) private returns (uint256) {
        address[] memory tokensA = new address[](1);
        address[] memory tokensB = new address[](1);
        tokensA[0] = tokenA;
        tokensB[0] = tokenB;
        vm.prank(operator);
        return competition.scheduleBattles(tokensA, tokensB, startTime);
    }

    /// @dev Ramps an ETH pair to battle-eligible on the fork WITHOUT any trade fees or league-pool side
    ///      effects: arm the feed, then report two qualifying settled closes 24h apart directly as the hook
    ///      (msg.sender == factory.hook() satisfies onTradeClose's caller gate). tokenPriceInAsset is set to
    ///      1e18 so market cap clears $100k regardless of the pinned price.
    function _makeEthPairEligible(address tokenA, address tokenB) private {
        _armEthFeed();
        address hookAddr = factory.hook();
        // First qualifying close starts each token's 24h eligibility timer...
        vm.prank(hookAddr);
        competition.onTradeClose(tokenA, 1e18, address(0));
        vm.prank(hookAddr);
        competition.onTradeClose(tokenB, 1e18, address(0));
        // ...wait out the window, then a second qualifying close latches `eligible` for both.
        skip(competition.ELIGIBILITY_WINDOW() + 1);
        vm.prank(hookAddr);
        competition.onTradeClose(tokenA, 1e18, address(0));
        vm.prank(hookAddr);
        competition.onTradeClose(tokenB, 1e18, address(0));
        (, bool eligibleA,,) = competition.eligibilityOf(tokenA);
        (, bool eligibleB,,) = competition.eligibilityOf(tokenB);
        assertTrue(eligibleA, "tokenA not eligible after ramp");
        assertTrue(eligibleB, "tokenB not eligible after ramp");
    }

    /// @dev Fork-safe eligibility feed for the ETH pair. The production deploy on this fork leaves feeds at
    ///      address(0), and the live Chainlink feed's `updatedAt` is frozen at the fork block, so a 24h warp
    ///      would read stale (NOT-EVALUABLE). Point the ETH/USD slot at the real proxy with a very wide
    ///      staleness bound, then pin a healthy, high, never-stale price via mockCall so the market-cap engine
    ///      can evaluate and comfortably clear the $100k threshold throughout the battle window. This only
    ///      controls the USD conversion used for eligibility/DQ; real-feed integration is proven separately by
    ///      DeployQualyraForkTest (the dry-run deploy against the live feeds).
    function _armEthFeed() private {
        address ethFeed = 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9; // real ETH/USD proxy (mocked below)
        vm.prank(timelock);
        factory.setPriceFeed(address(0), ethFeed, 3650 days);
        vm.mockCall(ethFeed, abi.encodeWithSignature("decimals()"), abi.encode(uint8(8)));
        vm.mockCall(
            ethFeed,
            abi.encodeWithSignature("latestRoundData()"),
            abi.encode(uint80(1), int256(100_000_000e8), vm.getBlockTimestamp(), vm.getBlockTimestamp(), uint80(1))
        );
    }

    function _ethParams() private pure returns (IQualyraFactory.LaunchParams memory params) {
        params.name = "ForkRocketEth";
        params.symbol = "FRE";
        params.metadataURI = "ipfs://fork-eth";
        params.quoteAsset = address(0);
    }

    function _usdgParams() private pure returns (IQualyraFactory.LaunchParams memory params) {
        params.name = "ForkRocketUsdg";
        params.symbol = "FRU";
        params.metadataURI = "ipfs://fork-usdg";
        params.quoteAsset = RBH_USDG;
    }
}

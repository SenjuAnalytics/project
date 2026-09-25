// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {SystemTestBase} from "./utils/SystemTestBase.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";

import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {MockSequencerFeed} from "./mocks/MockSequencerFeed.sol";

/// @notice Integration tests for plan §10 step 4 — the eligibility CLOSE hook wired into the two real
///         trade sites. Both phases run through the REAL QualyraCompetitionVault (set as the factory's
///         competitionVault module) so a settled trade genuinely drives `onTradeClose`:
///           - Pre-graduation: a `QualyraBondingCurve.buy()` settles a CLOSE and the curve reports it.
///           - Post-graduation: a Uniswap v4 swap settles a CLOSE and the hook's `afterSwap` reports it.
///         We assert the engine's timer starts (eligibility bookkeeping is exercised end to end). Fund
///         movement is NOT asserted here — that belongs to the later fee-routing/finalize steps.
contract QualyraCloseHookTest is SystemTestBase {
    /// @dev Monday 14 September 2026, 00:00 UTC — matches the other suites for consistency.
    uint256 internal constant MONDAY = 1_789_344_000;
    uint256 internal constant HEARTBEAT = 3_600; // 1h
    uint256 internal constant GRACE = 3_600; // 1h

    QualyraCompetitionVault internal competition;
    MockV3Aggregator internal ethUsd; // 8-dec ETH/USD feed
    MockSequencerFeed internal seq;

    function setUp() public {
        vm.warp(MONDAY);
        _deployCore();

        // The REAL competition vault is the factory's competitionVault module, so the curve and hook
        // reach the real eligibility engine through `factory.competitionVault()`.
        competition = new QualyraCompetitionVault(address(factory), makeAddr("operator"), makeAddr("guardian"));
        _initialize(address(competition), makeAddr("burner"), makeAddr("router"));

        // Sequencer up long ago (well past the grace window). Price feed is configured per-test.
        seq = new MockSequencerFeed(0, MONDAY - 10 * GRACE);
        factory.setSequencerFeed(address(seq), GRACE);
        ethUsd = new MockV3Aggregator(8, int256(2_000e8));
    }

    /// @dev A very high ETH/USD price so any realistic curve/pool spot puts market cap well above the
    ///      $100k threshold; `setAnswer` also stamps the round fresh at the current block time.
    function _configureHighFeed() internal {
        factory.setPriceFeed(address(0), address(ethUsd), HEARTBEAT); // native ETH -> ETH/USD feed
        ethUsd.setAnswer(int256(1_000_000e8));
    }

    // ---------------------------------------------------------------------------------------------
    // Phase 1 — bonding curve close
    // ---------------------------------------------------------------------------------------------

    function test_preGraduationBuy_startsEligibilityTimer() public {
        _configureHighFeed();

        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);

        // A small (non-graduating) buy settles a CLOSE; the curve reports it to the real engine.
        vm.prank(alice);
        curve.buy{value: 1 ether}(1 ether, 0, alice, vm.getBlockTimestamp());

        (uint48 firstCloseAt, bool eligible, bool disqualified,) = competition.eligibilityOf(address(token));
        assertGt(firstCloseAt, 0, "curve buy CLOSE should start the eligibility timer");
        assertEq(firstCloseAt, uint48(vm.getBlockTimestamp()));
        assertFalse(eligible, "not eligible before the 24h window elapses");
        assertFalse(disqualified);
    }

    function test_preGraduationSell_reportsClose() public {
        _configureHighFeed();

        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);

        // Buy first so alice has tokens to sell, then sell back — both closes hit the engine.
        vm.prank(alice);
        uint256 tokensOut = curve.buy{value: 2 ether}(2 ether, 0, alice, vm.getBlockTimestamp());

        vm.prank(alice);
        token.approve(address(curve), tokensOut);
        vm.prank(alice);
        curve.sell(tokensOut / 2, 0, alice, vm.getBlockTimestamp());

        (uint48 firstCloseAt,,,) = competition.eligibilityOf(address(token));
        assertGt(firstCloseAt, 0, "curve trades should have driven the engine");
    }

    /// @dev With NO price feed configured, every close is NOT-EVALUABLE, so the engine stays a no-op and
    ///      trading is never blocked (fail-safe). Proves the defensive wiring does not gate trades.
    function test_preGraduationBuy_noFeed_isNoOp_andTradeSucceeds() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);

        vm.prank(alice);
        uint256 tokensOut = curve.buy{value: 1 ether}(1 ether, 0, alice, vm.getBlockTimestamp());
        assertGt(tokensOut, 0, "buy must still succeed with no oracle configured");

        (uint48 firstCloseAt,,,) = competition.eligibilityOf(address(token));
        assertEq(firstCloseAt, 0, "no feed -> NOT-EVALUABLE -> timer never starts");
    }

    // ---------------------------------------------------------------------------------------------
    // Phase 3 — pool (hook) close
    // ---------------------------------------------------------------------------------------------

    function test_postGraduationSwap_startsEligibilityTimer() public {
        // Graduate with NO feed configured so the pre-graduation buys are NOT-EVALUABLE and leave the
        // timer untouched — this isolates the post-graduation hook as the sole cause of the timer start.
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        (uint48 firstCloseBefore,,,) = competition.eligibilityOf(address(token));
        assertEq(firstCloseBefore, 0, "no feed during graduation -> timer not started yet");

        // Now configure a high feed and swap on the graduated pool: the hook's afterSwap reports the CLOSE.
        _configureHighFeed();
        _swap(key, bob, true, -1 ether, 1 ether); // buy token with 1 ETH (exact input)

        (uint48 firstCloseAfter,,,) = competition.eligibilityOf(address(token));
        assertGt(firstCloseAfter, 0, "hook swap CLOSE should start the eligibility timer");
    }
}

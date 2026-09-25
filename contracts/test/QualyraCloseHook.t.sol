// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {SystemTestBase} from "./utils/SystemTestBase.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";

import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {MockSequencerFeed} from "./mocks/MockSequencerFeed.sol";

/// @notice How trades reach the eligibility engine. Only the pool hook reports, with the pool's time-weighted
///         price, and only once that average has a full window of history. Bonding curve trades don't report.
///         Everything runs through the real QualyraCompetitionVault set as the factory's competitionVault module.
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

        competition = new QualyraCompetitionVault(address(factory), makeAddr("operator"), makeAddr("guardian"));
        _initialize(address(competition), makeAddr("burner"), makeAddr("router"));

        // Sequencer up long ago (well past the grace window). Price feed is configured per-test.
        seq = new MockSequencerFeed(0, MONDAY - 10 * GRACE);
        factory.setSequencerFeed(address(seq), GRACE);
        ethUsd = new MockV3Aggregator(8, int256(2_000e8));
    }

    /// @dev A very high ETH/USD price so any realistic curve/pool price puts market cap well above the $100k
    ///      threshold; `setAnswer` also stamps the round fresh at the current block time.
    function _configureHighFeed() internal {
        factory.setPriceFeed(address(0), address(ethUsd), HEARTBEAT); // native ETH -> ETH/USD feed
        ethUsd.setAnswer(int256(1_000_000e8));
    }

    function _firstCloseAt(address token) internal view returns (uint48 firstCloseAt) {
        (firstCloseAt,,,) = competition.eligibilityOf(token);
    }

    /// @dev Start of the first window in which the average of a pool created at `createdAt` is ready.
    function _averageReadyAt(uint256 createdAt) internal view returns (uint256) {
        uint256 window = hook.TWAP_WINDOW();
        return (createdAt / window + 2) * window;
    }

    function test_curveTrades_leaveEligibilityAlone() public {
        _configureHighFeed();
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);

        vm.prank(alice);
        uint256 tokensOut = curve.buy{value: 2 ether}(2 ether, 0, alice, vm.getBlockTimestamp());
        vm.prank(alice);
        token.approve(address(curve), tokensOut);
        vm.prank(alice);
        curve.sell(tokensOut / 2, 0, alice, vm.getBlockTimestamp());

        assertEq(_firstCloseAt(address(token)), 0, "the curve doesn't report");
    }

    function test_poolSwaps_reportOnceTheAverageIsReady() public {
        _configureHighFeed();
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);
        uint256 readyAt = _averageReadyAt(vm.getBlockTimestamp());

        _swap(key, bob, true, -1 ether, 1 ether);
        assertEq(_firstCloseAt(address(token)), 0, "no report while the average warms up");

        vm.warp(readyAt - 1);
        ethUsd.setAnswer(int256(1_000_000e8));
        _swap(key, bob, true, -0.1 ether, 0.1 ether);
        assertEq(_firstCloseAt(address(token)), 0, "still one second short");

        vm.warp(readyAt);
        ethUsd.setAnswer(int256(1_000_000e8));
        _swap(key, bob, true, -0.1 ether, 0.1 ether);
        assertEq(_firstCloseAt(address(token)), uint48(readyAt), "the first report starts the timer");
    }

    function test_theReportCarriesTheAverage_notThePriceTheSwapLeft() public {
        _configureHighFeed();
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);
        vm.warp(_averageReadyAt(vm.getBlockTimestamp()) + 10 minutes);
        ethUsd.setAnswer(int256(1_000_000e8));

        (uint256 average, bool ready,) = hook.twapOf(address(token));
        assertTrue(ready);
        // A large buy moves the pool price a long way; the vault still gets the average from before it.
        vm.expectCall(
            address(competition), abi.encodeCall(competition.onTradeClose, (address(token), average, address(0)))
        );
        _swap(key, bob, true, -5 ether, 5 ether);

        (uint256 averageAfter,,) = hook.twapOf(address(token));
        assertEq(averageAfter, average, "the new price carries no weight until time passes");
    }

    /// @dev With NO price feed configured, every report is NOT-EVALUABLE, so the engine stays a no-op and
    ///      trading is never blocked (fail-safe).
    function test_noFeed_isNoOp_andSwapsSucceed() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);
        vm.warp(_averageReadyAt(vm.getBlockTimestamp()));

        _swap(key, bob, true, -1 ether, 1 ether);
        assertEq(_firstCloseAt(address(token)), 0, "no feed -> NOT-EVALUABLE -> timer never starts");
    }
}

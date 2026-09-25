// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {QualyraFactory} from "../src/QualyraFactory.sol";
import {QualyraLaunchDeployer} from "../src/QualyraLaunchDeployer.sol";
import {QualyraFeeVault} from "../src/QualyraFeeVault.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCompetitionVault} from "./mocks/MockCompetitionVault.sol";
import {MockGraduationExecutor} from "./mocks/MockGraduationExecutor.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {MockSequencerFeed} from "./mocks/MockSequencerFeed.sol";

/// @notice Unit tests for the additive eligibility ENGINE STATE MACHINE on QualyraCompetitionVault
///         (plan §10 step 3a). These cover ONLY the close-based bookkeeping in `onTradeClose` /
///         `_marketCapUsd`: timer start, 24h eligibility, permanent disqualification, the fail-safe
///         no-op on oracle problems, the worked-example market-cap math, and access control.
///
///         The engine is exercised through a REAL QualyraFactory so `priceFeedOf`, `heartbeatOf`,
///         `sequencerUptimeFeed`, `sequencerGracePeriod`, `quoteAssetConfig(...).decimals` and `hook()` all
///         resolve exactly as in production. The factory's hook module is a plain address pranked as the only
///         trade source; the launch's real curve is kept to show it is rejected.
///
///         NO fund movement is asserted here — this step only sets flags and emits events.
contract QualyraEligibilityTest is Test {
    /// @dev Monday 14 September 2026, 00:00 UTC — matches CompetitionTestBase for consistency.
    uint256 internal constant MONDAY = 1_789_344_000;

    uint256 internal constant HEARTBEAT = 3_600; // 1h
    uint256 internal constant GRACE = 3_600; // 1h
    uint256 internal constant MC_THRESHOLD_USD = 100_000e18;
    uint256 internal constant ELIGIBILITY_WINDOW = 24 hours;
    uint256 internal constant DQ_DWELL = 30 minutes;

    // Local copies of the engine events so vm.expectEmit can match them by signature.
    event EligibilityTimerStarted(address indexed token, uint256 mcUsd, uint48 at);
    event TokenEligible(address indexed token, uint48 at);
    event TokenDisqualified(address indexed token, bool booked, uint256 mcUsd, uint48 at);

    QualyraFactory internal factory;
    QualyraLaunchDeployer internal deployer;
    QualyraFeeVault internal feeVault;
    MockCompetitionVault internal mockCompetition;
    MockGraduationExecutor internal executor;
    QualyraCompetitionVault internal competition;

    MockV3Aggregator internal ethUsd; // 8-dec Chainlink-style ETH/USD feed
    MockSequencerFeed internal seq;

    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal hook = makeAddr("hook");
    address internal stranger = makeAddr("stranger");

    // A launch token and its registered curve.
    MockERC20 internal token;
    address internal curve;

    function setUp() public {
        vm.warp(MONDAY);

        factory = new QualyraFactory(address(this));
        deployer = new QualyraLaunchDeployer(address(factory));
        feeVault = new QualyraFeeVault(address(factory), treasury);
        mockCompetition = new MockCompetitionVault();
        executor = new MockGraduationExecutor(address(factory));

        factory.initialize(
            QualyraFactory.Modules({
                deployer: address(deployer),
                feeVault: address(feeVault),
                competitionVault: address(mockCompetition),
                graduationExecutor: address(executor),
                hook: hook,
                liquidityLocker: makeAddr("locker"),
                buybackBurner: makeAddr("burner"),
                launchRouter: makeAddr("router")
            })
        );
        factory.setQuoteAsset(address(0), 1.68 ether, 4.2 ether, 18);

        // The unit-under-test vault reads the SAME factory registry.
        competition = new QualyraCompetitionVault(address(factory), makeAddr("operator"), makeAddr("guardian"));

        // ETH/USD = $2,000 on an 8-dec feed; sequencer up long ago (well past the grace window).
        ethUsd = new MockV3Aggregator(8, int256(2_000e8));
        seq = new MockSequencerFeed(0, MONDAY - 10 * GRACE);
        factory.setSequencerFeed(address(seq), GRACE);
        factory.setPriceFeed(address(0), address(ethUsd), HEARTBEAT); // native ETH -> ETH/USD feed

        // Register a real launch so the token and its curve exist as in production.
        (address launchToken, address launchCurve) = _launch();
        token = MockERC20(launchToken);
        curve = launchCurve;
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    function _launch() internal returns (address launchToken, address launchCurve) {
        IQualyraFactory.LaunchParams memory params;
        params.name = "Rocket";
        params.symbol = "RKT";
        params.metadataURI = "ipfs://rocket";
        params.quoteAsset = address(0);

        uint256 fee = factory.launchFee();
        vm.deal(creator, fee);
        vm.prank(creator);
        (launchToken, launchCurve) = factory.launchToken{value: fee}(params);
    }

    /// @dev Calls onTradeClose as the pool hook, the only authorised reporter.
    function _close(uint256 tokenPriceInAsset) internal {
        vm.prank(hook);
        competition.onTradeClose(address(token), tokenPriceInAsset, address(0));
    }

    /// @dev Moves time forward and keeps the ETH/USD answer fresh, as a live feed would be.
    function _skipFresh(uint256 duration) internal {
        skip(duration);
        ethUsd.setUpdatedAt(vm.getBlockTimestamp());
    }

    function _eligibility(address t)
        internal
        view
        returns (uint48 firstCloseAt, bool eligible, bool disqualified, uint48 disqualifiedAt)
    {
        (firstCloseAt, eligible, disqualified, disqualifiedAt) = competition.eligibilityOf(t);
    }

    // ---------------------------------------------------------------------------------------------
    // STEP 2 — market-cap decimal math (worked example)
    // ---------------------------------------------------------------------------------------------

    /// @notice Worked example from the plan: ETH/USD $2000 (8dec), asset ETH (18dec),
    ///         tokenPriceInAsset = 1e12 (0.000001 ETH), supply 1e27 wei -> mcUsd = 2_000_000e18.
    ///         Observed indirectly: this is >= threshold, so the FIRST close starts the timer and the
    ///         emitted EligibilityTimerStarted carries the exact mcUsd of 2_000_000e18.
    function test_marketCap_workedExample_startsTimerAtExactMc() public {
        // supply already fixed at launch (1e9 tokens = 1e27 wei); assert the assumption first.
        assertEq(token.totalSupply(), 1_000_000_000e18, "launch supply is 1e27 wei");

        vm.expectEmit(true, true, true, true, address(competition));
        emit EligibilityTimerStarted(address(token), 2_000_000e18, uint48(vm.getBlockTimestamp()));
        _close(1e12);

        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        assertEq(firstCloseAt, uint48(vm.getBlockTimestamp()), "timer stamped at this close");
    }

    // ---------------------------------------------------------------------------------------------
    // STEP 3 — state machine: timer / eligibility
    // ---------------------------------------------------------------------------------------------

    function test_firstClose_belowThreshold_doesNotStartTimer() public {
        // tokenPriceInAsset = 1e6 -> tokenUsd = mulDiv(1e6, 2000e18, 1e18) = 2e9;
        // mc = mulDiv(2e9, 1e27, 1e18) = 2e18 = $2 << $100k threshold.
        _close(1e6);
        (uint48 firstCloseAt, bool eligible, bool disqualified,) = _eligibility(address(token));
        assertEq(firstCloseAt, 0, "no timer below threshold");
        assertFalse(eligible);
        assertFalse(disqualified);
    }

    function test_timerStarts_thenEligibleAfter24h() public {
        // First qualifying close starts the timer.
        _close(1e12);
        (uint48 firstCloseAt, bool eligible,,) = _eligibility(address(token));
        assertEq(firstCloseAt, uint48(vm.getBlockTimestamp()));
        assertFalse(eligible, "not eligible immediately");

        // A qualifying close still inside the window does NOT flip eligibility.
        // A real trade close carries a fresh oracle price, so refresh the feed to `now` after warping
        // (otherwise the price is older than the heartbeat and the fail-safe correctly no-ops).
        skip(ELIGIBILITY_WINDOW - 1);
        ethUsd.setUpdatedAt(vm.getBlockTimestamp());
        _close(1e12);
        (, eligible,,) = _eligibility(address(token));
        assertFalse(eligible, "still not eligible before 24h elapse");

        // At exactly firstCloseAt + 24h (and still >= threshold) it becomes eligible.
        vm.warp(uint256(firstCloseAt) + ELIGIBILITY_WINDOW);
        ethUsd.setUpdatedAt(vm.getBlockTimestamp());
        vm.expectEmit(true, true, true, true, address(competition));
        emit TokenEligible(address(token), uint48(vm.getBlockTimestamp()));
        _close(1e12);
        (, eligible,,) = _eligibility(address(token));
        assertTrue(eligible, "eligible after full 24h window");
    }

    function test_dropBelowThresholdInWindow_disqualifiesPermanently() public {
        // Start the timer.
        _close(1e12);
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        assertGt(firstCloseAt, 0);

        // Later (still inside the window, not eligible yet) MC drops below the threshold and stays there.
        skip(1 hours);
        _close(1e6); // mc = $2
        uint48 droppedAt = uint48(vm.getBlockTimestamp());
        assertEq(competition.belowThresholdSince(address(token)), droppedAt);
        (,, bool disqualifiedYet,) = _eligibility(address(token));
        assertFalse(disqualifiedYet, "one report below the threshold is not enough");

        _skipFresh(DQ_DWELL);
        vm.expectEmit(true, true, true, true, address(competition));
        emit TokenDisqualified(address(token), false, 2e18, droppedAt);
        _close(1e6);

        (, bool eligible, bool disqualified, uint48 disqualifiedAt) = _eligibility(address(token));
        assertTrue(disqualified, "disqualified");
        assertFalse(eligible);
        assertEq(disqualifiedAt, droppedAt, "dated from the drop, not from the report that confirmed it");

        // Subsequent qualifying closes even after 24h must NOT re-eligible a disqualified token.
        vm.warp(uint256(firstCloseAt) + ELIGIBILITY_WINDOW + 1 days);
        ethUsd.setUpdatedAt(vm.getBlockTimestamp());
        _close(1e12); // back above threshold
        (, bool eligibleAfter, bool stillDq,) = _eligibility(address(token));
        assertTrue(stillDq, "disqualification is permanent");
        assertFalse(eligibleAfter, "never becomes eligible after DQ");
    }

    function test_aDropEndsOnlyOnceTheThresholdHeldForTheDwell() public {
        _close(1e12);
        _skipFresh(1 hours);
        _close(1e6);
        uint48 droppedAt = uint48(vm.getBlockTimestamp());
        _skipFresh(DQ_DWELL - 1);
        _close(1e6); // still below, one second short of the dwell
        (,, bool disqualified,) = _eligibility(address(token));
        assertFalse(disqualified);

        _close(1e12); // back above, but the drop isn't over yet
        assertEq(competition.belowThresholdSince(address(token)), droppedAt);
        _skipFresh(DQ_DWELL);
        _close(1e12); // held the threshold for DQ_DWELL: now it is
        assertEq(competition.belowThresholdSince(address(token)), 0);

        _skipFresh(1 hours);
        _close(1e6); // a new drop starts its own clock
        (,, disqualified,) = _eligibility(address(token));
        assertFalse(disqualified, "the clock restarted with the new drop");
        assertEq(competition.belowThresholdSince(address(token)), uint48(vm.getBlockTimestamp()));
    }

    /// @notice Pushing the price back above the threshold for a few minutes doesn't reset the clock.
    function test_aShortRecovery_doesNotEndTheDrop() public {
        _close(1e12);
        _skipFresh(1 hours);
        _close(1e6);
        uint48 droppedAt = uint48(vm.getBlockTimestamp());
        _skipFresh(5 minutes);
        _close(1e12);
        _skipFresh(DQ_DWELL - 5 minutes);
        _close(1e6);

        (,, bool disqualified, uint48 disqualifiedAt) = _eligibility(address(token));
        assertTrue(disqualified);
        assertEq(disqualifiedAt, droppedAt);
    }

    function test_shortDropInsideTheWindow_stillBecomesEligible() public {
        _close(1e12);
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        _skipFresh(6 hours);
        _close(1e6);
        _skipFresh(10 minutes);
        _close(1e12);

        vm.warp(uint256(firstCloseAt) + ELIGIBILITY_WINDOW);
        ethUsd.setUpdatedAt(vm.getBlockTimestamp());
        _close(1e12);
        (, bool eligible, bool disqualified,) = _eligibility(address(token));
        assertTrue(eligible);
        assertFalse(disqualified);
    }

    function test_eligibleToken_thatStaysBelow_isDisqualified() public {
        _close(1e12);
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        vm.warp(uint256(firstCloseAt) + ELIGIBILITY_WINDOW);
        ethUsd.setUpdatedAt(vm.getBlockTimestamp());
        _close(1e12);
        (, bool eligible,,) = _eligibility(address(token));
        assertTrue(eligible);

        // Queued and waiting for a booking, it still has to hold the threshold.
        _skipFresh(2 days);
        _close(1e6);
        _skipFresh(DQ_DWELL);
        _close(1e6);
        (,, bool disqualified,) = _eligibility(address(token));
        assertTrue(disqualified);
    }

    // ---------------------------------------------------------------------------------------------
    // Fail-safe: oracle problems make onTradeClose a no-op (no state change, no revert)
    // ---------------------------------------------------------------------------------------------

    function test_failSafe_sequencerDown_isNoOp() public {
        seq.setStatus(1, vm.getBlockTimestamp() - 10 * GRACE); // sequencer DOWN
        _close(1e12); // qualifying price, but not evaluable
        (uint48 firstCloseAt, bool eligible, bool disqualified,) = _eligibility(address(token));
        assertEq(firstCloseAt, 0, "no timer when sequencer down");
        assertFalse(eligible);
        assertFalse(disqualified);
    }

    function test_failSafe_sequencerInGracePeriod_isNoOp() public {
        // Recovered just now: within grace -> not trusted yet.
        seq.setStatus(0, vm.getBlockTimestamp());
        _close(1e12);
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        assertEq(firstCloseAt, 0, "no timer inside grace window");
    }

    function test_failSafe_stalePrice_isNoOp() public {
        ethUsd.setUpdatedAt(vm.getBlockTimestamp() - HEARTBEAT - 1); // past heartbeat
        _close(1e12);
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        assertEq(firstCloseAt, 0, "no timer on stale price");
    }

    function test_failSafe_pausedFeed_isNoOp() public {
        ethUsd.setPaused(true);
        _close(1e12);
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        assertEq(firstCloseAt, 0, "no timer when feed paused");
    }

    function test_failSafe_unconfiguredFeed_isNoOp() public {
        factory.setPriceFeed(address(0), address(0), 0); // unset the ETH feed
        _close(1e12);
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        assertEq(firstCloseAt, 0, "no timer when feed unconfigured");
    }

    /// @notice Once a token disqualifies, onTradeClose returns early (permanent) — even with a good price.
    function test_disqualified_isPermanent_earlyReturn() public {
        _close(1e12); // timer
        skip(1 hours);
        _close(1e6); // below
        _skipFresh(DQ_DWELL);
        _close(1e6); // DQ
        (,, bool disqualified,) = _eligibility(address(token));
        assertTrue(disqualified);

        // No revert, no state change on a later qualifying close.
        skip(2 days);
        _close(1e12);
        (, bool eligible, bool stillDq,) = _eligibility(address(token));
        assertTrue(stillDq);
        assertFalse(eligible);
    }

    // ---------------------------------------------------------------------------------------------
    // Access control
    // ---------------------------------------------------------------------------------------------

    function test_accessControl_randomCaller_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(QualyraCompetitionVault.NotTradeSource.selector);
        competition.onTradeClose(address(token), 1e12, address(0));
    }

    function test_accessControl_hookIsAllowed() public {
        // The configured hook() is also an authorised trade source.
        vm.prank(hook);
        competition.onTradeClose(address(token), 1e12, address(0));
        (uint48 firstCloseAt,,,) = _eligibility(address(token));
        assertEq(firstCloseAt, uint48(vm.getBlockTimestamp()), "hook may start the timer");
    }

    /// @notice Curve trades don't report: eligibility runs on the pool's time-weighted price only.
    function test_accessControl_curveIsRejected() public {
        vm.prank(curve);
        vm.expectRevert(QualyraCompetitionVault.NotTradeSource.selector);
        competition.onTradeClose(address(token), 1e12, address(0));
    }
}

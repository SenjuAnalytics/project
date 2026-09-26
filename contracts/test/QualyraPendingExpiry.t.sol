// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";

import {MockSuccessor} from "./mocks/MockSuccessor.sol";

/// @dev A token that goes PENDING_EXPIRY after launch without starting its eligibility timer stops parking a
///      battle share: the next fee sends what it parked to the treasury, and later battle shares go there directly.
///      A timer that starts but never resolves (no second qualifying close, no disqualification) has its own limit,
///      UNRESOLVED_PENDING_GRACE after launch, so a quiet market cannot park fees forever either.
contract QualyraPendingExpiryTest is CompetitionTestBase {
    // Local copy of the vault event so vm.expectEmit can match it by signature.
    event PendingBattlePotDrained(address indexed token, address indexed asset, uint256 amount);

    /// @dev Slices of a 1 ETH trade: 1% fee, 15% platform, 15% competition split 70% battle / 30% league.
    uint256 internal constant PLATFORM = 0.0015 ether;
    uint256 internal constant BATTLE_SHARE = 0.00105 ether;
    uint256 internal constant LEAGUE_SHARE = 0.00045 ether;

    QualyraLaunchToken internal token;
    QualyraBondingCurve internal curve;
    uint256 internal expiresAt;

    function setUp() public {
        _deploySystem();
        // A $1 ETH keeps every close far below $100k, so the eligibility timer never starts on its own.
        ethUsd.setAnswer(1e8);
        (token, curve) = _launch(address(0), 0);
        expiresAt = vm.getBlockTimestamp() + competition.PENDING_EXPIRY();
        skip(1 minutes); // past the snipe window
    }

    function test_expiry_isThirtyDaysAfterLaunch() public view {
        assertEq(competition.PENDING_EXPIRY(), 30 days);
        assertEq(expiresAt, factory.getLaunch(address(token)).launchedAt + 30 days);
    }

    function test_beforeExpiry_theBattleShareIsParked() public {
        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), BATTLE_SHARE);
        assertFalse(competition.isPendingExpired(address(token)));

        vm.warp(expiresAt - 1);
        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), 2 * BATTLE_SHARE);
        assertFalse(competition.isPendingExpired(address(token)));
    }

    function test_afterExpiry_theNextFeeReleasesWhatWasParked() public {
        _buy(1 ether);
        vm.warp(expiresAt);
        assertTrue(competition.isPendingExpired(address(token)));

        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        uint256 leagueBefore = competition.bootstrapPool(address(0));
        vm.expectEmit(true, true, true, true, address(competition));
        emit PendingBattlePotDrained(address(token), address(0), BATTLE_SHARE);
        _buy(1 ether);

        // This trade's battle share and the parked one both land in the treasury; the league keeps its slice.
        assertEq(competition.pendingBattlePot(address(token), address(0)), 0);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, PLATFORM + 2 * BATTLE_SHARE);
        assertEq(competition.bootstrapPool(address(0)) - leagueBefore, LEAGUE_SHARE);

        // From here on nothing is parked at all.
        treasuryBefore = feeVault.treasuryBalance(address(0));
        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), 0);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, PLATFORM + BATTLE_SHARE);
    }

    function test_releaseExpiredPending_isOpenToAnyoneOnceExpired() public {
        _buy(1 ether);

        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.PendingNotExpired.selector, address(token)));
        competition.releaseExpiredPending(address(token), address(0));

        // The token never trades again, so no fee triggers the release. Anyone can.
        vm.warp(expiresAt);
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        vm.prank(bob);
        competition.releaseExpiredPending(address(token), address(0));

        assertEq(competition.pendingBattlePot(address(token), address(0)), 0);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, BATTLE_SHARE);
        assertEq(address(competition).balance, competition.accounted(address(0)));

        // Nothing is left, so a second call is a no-op.
        competition.releaseExpiredPending(address(token), address(0));
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, BATTLE_SHARE);
    }

    function test_aTokenThatStartedItsTimer_waitsInsideTheUnresolvedGrace() public {
        _buy(1 ether);
        _startTimer();
        vm.warp(expiresAt + 1 days);
        assertFalse(competition.isPendingExpired(address(token)));

        // Still Phase 1: the battle share keeps waiting for the token's battle.
        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), 2 * BATTLE_SHARE);

        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.PendingNotExpired.selector, address(token)));
        competition.releaseExpiredPending(address(token), address(0));
    }

    /// @notice A timer that started but never resolved is not a permanent parking spot either: after
    ///         UNRESOLVED_PENDING_GRACE the pending pot goes to the treasury like any other unreachable battle share.
    function test_aTimerThatNeverResolves_expiresAfterTheUnresolvedGrace() public {
        _buy(1 ether);
        _startTimer();
        uint256 unresolvedAt = expiresAt + competition.UNRESOLVED_PENDING_GRACE();

        vm.warp(unresolvedAt - 1);
        assertFalse(competition.isPendingExpired(address(token)), "the grace is still running");

        vm.warp(unresolvedAt);
        assertTrue(competition.isPendingExpired(address(token)), "the timer never resolved: stop waiting");

        // No fee will ever trigger the release for a token nobody trades, so anyone can.
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        vm.prank(bob);
        competition.releaseExpiredPending(address(token), address(0));
        assertEq(competition.pendingBattlePot(address(token), address(0)), 0);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, BATTLE_SHARE);
    }

    function test_aTimerStartedAfterExpiry_parksAgain() public {
        _buy(1 ether);
        vm.warp(expiresAt);
        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), 0);

        // The token takes off late: from its first qualifying close it builds a battle pot again.
        _startTimer();
        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), BATTLE_SHARE);
    }

    function test_poolFees_followTheSameRuleWhenSwept() public {
        (QualyraLaunchToken pooled,, PoolKey memory key) = _graduatedEthLaunch(0);
        uint256 expiry = factory.getLaunch(address(pooled)).launchedAt + competition.PENDING_EXPIRY();
        uint256 parked = competition.pendingBattlePot(address(pooled), address(0));
        assertGt(parked, 0); // the curve's battle share from before graduation

        _swap(key, bob, true, -1 ether, 1 ether);
        vm.warp(expiry);

        // Pool fees route when the hook is swept, so the sweep applies the expiry.
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        hook.sweepFees(address(pooled), 0);

        assertEq(competition.pendingBattlePot(address(pooled), address(0)), 0);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, PLATFORM + BATTLE_SHARE + parked);
    }

    function test_theReleaseKeepsWorkingWhileTheVaultIsPaused() public {
        _buy(1 ether);
        vm.warp(expiresAt);
        vm.prank(guardian);
        competition.pause();

        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), 0);
    }

    function test_aFailedReleaseNeverBlocksTrading() public {
        _buy(1 ether);
        vm.warp(expiresAt);
        vm.prank(guardian);
        competition.pause();
        competition.migrate(address(new MockSuccessor()));
        competition.sweepToSuccessor(address(0));

        // The release reverts inside (the vault migrated away), the trade still goes through and the parked
        // amount stays on record for the successor.
        _buy(1 ether);
        assertEq(competition.pendingBattlePot(address(token), address(0)), BATTLE_SHARE);
    }

    function _buy(uint256 amount) internal {
        vm.prank(alice);
        curve.buy{value: amount}(amount, 0, alice, vm.getBlockTimestamp());
    }

    /// @dev A qualifying report from the pool hook starts the timer, as a real trade above $100k would.
    function _startTimer() internal {
        _refreshEligibilityFeeds(); // back to the test's high ETH price, so the close clears $100k
        vm.prank(factory.hook());
        competition.onTradeClose(address(token), ELIG_PRICE, address(0));
        (uint48 firstCloseAt,,,) = competition.eligibilityOf(address(token));
        assertGt(firstCloseAt, 0);
    }
}

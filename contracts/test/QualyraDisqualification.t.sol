// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Vm} from "forge-std/Vm.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";

/// @dev From the start of its timer until its battle is over, a token may not stay below the $100k threshold for
///      DQ_DWELL. These tests cover such a drop in each stage of that stretch and after it, and where the token's
///      money goes.
contract QualyraDisqualificationTest is CompetitionTestBase {
    bytes32 internal constant TOKEN_DISQUALIFIED = keccak256("TokenDisqualified(address,bool,uint256,uint48)");

    QualyraLaunchToken internal tokenA;
    QualyraLaunchToken internal tokenB;
    PoolKey internal keyA;

    function setUp() public {
        _deploySystem();
        (tokenA,, keyA) = _graduatedEthLaunch(0);
        (tokenB,,) = _graduatedEthLaunch(0);
        _makeEligible(address(tokenA));
        _makeEligible(address(tokenB));
    }

    /// @dev The hook reports a market cap far below the threshold, then again once DQ_DWELL has passed. Returns
    ///      whether that disqualified the token, and the event's `booked`.
    function _drop(address token) internal returns (bool disqualified, bool booked) {
        _reportFarBelow(token);
        skip(competition.DQ_DWELL());
        vm.recordLogs();
        _reportFarBelow(token);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == TOKEN_DISQUALIFIED && address(uint160(uint256(logs[i].topics[1]))) == token) {
                (booked,,) = abi.decode(logs[i].data, (bool, uint256, uint48));
                return (true, booked);
            }
        }
    }

    function _reportFarBelow(address token) internal {
        _refreshEligibilityFeeds();
        vm.prank(factory.hook());
        competition.onTradeClose(token, 1, address(0));
    }

    function _reportAbove(address token) internal {
        _refreshEligibilityFeeds();
        vm.prank(factory.hook());
        competition.onTradeClose(token, ELIG_PRICE, address(0));
    }

    function _forcedOutcome(uint256 battleId) internal view returns (QualyraCompetitionVault.Outcome) {
        return competition.forcedOutcomeOf(battleId);
    }

    function _isDisqualified(address token) internal view returns (bool disqualified) {
        (,, disqualified,) = competition.eligibilityOf(token);
    }

    function _pending(address token) internal view returns (uint256) {
        return competition.pendingBattlePot(token, address(0));
    }

    function test_queuedToken_drop_disqualifiesIt_andSendsItsPendingPotToTreasury() public {
        _swap(keyA, bob, true, -1 ether, 1 ether);
        hook.sweepFees(address(tokenA), 0);
        uint256 pending = _pending(address(tokenA));
        assertGt(pending, 0);
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));

        (bool disqualified, bool booked) = _drop(address(tokenA));

        assertTrue(disqualified);
        assertFalse(booked);
        assertEq(_pending(address(tokenA)), 0);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, pending);
    }

    function test_bookedToken_dropBeforeStart_losesTheBattle() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);

        (bool disqualified, bool booked) = _drop(address(tokenA));
        assertTrue(disqualified);
        assertTrue(booked);

        vm.warp(start + competition.BATTLE_DURATION());
        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.9e18, 0.1e18);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.DisqualifiedA, 0, 0);
        skip(competition.BATTLE_CHALLENGE_PERIOD());
        competition.finalizeBattle(battleId);

        assertEq(_funded(battleId, address(tokenA)), 0);
        assertEq(_funded(battleId, address(tokenB)), competition.getBattle(battleId).pot);
    }

    function test_dropAfterTheBattleEnded_changesNothing() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 1 hours);
        _swap(keyA, bob, true, -5 ether, 5 ether);
        vm.warp(start + competition.BATTLE_DURATION());

        (bool disqualified,) = _drop(address(tokenA));
        assertFalse(disqualified);
        assertFalse(_isDisqualified(address(tokenA)));
        assertEq(competition.belowThresholdSince(address(tokenA)), 0, "the vault no longer looks at it");
        assertTrue(_forcedOutcome(battleId) == QualyraCompetitionVault.Outcome.None);

        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.9e18, 0.1e18);
        skip(competition.BATTLE_CHALLENGE_PERIOD());
        competition.finalizeBattle(battleId);
        assertEq(_funded(battleId, address(tokenA)), competition.getBattle(battleId).pot);
    }

    function test_aTokenInADrop_cannotBeBooked() public {
        _reportFarBelow(address(tokenA));
        uint256 start = _nextMidnight();
        address[] memory tokensA = new address[](1);
        address[] memory tokensB = new address[](1);
        tokensA[0] = address(tokenA);
        tokensB[0] = address(tokenB);
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.NotEligible.selector, address(tokenA)));
        competition.scheduleBattles(tokensA, tokensB, start);

        // Once the market cap has held the threshold for DQ_DWELL, the drop is over and the booking goes through.
        _reportAbove(address(tokenA));
        skip(competition.DQ_DWELL());
        _reportAbove(address(tokenA));
        assertEq(competition.belowThresholdSince(address(tokenA)), 0);
        _scheduleBattle(address(tokenA), address(tokenB), start);
    }

    function test_aDropThatRanItsCourseByTheEnd_countsWithoutAConfirmingTrade() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 end = start + competition.BATTLE_DURATION();
        vm.warp(end - competition.DQ_DWELL());
        _reportFarBelow(address(tokenA)); // and no trade after it
        assertFalse(_isDisqualified(address(tokenA)));

        vm.warp(end);
        assertTrue(_forcedOutcome(battleId) == QualyraCompetitionVault.Outcome.DisqualifiedA);
        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.9e18, 0.1e18);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.DisqualifiedA, 0, 0);
    }

    function test_aDropTooShortByTheEnd_orARecoveryInProgress_doesNotCount() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 end = start + competition.BATTLE_DURATION();

        // tokenB drops an hour before the end and is back above when it ends.
        vm.warp(end - 1 hours);
        _reportFarBelow(address(tokenB));
        vm.warp(end - 40 minutes);
        _reportAbove(address(tokenB));
        // tokenA drops one minute too late for the dwell to run out.
        vm.warp(end - competition.DQ_DWELL() + 1 minutes);
        _reportFarBelow(address(tokenA));

        vm.warp(end);
        assertTrue(_forcedOutcome(battleId) == QualyraCompetitionVault.Outcome.None);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.9e18, 0.1e18);
    }

    function test_dropLongAfterTheBattleSettled_changesNothing() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + competition.BATTLE_DURATION());
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.9e18, 0.1e18);
        skip(competition.BATTLE_CHALLENGE_PERIOD());
        competition.finalizeBattle(battleId);

        skip(30 days);
        (bool disqualified,) = _drop(address(tokenA));
        assertFalse(disqualified);
        assertFalse(_isDisqualified(address(tokenA)));
    }

    function test_cancelAfterADrop_sendsTheDroppedSideToTreasury() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 seedA = competition.contributionOf(battleId, address(tokenA));
        uint256 seedB = competition.contributionOf(battleId, address(tokenB));
        assertGt(seedA, 0);
        _drop(address(tokenA));
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));

        vm.prank(guardian);
        competition.cancelBattle(battleId);

        assertEq(_pending(address(tokenA)), 0, "nothing left behind for a token that can't battle");
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, seedA);
        assertEq(_pending(address(tokenB)), seedB, "the other token gets its share back");
        assertFalse(competition.hasBattled(address(tokenB)));
    }

    function test_cancelledToken_isQueuedAgain_andAnotherDropDisqualifiesIt() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 seedA = competition.contributionOf(battleId, address(tokenA));
        vm.prank(guardian);
        competition.cancelBattle(battleId);
        assertEq(_pending(address(tokenA)), seedA);
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));

        (bool disqualified, bool booked) = _drop(address(tokenA));

        assertTrue(disqualified);
        assertFalse(booked);
        assertEq(_pending(address(tokenA)), 0);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, seedA);
    }
}

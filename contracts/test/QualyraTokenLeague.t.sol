// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraBuybackBurner} from "../src/QualyraBuybackBurner.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";

import {MockSuccessor} from "./mocks/MockSuccessor.sol";

contract QualyraTokenLeagueTest is CompetitionTestBase {
    QualyraLaunchToken internal tokenA;
    QualyraLaunchToken internal tokenB;
    PoolKey internal keyA;
    PoolKey internal keyB;

    function setUp() public {
        _deploySystem();
        (tokenA,, keyA) = _graduatedEthLaunch(0);
        (tokenB,, keyB) = _graduatedEthLaunch(0);
        // Spec §2.1: tokens must be eligible (MC ≥ $100k held 24h) before they can be scheduled to battle.
        _makeEligible(address(tokenA));
        _makeEligible(address(tokenB));
    }

    // ---------------------------------------------------------------------------------------------
    // Scheduling
    // ---------------------------------------------------------------------------------------------

    function test_schedule_isActiveOnlyDuringTheBattle() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);

        assertEq(battleId, 1);
        QualyraCompetitionVault.Battle memory battle = competition.getBattle(battleId);
        assertEq(battle.tokenA, address(tokenA));
        assertEq(battle.tokenB, address(tokenB));
        assertEq(battle.asset, address(0));
        assertEq(battle.startTime, start);

        assertEq(competition.activeBattleOf(address(tokenA)), 0);
        vm.warp(start);
        assertEq(competition.activeBattleOf(address(tokenA)), battleId);
        assertEq(competition.activeBattleOf(address(tokenB)), battleId);
        vm.warp(start + 24 hours - 1);
        assertEq(competition.activeBattleOf(address(tokenA)), battleId);
        vm.warp(start + 24 hours);
        assertEq(competition.activeBattleOf(address(tokenA)), 0);
    }

    function test_schedule_rejectsInvalidInput() public {
        uint256 start = _nextMidnight();
        address[] memory one = new address[](1);
        address[] memory two = new address[](2);

        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.scheduleBattles(one, one, start);

        vm.prank(operator);
        vm.expectRevert(QualyraCompetitionVault.InvalidInput.selector);
        competition.scheduleBattles(one, two, start);

        vm.expectRevert(QualyraCompetitionVault.InvalidStartTime.selector);
        _scheduleBattle(address(tokenA), address(tokenB), vm.getBlockTimestamp());

        vm.expectRevert(QualyraCompetitionVault.InvalidStartTime.selector);
        _scheduleBattle(address(tokenA), address(tokenB), vm.getBlockTimestamp() + 7 days + 1);

        // Battles run from midnight to midnight UTC, so any other start time is refused.
        vm.expectRevert(QualyraCompetitionVault.InvalidStartTime.selector);
        _scheduleBattle(address(tokenA), address(tokenB), start + 1 hours);

        vm.expectRevert(QualyraCompetitionVault.InvalidPair.selector);
        _scheduleBattle(address(tokenA), address(tokenA), start);
    }

    function test_schedule_rejectsTokensStillOnTheCurve() public {
        (QualyraLaunchToken curveToken,) = _launch(address(0), 0);

        vm.expectRevert(QualyraCompetitionVault.InvalidPair.selector);
        _scheduleBattle(address(tokenA), address(curveToken), _nextMidnight());
    }

    function test_schedule_rejectsDifferentPairAssets() public {
        _enableUsdg(address(0x1000));
        (QualyraLaunchToken usdgToken,) = _graduatedUsdgLaunch();

        vm.expectRevert(QualyraCompetitionVault.InvalidPair.selector);
        _scheduleBattle(address(tokenA), address(usdgToken), _nextMidnight());
    }

    function test_schedule_booksATokenOnlyOnceInItsLifetime() public {
        (QualyraLaunchToken tokenC,,) = _graduatedEthLaunch(0);
        _makeEligible(address(tokenC));
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);

        // The schedule spends the battle, so A can't be booked again before, during or after it.
        assertTrue(competition.hasBattled(address(tokenA)));
        assertTrue(competition.hasBattled(address(tokenB)));
        assertFalse(competition.hasBattled(address(tokenC)));

        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.AlreadyBattled.selector, address(tokenA)));
        _scheduleBattle(address(tokenA), address(tokenC), start + 2 days);

        vm.warp(start);
        assertEq(competition.activeBattleOf(address(tokenA)), battleId);
        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.AlreadyBattled.selector, address(tokenA)));
        _scheduleBattle(address(tokenA), address(tokenC), start + 24 hours);

        vm.warp(start + 24 hours);
        assertEq(competition.activeBattleOf(address(tokenA)), 0);
        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.AlreadyBattled.selector, address(tokenA)));
        _scheduleBattle(address(tokenA), address(tokenC), _nextMidnight());
    }

    function test_schedule_rejectsTheSameTokenTwiceInOneCall() public {
        (QualyraLaunchToken tokenC,,) = _graduatedEthLaunch(0);
        _makeEligible(address(tokenC));
        address[] memory tokensA = new address[](2);
        address[] memory tokensB = new address[](2);
        tokensA[0] = address(tokenA);
        tokensB[0] = address(tokenB);
        tokensA[1] = address(tokenC);
        tokensB[1] = address(tokenA);

        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.AlreadyBattled.selector, address(tokenA)));
        competition.scheduleBattles(tokensA, tokensB, _nextMidnight());
    }

    // ---------------------------------------------------------------------------------------------
    // Pot
    // ---------------------------------------------------------------------------------------------

    function test_fees_fillThePotUntilTheLiveWindowEnds() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);

        uint256 potSeed = competition.getBattle(battleId).pot;

        vm.warp(start);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        uint256 leagueBefore = competition.bootstrapPool(address(0));
        hook.sweepFees(address(tokenA), battleId);

        // While the battle runs (Phase 2), the whole 0.0015 competition cut fills the pot; the league gets nothing.
        assertEq(competition.getBattle(battleId).pot, potSeed + 0.0015 ether);
        assertEq(competition.bootstrapPool(address(0)), leagueBefore);

        // Once the live window ends the token is back to normal routing (Phase 3), even before finalize: 70% of the
        // cut is treasury and 30% is league. Neither the pot nor the pending pot grows.
        vm.warp(start + 24 hours);
        uint256 potAfter = competition.getBattle(battleId).pot;
        uint256 leagueMid = competition.bootstrapPool(address(0));
        uint256 treasuryMid = feeVault.treasuryBalance(address(0));
        _swap(keyA, bob, true, -1 ether, 1 ether);
        hook.sweepFees(address(tokenA), 0);

        assertEq(competition.getBattle(battleId).pot, potAfter);
        assertEq(competition.bootstrapPool(address(0)), leagueMid + 0.00045 ether);
        // Platform 0.0015 plus the 0.00105 battle share.
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryMid, 0.0015 ether + 0.00105 ether);
        assertEq(competition.pendingBattlePot(address(tokenA), address(0)), 0);
    }

    function test_fees_betweenScheduleAndStart_joinThePot() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 potSeed = competition.getBattle(battleId).pot;
        uint256 contributionA = competition.contributionOf(battleId, address(tokenA));
        uint256 leagueBefore = competition.bootstrapPool(address(0));

        // Booked but not live yet: the hook already tags A's fees to the battle.
        assertEq(competition.activeBattleOf(address(tokenA)), 0);
        assertEq(competition.feeBucketOf(address(tokenA)), battleId);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        (uint128 untagged,) = hook.accruedFees(address(tokenA), 0);
        assertEq(untagged, 0);

        hook.sweepFees(address(tokenA), battleId);

        // The whole 0.0015 competition cut joins the pot as A's contribution; nothing is parked or sent to the league.
        assertEq(competition.getBattle(battleId).pot, potSeed + 0.0015 ether);
        assertEq(competition.contributionOf(battleId, address(tokenA)), contributionA + 0.0015 ether);
        assertEq(competition.pendingBattlePot(address(tokenA), address(0)), 0);
        assertEq(competition.bootstrapPool(address(0)), leagueBefore);
    }

    function test_schedule_sweepsFeesEarnedBeforeItIntoTheSeed() public {
        // A trades in its pool and nobody sweeps the hook before the operator books the battle.
        _swap(keyA, bob, true, -1 ether, 1 ether);
        (uint128 untagged,) = hook.accruedFees(address(tokenA), 0);
        assertEq(untagged, 0.01 ether);
        uint256 pendingBefore = competition.pendingBattlePot(address(tokenA), address(0));

        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), _nextMidnight());

        // Scheduling swept it: the 0.00105 battle share joined A's seed (the 30% league slice went to the league).
        (untagged,) = hook.accruedFees(address(tokenA), 0);
        assertEq(untagged, 0);
        assertEq(competition.contributionOf(battleId, address(tokenA)), pendingBefore + 0.00105 ether);
        assertEq(competition.pendingBattlePot(address(tokenA), address(0)), 0);
    }

    function test_finalize_leavesNothingParked_whateverTheSweepTiming() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 potSeed = competition.getBattle(battleId).pot;

        // Fees before the start, during the battle and after it, with every bucket swept as soon as it fills.
        _swap(keyA, bob, true, -1 ether, 1 ether);
        hook.sweepFees(address(tokenA), 0);
        hook.sweepFees(address(tokenA), battleId);
        vm.warp(start);
        _swap(keyB, bob, true, -1 ether, 1 ether);
        hook.sweepFees(address(tokenB), battleId);
        vm.warp(start + 24 hours);
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        _swap(keyA, bob, true, -1 ether, 1 ether);
        hook.sweepFees(address(tokenA), 0);

        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);
        skip(24 hours);
        competition.finalizeBattle(battleId);

        // The two swaps tagged to the battle filled the pot in full. The one after it went back to normal routing
        // (platform 0.0015 + battle share 0.00105 to the treasury). Nothing is left parked for either token.
        uint256 expectedPot = potSeed + 0.003 ether;
        assertEq(competition.getBattle(battleId).pot, expectedPot);
        assertEq(_funded(battleId, address(tokenA)), expectedPot);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, 0.0015 ether + 0.00105 ether);
        assertEq(competition.pendingBattlePot(address(tokenA), address(0)), 0);
        assertEq(competition.pendingBattlePot(address(tokenB), address(0)), 0);
    }

    function test_deposits_areOnlyAcceptedFromTheFeeVault() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.depositLeagueFees{value: 1 ether}(address(0), 1 ether);
    }

    function test_feesForAClosedBattle_areHeldAsPending() public {
        (uint256 battleId, QualyraLaunchToken winner,) = _settledBattle(QualyraCompetitionVault.Outcome.WinnerA, 1 ether);
        uint256 leagueBefore = competition.bootstrapPool(address(0));
        uint256 pendingBefore = competition.pendingBattlePot(address(winner), address(0));

        vm.deal(address(feeVault), 1 ether);
        vm.prank(address(feeVault));
        competition.depositBattleFees{value: 1 ether}(battleId, address(winner), address(0), 1 ether);

        // A closed pot can't be reopened: a stray deposit against it is held as pending, never sent to the league.
        // (The fee vault never sends one: once a token is booked, fees not tagged to its battle route as Phase 3.)
        assertEq(competition.bootstrapPool(address(0)), leagueBefore);
        assertEq(competition.pendingBattlePot(address(winner), address(0)) - pendingBefore, 1 ether);
    }

    // ---------------------------------------------------------------------------------------------
    // Results
    // ---------------------------------------------------------------------------------------------

    function test_finalize_winnerPotGoesToBuybackIncludingUnsweptFees() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 potSeed = competition.getBattle(battleId).pot;
        vm.warp(start);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        _swap(keyB, bob, true, -1 ether, 1 ether);

        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);

        vm.expectRevert(QualyraCompetitionVault.ChallengePeriodActive.selector);
        competition.finalizeBattle(battleId);

        skip(24 hours);
        uint256 accountedBefore = competition.accounted(address(0));
        competition.finalizeBattle(battleId);

        // Pot = seeded pending + the whole 0.003 competition share on the 2 ETH of unswept in-battle volume
        // (Phase 2 routes 100% to the pot; those fees are swept in at finalize).
        uint256 expectedPot = potSeed + 0.003 ether;
        assertEq(competition.getBattle(battleId).pot, expectedPot);
        assertTrue(competition.getBattle(battleId).finalized);
        assertEq(_funded(battleId, address(tokenA)), expectedPot);
        // Finalize also ran the first tranche, so the burner holds what is still to be spent.
        assertEq(address(burner).balance, burner.remaining(battleId, address(tokenA)));
        // Conservation: what stays in the vault plus what moved to the burner equals what was there before plus
        // the in-battle fees (all 0.003 of the competition share) swept into the pot at finalize.
        assertEq(competition.accounted(address(0)) + expectedPot, accountedBefore + 0.003 ether);
        (uint128 feeA,) = hook.accruedFees(address(tokenA), battleId);
        (uint128 feeB,) = hook.accruedFees(address(tokenB), battleId);
        assertEq(feeA + feeB, 0);

        vm.expectRevert(QualyraCompetitionVault.NoPendingResult.selector);
        competition.finalizeBattle(battleId);
    }

    function test_propose_scoresMustMatchTheOutcome() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);

        vm.expectRevert(QualyraCompetitionVault.BattleNotOver.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);

        vm.warp(start + 24 hours);
        vm.expectRevert(QualyraCompetitionVault.UnknownBattle.selector);
        _proposeBattle(99, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);

        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.None, 0.6e18, 0.4e18);

        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 1e18 + 1, 0);

        // A lead under one point is a draw, so it cannot be a win.
        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.5049e18, 0.4951e18);

        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerB, 0.5049e18, 0.4951e18);

        // A lead of exactly one point is a win, so it cannot be a draw.
        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.Draw, 0.505e18, 0.495e18);

        vm.prank(alice);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.proposeBattleResult(
            battleId,
            QualyraCompetitionVault.Outcome.Draw,
            0.5049e18,
            0.4951e18,
            keccak256(abi.encodePacked("dataset")),
            keccak256(abi.encodePacked("result"))
        );

        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.505e18, 0.495e18);
        vm.expectRevert(QualyraCompetitionVault.ResultAlreadyProposed.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.Draw, 0.5e18, 0.5e18);
    }

    function test_draw_splitsThePotBetweenBothBuybacks() public {
        (uint256 battleId, QualyraLaunchToken a, QualyraLaunchToken b) =
            _settledBattle(QualyraCompetitionVault.Outcome.Draw, 1 ether);

        // Both sides contributed the same, so each buyback gets the same share of the pot.
        uint256 half = _funded(battleId, address(a));
        assertGt(half, 0);
        assertEq(_funded(battleId, address(b)), half);
    }

    function test_disqualification_givesThePotToTheOpponent() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        _swap(keyB, bob, true, -1 ether, 1 ether);
        _disqualifyLive(address(tokenA));

        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.DisqualifiedA, 0, 0);
        skip(24 hours);
        competition.finalizeBattle(battleId);

        // The disqualified token gets nothing; the whole pot goes to the opponent's buyback.
        assertEq(_funded(battleId, address(tokenA)), 0);
        assertEq(_funded(battleId, address(tokenB)), competition.getBattle(battleId).pot);
    }

    function test_propose_mustFollowTheDisqualificationRecord() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 1 hours);
        _disqualifyLive(address(tokenA));

        vm.warp(start + 24 hours);
        // Scores can't crown the token that dropped, call it a draw, blame the other side or void the battle.
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.9e18, 0.1e18);
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.WinnerB, 0.1e18, 0.9e18);
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.Draw, 0.5e18, 0.5e18);
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.DisqualifiedB, 0, 0);
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.Void, 0, 0);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.DisqualifiedA, 0, 0);
    }

    function test_propose_rejectsADisqualificationTheVaultNeverRecorded() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 24 hours);

        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.DisqualifiedA, 0, 0);
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.DisqualifiedB, 0, 0);
        // A void stays available for a battle without a valid result.
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.Void, 0, 0);
    }

    function test_propose_bothDroppingInTheSameSecondVoidsTheBattle() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 1 hours);
        _reportBelowThreshold(address(tokenA));
        _reportBelowThreshold(address(tokenB));
        skip(competition.DQ_DWELL());
        _reportBelowThreshold(address(tokenA));
        // Confirmed a few minutes apart, but both drops are dated to the same second.
        skip(5 minutes);
        _reportBelowThreshold(address(tokenB));

        vm.warp(start + 24 hours);
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.DisqualifiedA, 0, 0);
        _expectInvalidResult(battleId, QualyraCompetitionVault.Outcome.DisqualifiedB, 0, 0);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.Void, 0, 0);
    }

    function test_finalize_runsTheFirstBuybackTrancheRightAway() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);
        skip(24 hours);

        uint256 supplyBefore = tokenA.totalSupply();
        competition.finalizeBattle(battleId);

        // A quarter of the pot is spent and the tokens it bought are burned; the next tranche waits 30 minutes.
        uint256 pot = competition.getBattle(battleId).pot;
        assertEq(_funded(battleId, address(tokenA)), pot);
        assertEq(burner.remaining(battleId, address(tokenA)), pot - (pot + 3) / 4);
        assertLt(tokenA.totalSupply(), supplyBefore);
        vm.expectRevert(QualyraBuybackBurner.TooSoon.selector);
        burner.executeBuyback(battleId, address(tokenA));
    }

    function test_finalize_stillSettlesWhenTheFirstTrancheCannotRun() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);
        skip(24 hours);

        // The burner moved to a successor, so its tranches revert; finalize must not.
        vm.prank(guardian);
        competition.pause();
        burner.migrate(address(new MockSuccessor()));
        competition.unpause();
        competition.finalizeBattle(battleId);

        uint256 pot = competition.getBattle(battleId).pot;
        assertTrue(competition.getBattle(battleId).finalized);
        assertEq(_funded(battleId, address(tokenA)), pot);
        assertEq(burner.remaining(battleId, address(tokenA)), pot);
    }

    function test_cancel_givesBothTokensTheirBattleBackBeforeTheStart() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 seedA = competition.contributionOf(battleId, address(tokenA));
        uint256 seedB = competition.contributionOf(battleId, address(tokenB));

        // Fees earned after the booking are tagged to the battle and still sit in the hook.
        _swap(keyA, bob, true, -1 ether, 1 ether);

        vm.prank(operator);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.cancelBattle(battleId);

        vm.prank(guardian);
        competition.cancelBattle(battleId);

        // Everything the pot held, the swept pre-start fees included, is parked again for each token.
        assertEq(competition.pendingBattlePot(address(tokenA), address(0)), seedA + 0.0015 ether);
        assertEq(competition.pendingBattlePot(address(tokenB), address(0)), seedB);
        assertEq(competition.getBattle(battleId).pot, 0);
        assertTrue(competition.getBattle(battleId).finalized);
        assertFalse(competition.hasBattled(address(tokenA)));
        assertFalse(competition.hasBattled(address(tokenB)));
        assertEq(competition.feeBucketOf(address(tokenA)), 0);

        // The cancelled battle can't get a result, and both tokens can be booked again.
        vm.warp(start + 24 hours);
        vm.expectRevert(QualyraCompetitionVault.ResultAlreadyProposed.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);
        uint256 again = _scheduleBattle(address(tokenA), address(tokenB), _nextMidnight());
        assertEq(competition.getBattle(again).pot, seedA + 0.0015 ether + seedB);
    }

    function test_cancel_isRefusedOnceTheBattleStarts() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);

        vm.warp(start);
        vm.prank(guardian);
        vm.expectRevert(QualyraCompetitionVault.BattleStarted.selector);
        competition.cancelBattle(battleId);

        vm.prank(guardian);
        vm.expectRevert(QualyraCompetitionVault.UnknownBattle.selector);
        competition.cancelBattle(battleId + 1);
    }

    /// @dev The pool hook reports a market cap below $100k, then again once DQ_DWELL has passed.
    function _disqualifyLive(address token) internal {
        _reportBelowThreshold(token);
        skip(competition.DQ_DWELL());
        _reportBelowThreshold(token);
        (,, bool disqualified,) = competition.eligibilityOf(token);
        assertTrue(disqualified);
    }

    function _reportBelowThreshold(address token) internal {
        _refreshEligibilityFeeds();
        vm.prank(factory.hook());
        competition.onTradeClose(token, 1, address(0));
    }

    function _expectInvalidResult(
        uint256 battleId,
        QualyraCompetitionVault.Outcome outcome,
        uint256 scoreA,
        uint256 scoreB
    ) internal {
        vm.expectRevert(QualyraCompetitionVault.InvalidResult.selector);
        _proposeBattle(battleId, outcome, scoreA, scoreB);
    }

    function test_voidBattle_refundsEachTokenItsOwnContribution() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        _swap(keyB, bob, true, -1 ether, 1 ether);

        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.Void, 0, 0);
        skip(24 hours);

        uint256 leagueBefore = competition.bootstrapPool(address(0));
        uint256 potBefore = competition.getBattle(battleId).pot;
        competition.finalizeBattle(battleId);

        // A void refunds each token exactly its own contribution to its own buyback&burn (spec §5.5) — never the
        // Trader League and never a 50/50 split. Both traded symmetrically, so each is refunded an equal, non-zero
        // share, and together the two refunds spend the whole pot (seed plus the 0.003 in-battle fees swept in).
        uint256 refundA = _funded(battleId, address(tokenA));
        uint256 refundB = _funded(battleId, address(tokenB));
        assertGt(refundA, 0);
        assertEq(refundA, competition.contributionOf(battleId, address(tokenA)));
        assertEq(refundB, competition.contributionOf(battleId, address(tokenB)));
        assertEq(refundA + refundB, potBefore + 0.003 ether);
        assertEq(competition.bootstrapPool(address(0)), leagueBefore);
    }

    function test_veto_clearsTheResultWithinTheChallengePeriod() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);

        vm.prank(operator);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.vetoBattleResult(battleId);

        vm.prank(guardian);
        competition.vetoBattleResult(battleId);
        assertEq(uint256(competition.getBattle(battleId).outcome), uint256(QualyraCompetitionVault.Outcome.None));

        vm.expectRevert(QualyraCompetitionVault.NoPendingResult.selector);
        competition.finalizeBattle(battleId);

        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerB, 0.4e18, 0.6e18);
        skip(24 hours);

        vm.prank(guardian);
        vm.expectRevert(QualyraCompetitionVault.ChallengePeriodOver.selector);
        competition.vetoBattleResult(battleId);

        competition.finalizeBattle(battleId);
        assertTrue(competition.getBattle(battleId).finalized);
    }

    function test_pause_keepsFeesFlowingButStopsResults() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 potSeed = competition.getBattle(battleId).pot;

        vm.prank(alice);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.pause();

        vm.prank(guardian);
        competition.pause();

        vm.warp(start);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        hook.sweepFees(address(tokenA), battleId);
        // Fees keep flowing while paused: the whole competition share (0.0015) still reaches the open pot (Phase 2).
        assertEq(competition.getBattle(battleId).pot, potSeed + 0.0015 ether);

        vm.warp(start + 24 hours);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);

        vm.prank(guardian);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.unpause();

        competition.unpause();
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);

        vm.prank(guardian);
        competition.pause();
        skip(24 hours);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        competition.finalizeBattle(battleId);
    }

    function test_roles_areSetByTheAdmin() public {
        address newOperator = makeAddr("newOperator");

        vm.prank(operator);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.setOperator(newOperator);

        competition.setOperator(newOperator);
        competition.setGuardian(alice);
        assertEq(competition.operator(), newOperator);
        assertEq(competition.guardian(), alice);

        vm.expectRevert(QualyraCompetitionVault.ZeroAddress.selector);
        competition.setOperator(address(0));
    }

    // ---------------------------------------------------------------------------------------------
    // Draw / Void refund per contribution, both-disqualified survivor, and the §4.1 pending drain
    // ---------------------------------------------------------------------------------------------

    /// @dev A draw refunds each token EXACTLY its own contribution (spec §5.4), never a 50/50 split. tokenA trades
    ///      three times tokenB's in-battle volume, so its refund must be strictly larger.
    function test_draw_refundsEachTokenItsOwnContributionNotHalf() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start);
        _swap(keyA, bob, true, -3 ether, 3 ether);
        _swap(keyB, bob, true, -1 ether, 1 ether);

        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.Draw, 0.5e18, 0.5e18);
        skip(24 hours);
        competition.finalizeBattle(battleId);

        uint256 refundA = _funded(battleId, address(tokenA));
        uint256 refundB = _funded(battleId, address(tokenB));
        assertEq(refundA, competition.contributionOf(battleId, address(tokenA)));
        assertEq(refundB, competition.contributionOf(battleId, address(tokenB)));
        assertGt(refundA, refundB, "refund tracks contribution, not a 50/50 split");
        assertEq(refundA + refundB, competition.getBattle(battleId).pot);
    }

    /// @dev Spec §6 "both gone, survivor wins": when both tokens drop below the market-cap floor mid-battle, the
    ///      one that fell FIRST loses and the survivor takes the whole pot. A live-battle DQ only flags the token
    ///      (spec §4.2) — the battle still runs its full 24h and the pot is left intact until finalize.
    function test_bothDisqualifiedDuringBattle_survivorTakesThePot() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        _swap(keyB, bob, true, -1 ether, 1 ether);

        // tokenA goes below the floor first; tokenB follows 20 minutes later, so its disqualification is confirmed
        // before tokenA's but still dated after it.
        _reportBelowThreshold(address(tokenA));
        skip(20 minutes);
        _reportBelowThreshold(address(tokenB));
        skip(competition.DQ_DWELL());
        _reportBelowThreshold(address(tokenB));
        skip(1 minutes);
        _reportBelowThreshold(address(tokenA));

        (,, bool dqA, uint48 atA) = competition.eligibilityOf(address(tokenA));
        (,, bool dqB, uint48 atB) = competition.eligibilityOf(address(tokenB));
        assertTrue(dqA && dqB, "both disqualified");
        assertLt(atA, atB, "tokenA fell first, so it is the loser");

        vm.warp(start + 24 hours);
        // tokenA fell first -> DisqualifiedA hands the whole pot to the survivor tokenB.
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.DisqualifiedA, 0, 0);
        skip(24 hours);
        competition.finalizeBattle(battleId);

        uint256 pot = competition.getBattle(battleId).pot;
        assertGt(pot, 0);
        assertEq(_funded(battleId, address(tokenA)), 0);
        assertEq(_funded(battleId, address(tokenB)), pot);
    }

    /// @dev Spec §4.1: a token disqualified before it ever became eligible has its stranded pending battle pot
    ///      drained straight to the treasury, so competition funds are never stuck on a token that can never battle.
    function test_disqualifiedBeforeBattle_drainsPendingPotToTreasury() public {
        (QualyraLaunchToken tokenC,, PoolKey memory keyC) = _graduatedEthLaunch(0);
        address src = factory.hook();

        // Start the 24h timer with one qualifying close, but never let the token become eligible.
        _refreshEligibilityFeeds();
        vm.prank(src);
        competition.onTradeClose(address(tokenC), ELIG_PRICE, address(0));

        // A normal (no open battle) trade parks the battle share of tokenC's competition fee in its pending pot.
        _swap(keyC, bob, true, -2 ether, 2 ether);
        hook.sweepFees(address(tokenC), 0);
        uint256 pending = competition.pendingBattlePot(address(tokenC), address(0));
        assertGt(pending, 0, "pending battle share parked in Phase 1");

        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));

        // Market cap collapses below $100k and stays there for DQ_DWELL: tokenC is permanently disqualified (§4.1)
        // and its pending pot is drained to the treasury in the same call.
        _reportBelowThreshold(address(tokenC));
        skip(competition.DQ_DWELL());
        _reportBelowThreshold(address(tokenC));

        (,, bool dq,) = competition.eligibilityOf(address(tokenC));
        assertTrue(dq, "permanently disqualified");
        assertEq(competition.pendingBattlePot(address(tokenC), address(0)), 0, "pending drained");
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, pending, "pending moved to treasury");
    }

    /// @dev Spec §2.1: a token may battle at most once in its lifetime. `hasBattled` latches at finalize, and a
    ///      later schedule of that token — even against a fresh eligible opponent — reverts with AlreadyBattled.
    function test_schedule_rejectsATokenThatHasAlreadyBattled() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);
        skip(24 hours);
        competition.finalizeBattle(battleId);
        assertTrue(competition.hasBattled(address(tokenA)));

        // A fresh, eligible opponent cannot revive tokenA: its one lifetime battle is spent.
        (QualyraLaunchToken tokenC,,) = _graduatedEthLaunch(0);
        _makeEligible(address(tokenC));

        vm.expectRevert(abi.encodeWithSelector(QualyraCompetitionVault.AlreadyBattled.selector, address(tokenA)));
        _scheduleBattle(address(tokenA), address(tokenC), _nextMidnight());
    }
}

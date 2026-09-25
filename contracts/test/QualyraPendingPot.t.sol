// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";

/// @dev Covers the pending battle pot: the 70% battle share of the competition cut that accrues while a token
///      is not in an open battle is held per token+asset and seeds that token's next battle.
contract QualyraPendingPotTest is CompetitionTestBase {
    address internal first = makeAddr("first");
    address internal second = makeAddr("second");
    address internal third = makeAddr("third");

    function setUp() public {
        _deploySystem();
    }

    /// @dev With no open battle for the token, the battle share is held as pending, not sent to the league.
    function test_depositBattleFees_withNoOpenBattle_holdsPending() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);
        uint256 pendingBefore = competition.pendingBattlePot(address(token), address(0));
        uint256 leagueBefore = competition.bootstrapPool(address(0));

        // battleId 0 is never an open pot, so this simulates the fee vault forwarding a battle share while idle.
        vm.deal(address(feeVault), 1 ether);
        vm.prank(address(feeVault));
        competition.depositBattleFees{value: 1 ether}(0, address(token), address(0), 1 ether);

        assertEq(competition.pendingBattlePot(address(token), address(0)) - pendingBefore, 1 ether);
        assertEq(competition.bootstrapPool(address(0)), leagueBefore);
    }

    /// @dev While a battle pot is open, the battle share goes straight into that pot.
    function test_depositBattleFees_withOpenBattle_fillsThePot() public {
        (QualyraLaunchToken a,,) = _graduatedEthLaunch(0);
        (QualyraLaunchToken b,,) = _graduatedEthLaunch(0);
        _makeEligible(address(a));
        _makeEligible(address(b));
        uint256 battleId = _scheduleBattle(address(a), address(b), _nextMidnight());
        uint256 potBefore = competition.getBattle(battleId).pot;

        vm.deal(address(feeVault), 1 ether);
        vm.prank(address(feeVault));
        competition.depositBattleFees{value: 1 ether}(battleId, address(a), address(0), 1 ether);

        assertEq(competition.getBattle(battleId).pot - potBefore, 1 ether);
    }

    /// @dev Scheduling a battle seeds its pot with the pending battle share of both tokens and zeroes the pending.
    function test_scheduleBattles_seedsThePotFromPending() public {
        (QualyraLaunchToken a,,) = _graduatedEthLaunch(0);
        (QualyraLaunchToken b,,) = _graduatedEthLaunch(0);

        // Graduation already accrued a pending battle share for each token (no battle was open then).
        uint256 pendingA = competition.pendingBattlePot(address(a), address(0));
        uint256 pendingB = competition.pendingBattlePot(address(b), address(0));
        assertGt(pendingA, 0);
        assertGt(pendingB, 0);

        _makeEligible(address(a));
        _makeEligible(address(b));
        uint256 battleId = _scheduleBattle(address(a), address(b), _nextMidnight());

        assertEq(competition.getBattle(battleId).pot, pendingA + pendingB);
        assertEq(competition.pendingBattlePot(address(a), address(0)), 0);
        assertEq(competition.pendingBattlePot(address(b), address(0)), 0);
    }

    /// @dev The scenario Robert asked about: a token's pending battle share must survive several full Trader
    ///      League weeks (funding, finalizing and paying out prizes) while no battle is ever scheduled for it.
    ///      The league only ever pays from its own `weekPool`, so the pending pot can never leak into league
    ///      payouts. It stays intact until the token's next battle finally seeds it.
    function test_pendingSurvivesMultipleLeagueWeeks_thenSeedsBattle() public {
        // A graduates and parks its battle share as pending (no battle is open at graduation).
        (QualyraLaunchToken a,,) = _graduatedEthLaunch(0);
        uint256 pending = competition.pendingBattlePot(address(a), address(0));
        assertGt(pending, 0, "graduation must accrue a pending battle share");

        // The league starts. This does NOT touch the pending pot in any way.
        competition.startLeague();
        uint256 firstWeek = competition.firstLeagueWeek();
        assertEq(competition.pendingBattlePot(address(a), address(0)), pending, "startLeague must not move pending");

        // Run three full league weeks end to end: fund the week, wait it out, publish winners, finalize and
        // pay three winners - all while A is never in a battle. Pending must not move at any step.
        for (uint256 w; w < 3; ++w) {
            uint256 week = firstWeek + w;

            // Land inside the week in progress so the league deposit joins this exact week's pool.
            vm.warp(competition.weekEndsAt(week - 1));
            _depositLeague(address(0), 3 ether);
            // The pool holds at least the 3 ETH we deposited (organic 30% trade fees may add a touch more),
            // and crucially it holds only the league's own money - the deposit never moves the pending pot.
            uint256 pool = competition.weekPool(week, address(0));
            assertGe(pool, 3 ether, "league pool holds the 30% share we funded");
            assertEq(
                competition.pendingBattlePot(address(a), address(0)), pending, "deposit to league must not move pending"
            );

            // The week is over: publish and finalize the leaderboard.
            vm.warp(competition.weekEndsAt(week));
            _proposeWinners(week, [first, second, third, address(0), address(0)]);
            skip(competition.LEAGUE_CHALLENGE_PERIOD());
            competition.finalizeWeek(week);
            assertEq(
                competition.pendingBattlePot(address(a), address(0)), pending, "finalizeWeek must not move pending"
            );

            // The winners claim their prizes. Prizes are paid purely out of weekPool, never out of
            // pending: the exact amounts are derived from this week's pool, whatever organic fees made it.
            uint256 firstBefore = first.balance;
            uint256 secondBefore = second.balance;
            uint256 thirdBefore = third.balance;
            competition.claim(week, 0, _ethOnly());
            competition.claim(week, 1, _ethOnly());
            competition.claim(week, 2, _ethOnly());
            assertEq(first.balance - firstBefore, pool * 4000 / 10_000, "first place gets 40% of the league pool");
            assertEq(second.balance - secondBefore, pool * 3000 / 10_000, "second place gets 30%");
            assertEq(third.balance - thirdBefore, pool * 1500 / 10_000, "third place gets 15%");
            assertEq(competition.pendingBattlePot(address(a), address(0)), pending, "claims must not touch pending");
        }

        // After three weeks of league activity, A's pending pot is still fully intact - nothing leaked out.
        assertEq(competition.pendingBattlePot(address(a), address(0)), pending, "pending survives every league week");

        // Only now does A finally get a battle. Scheduling it is the single path that moves the pending pot,
        // and it moves the whole balance straight into the battle pot.
        (QualyraLaunchToken b,,) = _graduatedEthLaunch(0);
        uint256 pendingB = competition.pendingBattlePot(address(b), address(0));
        _makeEligible(address(a));
        _makeEligible(address(b));
        uint256 battleId = _scheduleBattle(address(a), address(b), _nextMidnight());

        assertEq(competition.getBattle(battleId).pot, pending + pendingB, "battle pot is seeded from both pendings");
        assertEq(competition.pendingBattlePot(address(a), address(0)), 0, "pending is zeroed only when it seeds a battle");
        assertEq(competition.pendingBattlePot(address(b), address(0)), 0);
    }

    function _proposeWinners(uint256 week, address[5] memory winners) private {
        vm.prank(operator);
        competition.proposeWeeklyWinners(
            week, winners, keccak256(abi.encodePacked("dataset")), keccak256(abi.encodePacked("result"))
        );
    }

    function _ethOnly() private pure returns (address[] memory list) {
        list = new address[](1);
    }
}

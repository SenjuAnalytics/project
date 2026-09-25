// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";

/// @dev One pass through the whole product: launch, trade, graduate, battle, buy back, and pay the league.
contract QualyraEndToEndTest is CompetitionTestBase {
    uint256 internal constant FIRST_WEEK = 2960;

    address internal winner = makeAddr("winner");
    address internal runnerUp = makeAddr("runnerUp");

    function setUp() public {
        _deploySystem();
    }

    function test_fullLifecycle() public {
        competition.startLeague();

        // Two creators launch and graduate through the router in one transaction each.
        QualyraLaunchToken tokenA = _launchAndGraduate(creator);
        QualyraLaunchToken tokenB = _launchAndGraduate(alice);
        PoolKey memory keyA = hook.poolKeyOf(address(tokenA));
        PoolKey memory keyB = hook.poolKeyOf(address(tokenB));

        // First league week: normal trading, then a battle.
        vm.warp(competition.weekEndsAt(FIRST_WEEK - 1) + 1 hours);
        _swap(keyA, bob, true, -2 ether, 2 ether);
        hook.sweepFees(address(tokenA), 0);

        // Spec §2.1: both tokens must be eligible before they can be scheduled to battle.
        _makeEligible(address(tokenA));
        _makeEligible(address(tokenB));
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 1 hours);
        _swap(keyA, bob, true, -20 ether, 20 ether);
        _swap(keyB, bob, true, -10 ether, 10 ether);

        vm.warp(start + 24 hours);
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.7e18, 0.3e18);
        skip(24 hours);
        competition.finalizeBattle(battleId);

        // The whole 15% competition cut on both tokens' in-battle volume (Phase 2 routes 100% to the pot, no
        // longer leaking 30% to the league), plus the pending battle share tokenA accrued before the battle (its
        // pre-battle trade + graduation) that seeded the pot on schedule.
        assertEq(_funded(battleId, address(tokenA)), 56_009_090_909_090_910);

        // Finalize ran the first tranche; the other three follow 30 minutes apart.
        uint256 supplyBefore = tokenA.totalSupply();
        for (uint256 i; i < 3; ++i) {
            skip(30 minutes);
            burner.executeBuyback(battleId, address(tokenA));
        }
        assertEq(burner.remaining(battleId, address(tokenA)), 0);
        assertLt(tokenA.totalSupply(), supplyBefore);

        // Week results.
        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        uint256 pool = competition.weekPool(FIRST_WEEK, address(0));
        assertGt(pool, 0);

        vm.prank(operator);
        competition.proposeWeeklyWinners(
            FIRST_WEEK,
            [winner, runnerUp, address(0), address(0), address(0)],
            keccak256(abi.encodePacked("dataset")),
            keccak256(abi.encodePacked("result"))
        );
        skip(48 hours);
        competition.finalizeWeek(FIRST_WEEK);

        address[] memory eth = new address[](1);
        competition.claim(FIRST_WEEK, 0, eth);
        competition.claim(FIRST_WEEK, 1, eth);
        assertEq(winner.balance, pool * 4_000 / 10_000);
        assertEq(runnerUp.balance, pool * 3_000 / 10_000);

        // Creators and the treasury pull their share.
        uint256 creatorFees = feeVault.creatorBalance(address(tokenA), address(0));
        assertGt(creatorFees, 0);
        uint256 creatorBefore = creator.balance;
        feeVault.withdrawCreatorFees(address(tokenA), address(0));
        assertEq(creator.balance - creatorBefore, creatorFees);
        feeVault.withdrawTreasury(address(0));

        // Every contract holds exactly what it owes.
        assertEq(address(competition).balance, competition.accounted(address(0)));
        assertEq(address(feeVault).balance, feeVault.accounted(address(0)));
        assertEq(address(burner).balance, burner.accounted(address(0)));
        assertEq(address(hook).balance, 0);
        assertEq(address(router).balance, 0);
    }

    function _launchAndGraduate(address who) private returns (QualyraLaunchToken) {
        uint256 fee = factory.launchFee();
        vm.prank(who);
        (address token,,) = router.launchAndBuy{value: fee + 5 ether}(_params(address(0), 0), 5 ether, 0);
        assertTrue(factory.isGraduated(token));
        return QualyraLaunchToken(token);
    }
}

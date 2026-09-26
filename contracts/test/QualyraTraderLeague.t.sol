// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {MockSuccessor} from "./mocks/MockSuccessor.sol";

contract QualyraTraderLeagueTest is CompetitionTestBase {
    uint256 internal constant THIS_WEEK = 2959;
    uint256 internal constant FIRST_WEEK = 2960;

    address internal first = makeAddr("first");
    address internal second = makeAddr("second");
    address internal third = makeAddr("third");
    address internal carol = makeAddr("carol");

    MockERC20 internal dollar;

    function setUp() public {
        _deploySystem();
        dollar = new MockERC20("Global Dollar", "USDG", 6);
    }

    // ---------------------------------------------------------------------------------------------
    // Weeks and bootstrap pool
    // ---------------------------------------------------------------------------------------------

    function test_weeks_startOnMondayUtc() public {
        assertEq(competition.currentWeek(), THIS_WEEK);
        assertEq(competition.weekEndsAt(THIS_WEEK), MONDAY + 7 days);

        vm.warp(MONDAY - 1);
        assertEq(competition.currentWeek(), THIS_WEEK - 1);
        vm.warp(MONDAY + 7 days - 1);
        assertEq(competition.currentWeek(), THIS_WEEK);
        vm.warp(MONDAY + 7 days);
        assertEq(competition.currentWeek(), THIS_WEEK + 1);
    }

    function test_launchFee_goesToTreasuryNotTheLeague() public {
        _launch(address(0), 0);

        // Launch fee now goes 100% to the treasury; nothing reaches the competition vault / bootstrap pool.
        assertEq(competition.bootstrapPool(address(0)), 0);
        assertEq(competition.weekPool(THIS_WEEK, address(0)), 0);
        assertEq(address(competition).balance, 0);
        assertEq(feeVault.treasuryBalance(address(0)), 0.0005 ether);
    }

    function test_startLeague_spreadsTheBootstrapPoolOverFourWeeks() public {
        _depositLeague(address(0), 1 ether + 3);
        _depositLeague(address(dollar), 1_000e6 + 1);

        vm.prank(operator);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.startLeague();

        competition.startLeague();
        assertEq(competition.firstLeagueWeek(), FIRST_WEEK);
        assertEq(competition.bootstrapPool(address(0)), 0);

        for (uint256 i; i < 3; ++i) {
            assertEq(competition.weekPool(FIRST_WEEK + i, address(0)), 0.25 ether);
            assertEq(competition.weekPool(FIRST_WEEK + i, address(dollar)), 250e6);
        }
        assertEq(competition.weekPool(FIRST_WEEK + 3, address(0)), 0.25 ether + 3);
        assertEq(competition.weekPool(FIRST_WEEK + 3, address(dollar)), 250e6 + 1);
        assertEq(competition.weekPool(FIRST_WEEK + 4, address(0)), 0);

        vm.expectRevert(QualyraCompetitionVault.LeagueAlreadyStarted.selector);
        competition.startLeague();
    }

    function test_deposits_joinTheWeekInProgressOnceStarted() public {
        competition.startLeague();

        // The first league week has not begun yet, so it collects everything until then.
        _depositLeague(address(0), 1 ether);
        assertEq(competition.weekPool(FIRST_WEEK, address(0)), 1 ether);

        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _depositLeague(address(0), 2 ether);
        assertEq(competition.weekPool(FIRST_WEEK + 1, address(0)), 2 ether);
    }

    // ---------------------------------------------------------------------------------------------
    // Weekly results and claims
    // ---------------------------------------------------------------------------------------------

    function test_weeklyPrizes_arePaidPerAsset() public {
        _fundFirstWeek(10 ether, 1_000e6);

        vm.expectRevert(QualyraCompetitionVault.WeekNotOver.selector);
        _proposeWinners(FIRST_WEEK, [first, second, address(0), address(0), address(0)]);

        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _proposeWinners(FIRST_WEEK, [first, second, address(0), address(0), address(0)]);

        vm.expectRevert(QualyraCompetitionVault.ChallengePeriodActive.selector);
        competition.finalizeWeek(FIRST_WEEK);

        skip(48 hours);
        competition.finalizeWeek(FIRST_WEEK);

        // Only 1st (40%) and 2nd (30%) are filled, so the remaining 30% of each asset moves to the next week.
        assertEq(competition.weekPool(FIRST_WEEK + 1, address(0)), 3 ether);
        assertEq(competition.weekPool(FIRST_WEEK + 1, address(dollar)), 300e6);

        assertEq(competition.claimableOf(FIRST_WEEK, 0, address(0)), 4 ether);
        assertEq(competition.claimableOf(FIRST_WEEK, 1, address(dollar)), 300e6);
        assertEq(competition.claimableOf(FIRST_WEEK, 2, address(0)), 0);

        // Anyone can trigger the claim, the prize still goes to the winner.
        vm.prank(carol);
        competition.claim(FIRST_WEEK, 0, _assets());
        assertEq(first.balance, 4 ether);
        assertEq(dollar.balanceOf(first), 400e6);
        assertEq(carol.balance, 0);

        vm.expectRevert(QualyraCompetitionVault.NothingToClaim.selector);
        competition.claim(FIRST_WEEK, 0, _assets());

        vm.expectRevert(QualyraCompetitionVault.InvalidRank.selector);
        competition.claim(FIRST_WEEK, 2, _assets());

        vm.expectRevert(QualyraCompetitionVault.InvalidRank.selector);
        competition.claim(FIRST_WEEK, 3, _assets());

        competition.claim(FIRST_WEEK, 1, _ethOnly());
        assertEq(second.balance, 3 ether);
        assertEq(competition.claimableOf(FIRST_WEEK, 1, address(0)), 0);
        assertEq(competition.claimableOf(FIRST_WEEK, 1, address(dollar)), 300e6);

        // A second call pays only what is still open.
        competition.claim(FIRST_WEEK, 1, _assets());
        assertEq(second.balance, 3 ether);
        assertEq(dollar.balanceOf(second), 300e6);

        assertEq(competition.accounted(address(0)), 3 ether);
        assertEq(address(competition).balance, 3 ether);
    }

    function test_claims_areClosedBeforeFinalization() public {
        _fundFirstWeek(1 ether, 0);
        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _proposeWinners(FIRST_WEEK, [first, second, third, address(0), address(0)]);

        vm.expectRevert(QualyraCompetitionVault.ClaimsClosed.selector);
        competition.claim(FIRST_WEEK, 0, _assets());
    }

    function test_proposeWeeklyWinners_rejectsInvalidResults() public {
        vm.expectRevert(QualyraCompetitionVault.WeekNotInLeague.selector);
        _proposeWinners(THIS_WEEK, [first, second, third, address(0), address(0)]);

        competition.startLeague();
        vm.warp(competition.weekEndsAt(FIRST_WEEK));

        vm.expectRevert(QualyraCompetitionVault.WeekNotInLeague.selector);
        _proposeWinners(THIS_WEEK, [first, second, third, address(0), address(0)]);

        vm.prank(carol);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.proposeWeeklyWinners(
            FIRST_WEEK,
            [first, second, third, address(0), address(0)],
            keccak256(abi.encodePacked("dataset")),
            keccak256(abi.encodePacked("result"))
        );

        vm.expectRevert(QualyraCompetitionVault.InvalidWinners.selector);
        _proposeWinners(FIRST_WEEK, [first, first, third, address(0), address(0)]);

        vm.expectRevert(QualyraCompetitionVault.InvalidWinners.selector);
        _proposeWinners(FIRST_WEEK, [first, address(0), third, address(0), address(0)]);

        vm.expectRevert(QualyraCompetitionVault.InvalidWinners.selector);
        _proposeWinners(FIRST_WEEK, [address(0), second, address(0), address(0), address(0)]);

        _proposeWinners(FIRST_WEEK, [first, second, third, address(0), address(0)]);
        vm.expectRevert(QualyraCompetitionVault.ResultAlreadyProposed.selector);
        _proposeWinners(FIRST_WEEK, [first, second, address(0), address(0), address(0)]);
    }

    function test_veto_letsTheOperatorPublishAgain() public {
        _fundFirstWeek(1 ether, 0);
        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _proposeWinners(FIRST_WEEK, [first, second, third, address(0), address(0)]);

        vm.prank(operator);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.vetoWeeklyWinners(FIRST_WEEK);

        vm.prank(guardian);
        competition.vetoWeeklyWinners(FIRST_WEEK);
        assertEq(competition.getWeekResult(FIRST_WEEK).proposedAt, 0);
        assertEq(competition.getWeekResult(FIRST_WEEK).winners[0], address(0));

        vm.expectRevert(QualyraCompetitionVault.NoPendingResult.selector);
        competition.finalizeWeek(FIRST_WEEK);

        _proposeWinners(FIRST_WEEK, [third, second, first, address(0), address(0)]);
        skip(48 hours);

        vm.prank(guardian);
        vm.expectRevert(QualyraCompetitionVault.ChallengePeriodOver.selector);
        competition.vetoWeeklyWinners(FIRST_WEEK);

        competition.finalizeWeek(FIRST_WEEK);
        competition.claim(FIRST_WEEK, 0, _ethOnly());
        assertEq(third.balance, 0.4 ether);
    }

    function test_weekWithoutWinners_rollsTheWholePoolForward() public {
        _fundFirstWeek(1 ether, 100e6);
        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _proposeWinners(FIRST_WEEK, [address(0), address(0), address(0), address(0), address(0)]);
        skip(48 hours);
        competition.finalizeWeek(FIRST_WEEK);

        assertEq(competition.weekPool(FIRST_WEEK + 1, address(0)), 1 ether);
        assertEq(competition.weekPool(FIRST_WEEK + 1, address(dollar)), 100e6);
    }

    function test_unclaimedPrizes_rollIntoTheWeekInProgressAfterSixtyDays() public {
        _finalizedFirstWeek(10 ether);
        competition.claim(FIRST_WEEK, 0, _ethOnly());

        vm.expectRevert(QualyraCompetitionVault.ClaimWindowOpen.selector);
        competition.rolloverUnclaimed(FIRST_WEEK);

        vm.warp(competition.getWeekResult(FIRST_WEEK).finalizedAt + 60 days);
        vm.expectRevert(QualyraCompetitionVault.ClaimsClosed.selector);
        competition.claim(FIRST_WEEK, 1, _ethOnly());
        assertEq(competition.claimableOf(FIRST_WEEK, 1, address(0)), 0);

        uint256 week = competition.currentWeek();
        uint256 poolBefore = competition.weekPool(week, address(0));
        competition.rolloverUnclaimed(FIRST_WEEK);
        // First (40%) was claimed; the unclaimed 2nd (30%) + 3rd (15%) roll forward = 4.5 ether.
        assertEq(competition.weekPool(week, address(0)) - poolBefore, 4.5 ether);

        vm.expectRevert(QualyraCompetitionVault.ClaimsClosed.selector);
        competition.rolloverUnclaimed(FIRST_WEEK);
    }

    function testFuzz_prizesAndRolloverAddUpToThePool(uint256 amount, uint8 places, bool claimAll) public {
        amount = bound(amount, 1, 1e30);
        places = uint8(bound(places, 0, 5));
        _fundFirstWeek(amount, 0);

        address[5] memory winners;
        if (places > 0) winners[0] = first;
        if (places > 1) winners[1] = second;
        if (places > 2) winners[2] = third;

        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _proposeWinners(FIRST_WEEK, winners);
        skip(48 hours);
        competition.finalizeWeek(FIRST_WEEK);

        uint256 paid;
        for (uint256 rank; rank < places; ++rank) {
            if (!claimAll && rank == 0) continue;
            if (competition.claimableOf(FIRST_WEEK, rank, address(0)) == 0) continue;
            uint256 before = winners[rank].balance;
            competition.claim(FIRST_WEEK, rank, _ethOnly());
            paid += winners[rank].balance - before;
        }

        vm.warp(competition.getWeekResult(FIRST_WEEK).finalizedAt + 60 days);
        if (places != 0) competition.rolloverUnclaimed(FIRST_WEEK);

        uint256 carried = competition.weekPool(FIRST_WEEK + 1, address(0));
        if (competition.currentWeek() != FIRST_WEEK + 1) carried += competition.weekPool(competition.currentWeek(), address(0));
        assertEq(paid + carried, amount);
        assertEq(address(competition).balance, competition.accounted(address(0)));
    }

    // ---------------------------------------------------------------------------------------------
    // Liveness: a week nobody reported has a way out
    // ---------------------------------------------------------------------------------------------

    function test_skipWeek_isRefusedBeforeTheLeagueAndBeforeTheGrace() public {
        _depositLeague(address(0), 1 ether);

        // No league, no weeks to skip.
        vm.expectRevert(QualyraCompetitionVault.WeekNotInLeague.selector);
        competition.skipWeek(THIS_WEEK);

        competition.startLeague();
        vm.expectRevert(QualyraCompetitionVault.WeekNotInLeague.selector);
        competition.skipWeek(THIS_WEEK); // the league's own weeks start at FIRST_WEEK

        // Reported weeks only run out of time LEAGUE_SKIP_GRACE after they end.
        vm.warp(competition.weekEndsAt(FIRST_WEEK) + competition.LEAGUE_SKIP_GRACE() - 1);
        vm.expectRevert(QualyraCompetitionVault.WeekSkipTooEarly.selector);
        competition.skipWeek(FIRST_WEEK);
    }

    /// @notice With no winners ever posted, anyone can close the week after the grace period; its whole pool joins
    ///         the week in progress, so fees nobody reported on are not stranded.
    function test_skipWeek_movesAnUnreportedWeeksPoolIntoTheOpenWeek() public {
        _fundFirstWeek(10 ether, 1_000e6);

        vm.warp(competition.weekEndsAt(FIRST_WEEK) + competition.LEAGUE_SKIP_GRACE());
        uint256 toWeek = competition.currentWeek();
        uint256 ethBefore = competition.weekPool(toWeek, address(0));
        uint256 dollarBefore = competition.weekPool(toWeek, address(dollar));

        vm.prank(carol); // anyone can do this
        competition.skipWeek(FIRST_WEEK);

        assertGt(competition.getWeekResult(FIRST_WEEK).finalizedAt, 0, "the week is closed");
        assertEq(competition.weekPool(toWeek, address(0)) - ethBefore, 10 ether);
        assertEq(competition.weekPool(toWeek, address(dollar)) - dollarBefore, 1_000e6);
        // Moving the ledger must not move a second copy of the funds.
        assertEq(address(competition).balance, competition.accounted(address(0)));

        // A week is skipped at most once; a proposal would have gone through the normal path instead.
        vm.expectRevert(QualyraCompetitionVault.NoPendingResult.selector);
        competition.skipWeek(FIRST_WEEK);
    }

    function test_skipWeek_refusesAWeekWithAPendingProposal() public {
        _fundFirstWeek(1 ether, 0);
        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _depositLeague(address(0), 2 ether); // lands in FIRST_WEEK + 1, now in progress

        vm.warp(competition.weekEndsAt(FIRST_WEEK + 1));
        _proposeWinners(FIRST_WEEK + 1, [first, second, third, address(0), address(0)]);

        vm.warp(competition.weekEndsAt(FIRST_WEEK + 1) + competition.LEAGUE_SKIP_GRACE());
        // The challenge period path is what should run for a week that has a result.
        vm.expectRevert(QualyraCompetitionVault.ResultAlreadyProposed.selector);
        competition.skipWeek(FIRST_WEEK + 1);

        // The week nobody reported skips at the same moment, and the proposed one keeps its pool.
        uint256 week = competition.currentWeek();
        uint256 ethBefore = competition.weekPool(week, address(0));
        competition.skipWeek(FIRST_WEEK);
        assertEq(competition.weekPool(week, address(0)) - ethBefore, 1 ether);
        assertEq(competition.weekPool(FIRST_WEEK + 1, address(0)), 2 ether);
    }

    /// @notice A skipped week's pool is already in the open week, so the sixty-day rollover has nothing to move and
    ///         cannot pay it twice.
    function test_rolloverUnclaimed_ignoresASkippedWeeksPool() public {
        _fundFirstWeek(1 ether, 0);
        vm.warp(competition.weekEndsAt(FIRST_WEEK) + competition.LEAGUE_SKIP_GRACE());
        competition.skipWeek(FIRST_WEEK);

        vm.warp(competition.getWeekResult(FIRST_WEEK).finalizedAt + 60 days);
        uint256 week = competition.currentWeek();
        uint256 before = competition.weekPool(week, address(0));
        competition.rolloverUnclaimed(FIRST_WEEK);
        assertEq(competition.weekPool(week, address(0)), before);
    }

    // ---------------------------------------------------------------------------------------------
    // Pause and migration
    // ---------------------------------------------------------------------------------------------

    function test_pause_stopsFinalizationAndClaims() public {
        _finalizedFirstWeek(10 ether);

        vm.prank(guardian);
        competition.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        competition.claim(FIRST_WEEK, 0, _ethOnly());

        vm.expectRevert(Pausable.EnforcedPause.selector);
        competition.rolloverUnclaimed(FIRST_WEEK);

        // Deposits keep working while paused.
        _depositLeague(address(0), 1 ether);

        competition.unpause();
        competition.claim(FIRST_WEEK, 0, _ethOnly());
        assertEq(first.balance, 4 ether);
    }

    function test_migration_movesBalancesToTheSuccessor() public {
        _finalizedFirstWeek(10 ether);
        _depositLeague(address(dollar), 50e6);
        MockSuccessor next = new MockSuccessor();

        vm.expectRevert(QualyraCompetitionVault.NotMigrated.selector);
        competition.sweepToSuccessor(address(0));

        vm.expectRevert(Pausable.ExpectedPause.selector);
        competition.migrate(address(next));

        vm.prank(guardian);
        competition.pause();

        vm.prank(guardian);
        vm.expectRevert(QualyraCompetitionVault.Unauthorized.selector);
        competition.migrate(address(next));

        vm.expectRevert(QualyraCompetitionVault.InvalidSuccessor.selector);
        competition.migrate(carol);

        competition.migrate(address(next));
        assertEq(competition.successor(), address(next));

        vm.expectRevert(QualyraCompetitionVault.AlreadyMigrated.selector);
        competition.migrate(address(this));

        vm.expectRevert(QualyraCompetitionVault.AlreadyMigrated.selector);
        competition.unpause();

        uint256 ethOwed = competition.accounted(address(0));
        vm.prank(carol);
        competition.sweepToSuccessor(address(0));
        competition.sweepToSuccessor(address(dollar));

        assertEq(address(next).balance, ethOwed);
        assertEq(dollar.balanceOf(address(next)), 50e6);
        assertEq(competition.accounted(address(0)), 0);

        vm.expectRevert(QualyraCompetitionVault.NothingToSweep.selector);
        competition.sweepToSuccessor(address(0));

        // Fees that arrive later can still be forwarded.
        _depositLeague(address(0), 1 ether);
        competition.sweepToSuccessor(address(0));
        assertEq(address(next).balance, ethOwed + 1 ether);
    }

    // ---------------------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------------------

    function _fundFirstWeek(uint256 ethAmount, uint256 dollarAmount) private {
        competition.startLeague();
        vm.warp(competition.weekEndsAt(THIS_WEEK));
        if (ethAmount != 0) _depositLeague(address(0), ethAmount);
        if (dollarAmount != 0) _depositLeague(address(dollar), dollarAmount);
    }

    function _finalizedFirstWeek(uint256 ethAmount) private {
        _fundFirstWeek(ethAmount, 0);
        vm.warp(competition.weekEndsAt(FIRST_WEEK));
        _proposeWinners(FIRST_WEEK, [first, second, third, address(0), address(0)]);
        skip(48 hours);
        competition.finalizeWeek(FIRST_WEEK);
    }

    function _proposeWinners(uint256 week, address[5] memory winners) private {
        vm.prank(operator);
        competition.proposeWeeklyWinners(
            week, winners, keccak256(abi.encodePacked("dataset")), keccak256(abi.encodePacked("result"))
        );
    }

    function _assets() private view returns (address[] memory list) {
        list = new address[](2);
        list[0] = address(0);
        list[1] = address(dollar);
    }

    function _ethOnly() private pure returns (address[] memory list) {
        list = new address[](1);
    }
}

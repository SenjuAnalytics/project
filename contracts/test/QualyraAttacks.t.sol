// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraBuybackBurner} from "../src/QualyraBuybackBurner.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";

/// @dev Winner contract that tries to claim a second time while receiving its prize.
contract ReentrantWinner {
    QualyraCompetitionVault internal immutable vault;
    uint256 internal week;
    bool internal attacked;

    constructor(QualyraCompetitionVault vault_) {
        vault = vault_;
    }

    function setWeek(uint256 week_) external {
        week = week_;
    }

    receive() external payable {
        if (attacked) return;
        attacked = true;
        address[] memory eth = new address[](1);
        vault.claim(week, 0, eth);
    }
}

/// @dev Attempts against the assumptions the competition contracts rely on.
contract QualyraAttacksTest is CompetitionTestBase {
    using PoolIdLibrary for PoolKey;

    address internal mallory = makeAddr("mallory");

    function setUp() public {
        _deploySystem();
        vm.deal(mallory, 10_000 ether);
    }

    /// @dev DOCUMENTED, ACCEPTED MEV EXPOSURE. At the 5% price-impact cap (MAX_PRICE_IMPACT_BPS = 500) a buyback
    ///      tranche moves the price enough that a bot can sandwich it profitably: front-run the tranche, ride the
    ///      up-to-5% push, then sell — netting more than the 2% round-trip pool fee it pays. Buyback swaps are
    ///      fee-exempt, but the attacker is not, so the break-even is ~2%; a cap above that (here 5%) opens the
    ///      vector. This is a deliberate product trade-off: visible price support was chosen over tighter MEV
    ///      resistance. A sub-2% cap would make sandwiching unprofitable again. This test pins the exposure so it
    ///      is explicit, not hidden. See PRE-MAINNET-VERIFICATION.md (§E).
    function test_sandwichingABuybackCanProfitAtFivePercentCap() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        vm.deal(address(competition), 100 ether);
        vm.prank(address(competition));
        burner.fund{value: 100 ether}(7, address(token), address(0), 100 ether);

        uint256 startBalance = mallory.balance;
        uint256 frontRun = 50 ether;
        _swap(key, mallory, true, -SafeCast.toInt256(frontRun), frontRun);

        burner.executeBuyback(7, address(token));

        uint256 tokens = token.balanceOf(mallory);
        _approveRouter(mallory, address(token));
        _swap(key, mallory, false, -SafeCast.toInt256(tokens), 0);

        // The 5% cap leaves the attacker in profit even after paying the 2% round-trip fee.
        assertGt(mallory.balance, startBalance);
    }

    /// @dev The fee exemption follows the address that calls the PoolManager, which only the burner itself can be.
    function test_pretendingToBeTheBurnerStillPaysFees() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);
        vm.deal(address(burner), 1 ether);

        _swap(key, address(burner), true, -1 ether, 1 ether);

        (uint128 tradeFee,) = hook.accruedFees(address(token), 0);
        assertEq(tradeFee, 0.01 ether);
    }

    function test_reentrantWinnerCannotClaimTwice() public {
        ReentrantWinner winner = new ReentrantWinner(competition);
        competition.startLeague();
        uint256 week = competition.firstLeagueWeek();
        winner.setWeek(week);

        vm.warp(competition.weekEndsAt(week - 1));
        _depositLeague(address(0), 10 ether);
        vm.warp(competition.weekEndsAt(week));
        vm.prank(operator);
        competition.proposeWeeklyWinners(
            week,
            [address(winner), address(0), address(0), address(0), address(0)],
            keccak256(abi.encodePacked("dataset")),
            keccak256(abi.encodePacked("result"))
        );
        skip(48 hours);
        competition.finalizeWeek(week);

        address[] memory eth = new address[](1);
        vm.expectRevert();
        competition.claim(week, 0, eth);

        assertEq(address(winner).balance, 0);
        assertEq(competition.claimableOf(week, 0, address(0)), 4 ether);
    }

    /// @dev Fees reported for a token that is not in the battle never join its pot.
    function test_feesFromAnotherTokenNeverReachThePot() public {
        (QualyraLaunchToken tokenA,,) = _graduatedEthLaunch(0);
        (QualyraLaunchToken tokenB,,) = _graduatedEthLaunch(0);
        (QualyraLaunchToken outsider,, PoolKey memory outsiderKey) = _graduatedEthLaunch(0);

        // Spec §2.1: the two battling tokens must be eligible (the outsider never battles, so it need not be).
        _makeEligible(address(tokenA));
        _makeEligible(address(tokenB));
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start);

        // The pot may be pre-seeded from tokenA's and tokenB's OWN pending battle share at schedule time, so we
        // capture it and prove the outsider adds nothing to it.
        uint256 potBefore = competition.getBattle(battleId).pot;

        // The outsider trades during the battle, and someone sweeps its normal fees under the battle id.
        _swap(outsiderKey, bob, true, -1 ether, 1 ether);
        hook.sweepFees(address(outsider), battleId);
        hook.sweepFees(address(outsider), 0);
        assertEq(competition.getBattle(battleId).pot, potBefore);

        vm.deal(address(feeVault), 1 ether);
        vm.prank(address(feeVault));
        competition.depositBattleFees{value: 1 ether}(battleId, address(outsider), address(0), 1 ether);
        assertEq(competition.getBattle(battleId).pot, potBefore);
    }

    /// @dev A swap that would stop at its price limit is rejected, so the fee always matches what traded.
    function test_swapThatCannotFillCompletelyIsRejected() public {
        (,, PoolKey memory key) = _graduatedEthLaunch(0);
        (uint160 sqrtPrice,,,) = StateLibrary.getSlot0(IPoolManager(address(manager)), key.toId());

        // Half a percent of price room is far less than a 5 ETH buy needs.
        uint160 limit = uint160(FullMath.mulDiv(sqrtPrice, 9_975, 10_000));

        vm.expectRevert();
        _swapWithLimit(key, mallory, true, -5 ether, 5 ether, limit);

        // The same buy goes through when the swapper leaves room for it.
        _swap(key, mallory, true, -5 ether, 5 ether);
    }

    /// @dev Several pots on one token cannot be bought in the same block.
    function test_potsOnOneTokenCannotStackInOneBlock() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);
        vm.deal(address(competition), 20 ether);
        vm.startPrank(address(competition));
        burner.fund{value: 10 ether}(1, address(token), address(0), 10 ether);
        burner.fund{value: 10 ether}(2, address(token), address(0), 10 ether);
        vm.stopPrank();

        burner.executeBuyback(1, address(token));

        vm.expectRevert(QualyraBuybackBurner.TooSoon.selector);
        burner.executeBuyback(2, address(token));

        skip(30 minutes);
        burner.executeBuyback(2, address(token));
    }

    /// @dev Fees reported for a battle that is already settled follow the normal split.
    function test_lateBattleFeesGoToTreasuryAndLeague() public {
        (uint256 battleId, QualyraLaunchToken token,) = _settledBattle(QualyraCompetitionVault.Outcome.WinnerA, 1 ether);
        uint256 leagueBefore = competition.bootstrapPool(address(0));
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        uint256 potBefore = competition.getBattle(battleId).pot;
        uint256 pendingBefore = competition.pendingBattlePot(address(token), address(0));

        address hookAddress = factory.hook();
        vm.deal(hookAddress, 0.01 ether);
        vm.prank(hookAddress);
        feeVault.collectFees{value: 0.01 ether}(address(token), 0.01 ether, 0, battleId);

        // The token has already used its one lifetime battle (Phase 3), so its 0.0015 competition share splits
        // 70/30 into treasury and league: the 0.00105 battle share is booked to the treasury (no longer held as
        // pending) and 0.00045 goes to the Trader League. Nothing pends and the closed pot is untouched. The
        // treasury therefore grows by its flat 15% platform slice (0.0015) plus the Phase-3 battle share (0.00105).
        assertEq(competition.getBattle(battleId).pot, potBefore);
        assertEq(competition.pendingBattlePot(address(token), address(0)) - pendingBefore, 0);
        assertEq(competition.bootstrapPool(address(0)) - leagueBefore, 0.00045 ether);
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, 0.0015 ether + 0.00105 ether);
    }

    /// @dev A battle cannot be settled twice, even by calling finalize again from inside the payout path.
    function test_battleCannotBeSettledTwice() public {
        (uint256 battleId, QualyraLaunchToken winner,) = _settledBattle(QualyraCompetitionVault.Outcome.WinnerA, 1 ether);
        uint256 funded = burner.remaining(battleId, address(winner));

        vm.expectRevert(QualyraCompetitionVault.NoPendingResult.selector);
        competition.finalizeBattle(battleId);

        vm.prank(guardian);
        vm.expectRevert(QualyraCompetitionVault.NoPendingResult.selector);
        competition.vetoBattleResult(battleId);

        assertEq(burner.remaining(battleId, address(winner)), funded);
    }
}

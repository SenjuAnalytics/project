// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraFeeVault} from "../src/QualyraFeeVault.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";

/// @dev A creator withdrawal collects the fees the pool hook still holds for the token before paying out.
contract QualyraCreatorWithdrawTest is CompetitionTestBase {
    uint16 internal constant CREATOR_TAX_BPS = 100;

    QualyraLaunchToken internal tokenA;
    QualyraLaunchToken internal tokenB;
    PoolKey internal keyA;

    function setUp() public {
        _deploySystem();
        (tokenA,, keyA) = _graduatedEthLaunch(CREATOR_TAX_BPS);
        (tokenB,,) = _graduatedEthLaunch(0);
        _makeEligible(address(tokenA));
        _makeEligible(address(tokenB));
    }

    function test_withdraw_collectsTheFeesTheHookStillHolds() public {
        _swap(keyA, bob, true, -1 ether, 1 ether);
        (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(address(tokenA), 0);
        assertGt(creatorTax, 0);

        uint256 expected = feeVault.creatorBalance(address(tokenA), address(0)) + _creatorCut(tradeFee, creatorTax);
        uint256 before = creator.balance;
        feeVault.withdrawCreatorFees(address(tokenA), address(0));

        assertEq(creator.balance - before, expected);
        _assertNothingParked(0);
        assertEq(feeVault.creatorBalance(address(tokenA), address(0)), 0);
    }

    function test_withdraw_worksWhenOnlyTheHookHoldsFees() public {
        feeVault.withdrawCreatorFees(address(tokenA), address(0));
        assertEq(feeVault.creatorBalance(address(tokenA), address(0)), 0);

        _swap(keyA, bob, true, -1 ether, 1 ether);
        (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(address(tokenA), 0);

        uint256 before = creator.balance;
        feeVault.withdrawCreatorFees(address(tokenA), address(0));
        assertEq(creator.balance - before, _creatorCut(tradeFee, creatorTax));
    }

    function test_withdraw_collectsTheBookedBattleBucketAndFundsThePot() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        uint256 potBefore = competition.getBattle(battleId).pot;

        vm.warp(start + 1 hours);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(address(tokenA), battleId);
        assertGt(tradeFee, 0);

        uint256 expected = feeVault.creatorBalance(address(tokenA), address(0)) + _creatorCut(tradeFee, creatorTax);
        uint256 before = creator.balance;
        feeVault.withdrawCreatorFees(address(tokenA), address(0));

        // The creator gets its cut and the competition cut joins the battle it was earned in.
        assertEq(creator.balance - before, expected);
        assertEq(competition.getBattle(battleId).pot, potBefore + uint256(tradeFee) * 1_500 / 10_000);
        _assertNothingParked(battleId);
    }

    function test_withdraw_leavesAnEndedBattleBucketForFinalize() public {
        uint256 start = _nextMidnight();
        uint256 battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start + 1 hours);
        _swap(keyA, bob, true, -1 ether, 1 ether);
        (uint128 tradeFee,) = hook.accruedFees(address(tokenA), battleId);

        // Past the live window the token's fees are untagged again; the battle's bucket waits for finalize.
        vm.warp(start + 24 hours);
        feeVault.withdrawCreatorFees(address(tokenA), address(0));
        (uint128 stillParked,) = hook.accruedFees(address(tokenA), battleId);
        assertEq(stillParked, tradeFee);

        uint256 potBefore = competition.getBattle(battleId).pot;
        _proposeBattle(battleId, QualyraCompetitionVault.Outcome.WinnerA, 0.6e18, 0.4e18);
        skip(competition.BATTLE_CHALLENGE_PERIOD());
        competition.finalizeBattle(battleId);

        assertEq(competition.getBattle(battleId).pot, potBefore + uint256(tradeFee) * 1_500 / 10_000);
        _assertNothingParked(battleId);
    }

    function test_withdraw_stillRevertsWhenThereIsNothingAnywhere() public {
        feeVault.withdrawCreatorFees(address(tokenA), address(0));
        vm.expectRevert(QualyraFeeVault.NothingToWithdraw.selector);
        feeVault.withdrawCreatorFees(address(tokenA), address(0));
    }

    /// @dev Creator part of a sweep: its share of the trade fee plus the whole creator tax.
    function _creatorCut(uint256 tradeFee, uint256 creatorTax) internal pure returns (uint256) {
        return tradeFee * 7_000 / 10_000 + creatorTax;
    }

    function _assertNothingParked(uint256 bucket) internal view {
        (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(address(tokenA), bucket);
        assertEq(uint256(tradeFee) + creatorTax, 0);
    }
}

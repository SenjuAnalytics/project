// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraBuybackBurner} from "../src/QualyraBuybackBurner.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";

import {MockSuccessor} from "./mocks/MockSuccessor.sol";

contract QualyraBuybackTest is CompetitionTestBase {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    function setUp() public {
        _deploySystem();
    }

    function test_buyback_spendsThePotInTranchesAndBurns() public {
        (uint256 battleId, QualyraLaunchToken token,) = _settledBattle(QualyraCompetitionVault.Outcome.WinnerA, 50 ether);
        // Pot = the competition share of the fees tagged to the battle + pending seeded from earlier fees.
        uint256 pot = _funded(battleId, address(token));
        assertGt(pot, 0);

        // Finalize already ran the first tranche: about a quarter of the pot, allowing 1 wei of rounding.
        uint256 spent = pot - burner.remaining(battleId, address(token));
        assertApproxEqAbs(spent, pot / 4, 1);
        assertEq(token.balanceOf(address(burner)), 0);
        assertEq(address(burner).balance, pot - spent);
        assertEq(burner.accounted(address(0)), pot - spent);

        (uint128 feesBefore,) = hook.accruedFees(address(token), 0);
        uint256 supplyBefore = token.totalSupply();

        vm.expectRevert(QualyraBuybackBurner.TooSoon.selector);
        burner.executeBuyback(battleId, address(token));

        for (uint256 i; i < 3; ++i) {
            skip(30 minutes);
            vm.prank(alice);
            (, uint256 burned) = burner.executeBuyback(battleId, address(token));
            assertGt(burned, 0);
        }

        assertEq(burner.remaining(battleId, address(token)), 0);
        assertEq(address(burner).balance, 0);
        assertLt(token.totalSupply(), supplyBefore);

        // Buyback swaps pay no fee.
        (uint128 feesAfter,) = hook.accruedFees(address(token), 0);
        assertEq(feesAfter, feesBefore);

        skip(30 minutes);
        vm.expectRevert(QualyraBuybackBurner.NothingToBuy.selector);
        burner.executeBuyback(battleId, address(token));
    }

    function test_buyback_capsThePriceMoveOfEachTranche() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);
        _fundBurner(7, address(token), address(0), 100 ether);

        (uint160 sqrtBefore,,,) = manager.getSlot0(key.toId());
        (uint256 spent, uint256 burned) = burner.executeBuyback(7, address(token));
        (uint160 sqrtAfter,,,) = manager.getSlot0(key.toId());

        assertGt(spent, 0);
        assertLt(spent, 10 ether);
        assertGt(burned, 0);
        assertEq(burner.remaining(7, address(token)), 100 ether - spent);

        // ETH is currency0, so the pool price is tokens per ETH and falls as the token gets dearer.
        uint256 tokenPriceRatio = _squaredRatio(sqrtBefore, sqrtAfter);
        assertLe(tokenPriceRatio, 1.05e18 + 1e9);
        assertGe(tokenPriceRatio, 1.0499e18);
    }

    function test_buyback_whenThePairAssetIsCurrency1() public {
        _enableUsdg(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
        (QualyraLaunchToken token, PoolKey memory key) = _graduatedUsdgLaunch();
        assertEq(Currency.unwrap(key.currency1), address(usdg));

        _fundBurner(3, address(token), address(usdg), 10_000e6);

        (uint160 sqrtBefore,,,) = manager.getSlot0(key.toId());
        uint256 supplyBefore = token.totalSupply();
        (uint256 spent, uint256 burned) = burner.executeBuyback(3, address(token));
        (uint160 sqrtAfter,,,) = manager.getSlot0(key.toId());

        assertGt(spent, 0);
        assertLe(spent, 1_000e6);
        assertEq(token.totalSupply(), supplyBefore - burned);
        assertEq(usdg.balanceOf(address(burner)), 10_000e6 - spent);

        uint256 tokenPriceRatio = _squaredRatio(sqrtAfter, sqrtBefore);
        assertGt(tokenPriceRatio, 1e18);
        assertLe(tokenPriceRatio, 1.05e18 + 1e9);
    }

    function test_buyback_waitsWhileTheCompetitionIsPaused() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);
        _fundBurner(1, address(token), address(0), 1 ether);

        vm.prank(guardian);
        competition.pause();

        vm.expectRevert(QualyraBuybackBurner.CompetitionPaused.selector);
        burner.executeBuyback(1, address(token));

        competition.unpause();
        burner.executeBuyback(1, address(token));
    }

    function test_fund_onlyAcceptsFullyPaidPotsFromTheCompetitionVault() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);
        vm.deal(address(competition), 10 ether);

        vm.prank(alice);
        vm.expectRevert(QualyraBuybackBurner.Unauthorized.selector);
        burner.fund{value: 1 ether}(1, address(token), address(0), 1 ether);

        _enableUsdg(address(0x1000));
        vm.prank(address(competition));
        vm.expectRevert(QualyraBuybackBurner.InvalidAsset.selector);
        burner.fund(1, address(token), address(usdg), 1e6);

        vm.prank(address(competition));
        vm.expectRevert(QualyraBuybackBurner.InvalidValue.selector);
        burner.fund{value: 1 ether}(1, address(token), address(0), 2 ether);

        (QualyraLaunchToken usdgToken,) = _graduatedUsdgLaunch();
        vm.prank(address(competition));
        vm.expectRevert(QualyraBuybackBurner.FundsNotReceived.selector);
        burner.fund(1, address(usdgToken), address(usdg), 1e6);
    }

    function test_migration_requiresAPausedCompetition() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);
        _fundBurner(1, address(token), address(0), 1 ether);
        MockSuccessor next = new MockSuccessor();

        vm.expectRevert(QualyraBuybackBurner.CompetitionNotPaused.selector);
        burner.migrate(address(next));

        vm.prank(guardian);
        competition.pause();

        vm.prank(guardian);
        vm.expectRevert(QualyraBuybackBurner.Unauthorized.selector);
        burner.migrate(address(next));

        vm.expectRevert(QualyraBuybackBurner.InvalidSuccessor.selector);
        burner.migrate(alice);

        vm.expectRevert(QualyraBuybackBurner.NotMigrated.selector);
        burner.sweepToSuccessor(address(0));

        burner.migrate(address(next));
        vm.expectRevert(QualyraBuybackBurner.AlreadyMigrated.selector);
        burner.migrate(address(next));

        competition.unpause();
        vm.expectRevert(QualyraBuybackBurner.AlreadyMigrated.selector);
        burner.executeBuyback(1, address(token));

        burner.sweepToSuccessor(address(0));
        assertEq(address(next).balance, 1 ether);
        assertEq(burner.accounted(address(0)), 0);

        vm.expectRevert(QualyraBuybackBurner.NothingToSweep.selector);
        burner.sweepToSuccessor(address(0));
    }

    function _fundBurner(uint256 battleId, address token, address asset, uint256 amount) private {
        if (asset == address(0)) {
            vm.deal(address(competition), amount);
            vm.prank(address(competition));
            burner.fund{value: amount}(battleId, token, asset, amount);
        } else {
            usdg.mint(address(burner), amount);
            vm.prank(address(competition));
            burner.fund(battleId, token, asset, amount);
        }
    }

    /// @dev (numerator / denominator)^2 scaled by 1e18.
    function _squaredRatio(uint160 numerator, uint160 denominator) private pure returns (uint256) {
        uint256 ratio = FullMath.mulDiv(numerator, 1e18, denominator);
        return FullMath.mulDiv(ratio, ratio, 1e18);
    }
}

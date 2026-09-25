// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraSwapRouter} from "../src/periphery/QualyraSwapRouter.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

/// @dev The periphery swap router against a graduated pool, in both directions and both currency orderings.
contract QualyraSwapRouterTest is CompetitionTestBase {
    QualyraSwapRouter internal qualyraRouter;
    address internal trader = makeAddr("routerTrader");

    function setUp() public {
        _deploySystem();
        qualyraRouter = new QualyraSwapRouter(manager, IQualyraFactory(address(factory)));
        vm.deal(trader, 100 ether);
    }

    function test_buysTokenWithEthAndChargesTheHookFee() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);

        (uint128 feesBefore,) = hook.accruedFees(address(token), 0);

        vm.prank(trader);
        uint256 out = qualyraRouter.swapExactIn{value: 1 ether}(
            address(token), true, 1 ether, 0, trader, vm.getBlockTimestamp()
        );

        assertGt(out, 0, "no tokens received");
        assertEq(token.balanceOf(trader), out, "tokens did not reach the trader");

        // 1% of the ETH in, taken by the hook on the pair asset side.
        (uint128 feesAfter,) = hook.accruedFees(address(token), 0);
        assertEq(feesAfter - feesBefore, 0.01 ether, "hook fee is not 1% of the input");

        // The router keeps nothing.
        assertEq(address(qualyraRouter).balance, 0, "router held ETH");
        assertEq(token.balanceOf(address(qualyraRouter)), 0, "router held tokens");
    }

    function test_sellsTokenBackForEth() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);

        vm.prank(trader);
        uint256 bought = qualyraRouter.swapExactIn{value: 2 ether}(
            address(token), true, 2 ether, 0, trader, vm.getBlockTimestamp()
        );

        uint256 ethBefore = trader.balance;
        vm.startPrank(trader);
        token.approve(address(qualyraRouter), bought);
        uint256 ethOut = qualyraRouter.swapExactIn(address(token), false, bought, 0, trader, vm.getBlockTimestamp());
        vm.stopPrank();

        assertGt(ethOut, 0, "no ETH received");
        assertEq(trader.balance, ethBefore + ethOut, "ETH did not reach the trader");
        assertEq(token.balanceOf(trader), 0, "tokens were not fully spent");
        assertEq(address(qualyraRouter).balance, 0, "router held ETH");
    }

    function test_worksWhenThePairAssetIsCurrency1() public {
        _enableUsdg(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
        (QualyraLaunchToken token,) = _graduatedUsdgLaunch();

        usdg.mint(trader, 1_000e6);
        vm.startPrank(trader);
        usdg.approve(address(qualyraRouter), 1_000e6);
        uint256 out = qualyraRouter.swapExactIn(address(token), true, 1_000e6, 0, trader, vm.getBlockTimestamp());
        vm.stopPrank();

        assertGt(out, 0, "no tokens received");
        assertEq(token.balanceOf(trader), out);
        assertEq(usdg.balanceOf(address(qualyraRouter)), 0, "router held USDG");
    }

    function test_slippageBoundIsEnforced() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);

        vm.prank(trader);
        vm.expectRevert();
        qualyraRouter.swapExactIn{value: 1 ether}(
            address(token), true, 1 ether, type(uint256).max, trader, vm.getBlockTimestamp()
        );
    }

    function test_rejectsATokenThatHasNotGraduated() public {
        (QualyraLaunchToken token,) = _launch(address(0), 0);

        vm.prank(trader);
        vm.expectRevert(QualyraSwapRouter.NotGraduated.selector);
        qualyraRouter.swapExactIn{value: 1 ether}(address(token), true, 1 ether, 0, trader, vm.getBlockTimestamp());
    }

    function test_rejectsAnExpiredDeadline() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);

        vm.prank(trader);
        vm.expectRevert(QualyraSwapRouter.DeadlinePassed.selector);
        qualyraRouter.swapExactIn{value: 1 ether}(address(token), true, 1 ether, 0, trader, vm.getBlockTimestamp() - 1);
    }

    function test_rejectsMismatchedNativeValue() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);

        vm.prank(trader);
        vm.expectRevert(QualyraSwapRouter.UnexpectedValue.selector);
        qualyraRouter.swapExactIn{value: 0.5 ether}(address(token), true, 1 ether, 0, trader, vm.getBlockTimestamp());
    }

    /// @dev A sell specifies the token side, so the pair asset arrives as the unspecified currency.
    function test_sellAlsoPaysTheHookFee() public {
        (QualyraLaunchToken token,,) = _graduatedEthLaunch(0);

        vm.prank(trader);
        uint256 bought = qualyraRouter.swapExactIn{value: 2 ether}(
            address(token), true, 2 ether, 0, trader, vm.getBlockTimestamp()
        );

        (uint128 feesBeforeSell,) = hook.accruedFees(address(token), 0);

        vm.startPrank(trader);
        token.approve(address(qualyraRouter), bought);
        qualyraRouter.swapExactIn(address(token), false, bought, 0, trader, vm.getBlockTimestamp());
        vm.stopPrank();

        (uint128 feesAfterSell,) = hook.accruedFees(address(token), 0);
        assertGt(feesAfterSell, feesBeforeSell, "sell paid no fee");
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraFactory} from "../src/QualyraFactory.sol";
import {QualyraLaunchRouter} from "../src/QualyraLaunchRouter.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

contract QualyraLaunchRouterTest is CompetitionTestBase {
    function setUp() public {
        _deploySystem();
    }

    function test_launchAndBuy_creatorSkipsTheSnipeTax() public {
        uint256 fee = factory.launchFee();

        vm.prank(creator);
        (address token, address curve, uint256 tokensOut) =
            router.launchAndBuy{value: fee + 1 ether}(_params(address(0), 0), 1 ether, 0);

        // Only the 1% trading fee is taken, even though the snipe window is open.
        uint256 expected = SUPPLY - Math.ceilDiv(uint256(ETH_PHANTOM) * SUPPLY, ETH_PHANTOM + 0.99 ether);
        assertEq(tokensOut, expected);
        assertEq(QualyraLaunchToken(token).balanceOf(creator), expected);
        assertEq(factory.getLaunch(token).creator, creator);
        assertEq(factory.feeRecipientOf(token), creator);
        assertEq(QualyraBondingCurve(curve).quoteReserve(), 0.99 ether);
        assertEq(address(router).balance, 0);
    }

    function test_launchAndBuy_refundsWhatTheCurveDoesNotUse() public {
        uint256 fee = factory.launchFee();
        uint256 balanceBefore = creator.balance;

        vm.prank(creator);
        (address token,,) = router.launchAndBuy{value: fee + 10 ether}(_params(address(0), 0), 10 ether, 0);

        uint256 used = Math.mulDiv(ETH_THRESHOLD, 10_000, 9_900, Math.Rounding.Ceil);
        assertEq(balanceBefore - creator.balance, fee + used);
        assertTrue(factory.isGraduated(token));
        assertEq(address(router).balance, 0);
    }

    function test_launchAndBuy_withAnErc20PairAsset() public {
        _enableUsdg(address(0x1000));
        usdg.mint(creator, 1_000e6);
        uint256 fee = factory.launchFee();

        vm.startPrank(creator);
        usdg.approve(address(router), 1_000e6);
        (address token, address curve, uint256 tokensOut) =
            router.launchAndBuy{value: fee}(_params(address(usdg), 0), 1_000e6, 0);
        vm.stopPrank();

        assertGt(tokensOut, 0);
        assertEq(QualyraLaunchToken(token).balanceOf(creator), tokensOut);
        assertEq(QualyraBondingCurve(curve).quoteReserve(), 990e6);
        assertEq(usdg.balanceOf(creator), 0);
        assertEq(usdg.balanceOf(address(router)), 0);
        assertEq(usdg.allowance(address(router), curve), 0);
    }

    function test_launchAndBuy_withoutABuyOnlyLaunches() public {
        uint256 fee = factory.launchFee();

        vm.prank(creator);
        (address token,, uint256 tokensOut) = router.launchAndBuy{value: fee}(_params(address(0), 0), 0, 0);

        assertEq(tokensOut, 0);
        assertTrue(factory.isQualyraToken(token));
        assertEq(QualyraLaunchToken(token).balanceOf(creator), 0);
    }

    function test_launchAndBuy_rejectsTheWrongValue() public {
        uint256 fee = factory.launchFee();
        IQualyraFactory.LaunchParams memory params = _params(address(0), 0);

        vm.prank(creator);
        vm.expectRevert(QualyraLaunchRouter.InvalidValue.selector);
        router.launchAndBuy{value: fee}(params, 1 ether, 0);

        _enableUsdg(address(0x1000));
        vm.prank(creator);
        vm.expectRevert(QualyraLaunchRouter.InvalidValue.selector);
        router.launchAndBuy{value: fee + 1}(_params(address(usdg), 0), 1e6, 0);
    }

    function test_router_rejectsPlainEth() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function test_launchTokenFor_isReservedForTheRouter() public {
        uint256 fee = factory.launchFee();
        IQualyraFactory.LaunchParams memory params = _params(address(0), 0);

        vm.prank(alice);
        vm.expectRevert(QualyraFactory.Unauthorized.selector);
        factory.launchTokenFor{value: fee}(creator, params);
    }
}

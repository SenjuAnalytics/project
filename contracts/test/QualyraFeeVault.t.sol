// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LaunchTestBase} from "./utils/LaunchTestBase.sol";
import {QualyraFeeVault} from "../src/QualyraFeeVault.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";

contract QualyraFeeVaultTest is LaunchTestBase {
    function test_withdrawCreatorFees_paysCurrentRecipient() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 300);
        skip(10);
        _buyEth(curve, alice, 2 ether);

        uint256 owed = feeVault.creatorBalance(address(token), address(0));
        assertEq(owed, 0.014 ether + 0.06 ether);

        vm.prank(creator);
        factory.setCreatorFeeRecipient(address(token), bob);

        uint256 bobBefore = bob.balance;
        vm.prank(alice);
        feeVault.withdrawCreatorFees(address(token), address(0));
        assertEq(bob.balance - bobBefore, owed);
        assertEq(feeVault.creatorBalance(address(token), address(0)), 0);

        vm.expectRevert(QualyraFeeVault.NothingToWithdraw.selector);
        feeVault.withdrawCreatorFees(address(token), address(0));
    }

    function test_withdrawTreasury() public {
        (, QualyraBondingCurve curve) = _launch(address(usdg), 0);
        skip(10);
        usdg.mint(alice, 5_000e6);
        vm.startPrank(alice);
        usdg.approve(address(curve), 5_000e6);
        curve.buy(5_000e6, 0, alice, vm.getBlockTimestamp());
        vm.stopPrank();

        // Treasury now keeps only the flat 15% platform share (no competition share), so 2/3 of the old 11.25e6.
        uint256 amount = feeVault.treasuryBalance(address(usdg));
        assertEq(amount, 7_500_000);
        feeVault.withdrawTreasury(address(usdg));
        assertEq(usdg.balanceOf(treasury), amount);
        assertEq(feeVault.accounted(address(usdg)), feeVault.creatorBalance(curve.token(), address(usdg)));
    }

    function test_sweepSurplus_booksStrayFundsToTheTreasury() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);
        _buyEth(curve, alice, 1 ether);

        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool sent,) = address(feeVault).call{value: 1 ether}("");
        assertTrue(sent);

        assertEq(feeVault.sweepSurplus(address(0)), 1 ether);
        assertEq(feeVault.treasuryBalance(address(0)), treasuryBefore + 1 ether);
        assertEq(feeVault.accounted(address(0)), address(feeVault).balance);

        vm.expectRevert(QualyraFeeVault.NothingToWithdraw.selector);
        feeVault.sweepSurplus(address(0));
    }

    function test_collectFees_routesBattleShareToPot() public {
        (QualyraLaunchToken token,) = _launch(address(0), 200);
        vm.deal(hook, 2 ether);

        vm.prank(hook);
        feeVault.collectFees{value: 1.2 ether}(address(token), 1 ether, 0.2 ether, 7);

        // Battle pot 7 is open, so the whole competition share (0.15) joins the pot; the league gets nothing (Phase 2).
        assertEq(competition.battlePot(7, address(0)), 0.15 ether);
        assertEq(competition.leaguePool(address(0)), 0);
        assertEq(feeVault.creatorBalance(address(token), address(0)), 0.7 ether + 0.2 ether);
        // Launch fee is now 100% treasury (0.0005) plus the flat 15% platform share (0.15).
        assertEq(feeVault.treasuryBalance(address(0)), 0.0005 ether + 0.15 ether);
    }

    function test_collectFees_fromHookAfterDirectTransfer() public {
        (QualyraLaunchToken token,) = _launch(address(usdg), 0);
        usdg.mint(hook, 100e6);

        vm.startPrank(hook);
        assertTrue(usdg.transfer(address(feeVault), 100e6));
        feeVault.collectFees(address(token), 100e6, 0, 0);
        vm.stopPrank();

        assertEq(feeVault.creatorBalance(address(token), address(usdg)), 70e6);
        // No open battle (battleId 0): competition 15e6 -> 4.5e6 league (30%) + 10.5e6 held as pending (70%).
        // Treasury keeps only its flat 15% platform share; it no longer takes any of the competition share.
        assertEq(competition.leaguePool(address(usdg)), 4_500_000);
        assertEq(feeVault.treasuryBalance(address(usdg)), 15_000_000);
    }

    function test_collectFees_rejectsUnknownCallers() public {
        (QualyraLaunchToken token,) = _launch(address(0), 0);
        vm.prank(alice);
        vm.expectRevert(QualyraFeeVault.Unauthorized.selector);
        feeVault.collectFees{value: 1 ether}(address(token), 1 ether, 0, 0);
    }

    function test_collectFees_rejectsUnfundedReports() public {
        (QualyraLaunchToken token,) = _launch(address(usdg), 0);
        vm.prank(hook);
        vm.expectRevert(QualyraFeeVault.FundsNotReceived.selector);
        feeVault.collectFees(address(token), 1e6, 0, 0);
    }

    function test_collectLaunchFee_onlyFactory() public {
        vm.prank(alice);
        vm.expectRevert(QualyraFeeVault.Unauthorized.selector);
        feeVault.collectLaunchFee{value: 1 ether}();
    }

    function test_setTreasury_onlyFactoryOwner() public {
        vm.prank(alice);
        vm.expectRevert(QualyraFeeVault.Unauthorized.selector);
        feeVault.setTreasury(alice);

        feeVault.setTreasury(bob);
        assertEq(feeVault.treasury(), bob);
    }
}

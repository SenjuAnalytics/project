// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Vm} from "forge-std/Vm.sol";

import {LaunchTestBase} from "./utils/LaunchTestBase.sol";
import {QualyraFactory} from "../src/QualyraFactory.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

contract QualyraLaunchTest is LaunchTestBase {
    uint256 internal constant SUPPLY = 1_000_000_000e18;

    // ---------------------------------------------------------------------------------------------
    // Factory
    // ---------------------------------------------------------------------------------------------

    function test_launch_deploysTokenAndCurve() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 250);

        assertEq(token.totalSupply(), SUPPLY);
        assertEq(token.balanceOf(address(curve)), SUPPLY);
        assertEq(token.name(), "Rocket");
        assertEq(curve.token(), address(token));
        assertEq(curve.tokenReserve(), SUPPLY);
        assertEq(curve.reservedTokens(), Math.ceilDiv(uint256(ETH_PHANTOM) * SUPPLY, ETH_PHANTOM + ETH_THRESHOLD));

        IQualyraFactory.Launch memory launch = factory.getLaunch(address(token));
        assertEq(launch.curve, address(curve));
        assertEq(launch.creator, creator);
        assertEq(launch.creatorTaxBps, 250);
        assertEq(launch.creatorShareBps, 7_000);
        assertEq(launch.competitionShareBps, 1_500);
        assertTrue(factory.isQualyraToken(address(token)));
        assertTrue(factory.isSnipeExempt(address(token), creator));
        assertEq(factory.feeRecipientOf(address(token)), creator);
        assertEq(factory.tokenCount(), 1);
    }

    function test_launch_sendsLaunchFeeToTreasury() public {
        _launch(address(0), 0);
        // Launch fee now goes 100% to the treasury; the Trader League no longer gets a cut of it.
        assertEq(feeVault.treasuryBalance(address(0)), 0.0005 ether);
        assertEq(competition.leaguePool(address(0)), 0);
    }

    function test_launch_revertsOnWrongFee() public {
        vm.prank(creator);
        vm.expectRevert(QualyraFactory.InvalidLaunchFee.selector);
        factory.launchToken{value: 0}(_params(address(0), 0));
    }

    function test_launch_revertsWhenCreatorTaxTooHigh() public {
        vm.prank(creator);
        vm.expectRevert(QualyraFactory.CreatorTaxTooHigh.selector);
        factory.launchToken{value: 0.0005 ether}(_params(address(0), 501));
    }

    function test_launch_revertsForDisabledAsset() public {
        factory.disableQuoteAsset(address(usdg));
        vm.prank(creator);
        vm.expectRevert(QualyraFactory.QuoteAssetNotEnabled.selector);
        factory.launchToken{value: 0.0005 ether}(_params(address(usdg), 0));
    }

    function test_launch_storesSnipeExemptions() public {
        IQualyraFactory.LaunchParams memory params = _params(address(0), 0);
        params.snipeExempt = new address[](2);
        params.snipeExempt[0] = alice;
        params.snipeExempt[1] = bob;

        vm.prank(creator);
        (address token,) = factory.launchToken{value: 0.0005 ether}(params);
        assertTrue(factory.isSnipeExempt(token, alice));
        assertTrue(factory.isSnipeExempt(token, bob));

        params.snipeExempt = new address[](33);
        vm.prank(creator);
        vm.expectRevert(QualyraFactory.TooManyExemptions.selector);
        factory.launchToken{value: 0.0005 ether}(params);
    }

    function test_launch_onlyRouterCanLaunchForOthers() public {
        vm.prank(alice);
        vm.expectRevert(QualyraFactory.Unauthorized.selector);
        factory.launchTokenFor{value: 0.0005 ether}(creator, _params(address(0), 0));
    }

    function test_initialize_onlyOnce() public {
        QualyraFactory.Modules memory modules;
        vm.expectRevert(QualyraFactory.AlreadyInitialized.selector);
        factory.initialize(modules);
    }

    function test_setters_areBounded() public {
        vm.expectRevert(QualyraFactory.InvalidConfig.selector);
        factory.setLaunchFee(0.06 ether);
        vm.expectRevert(QualyraFactory.InvalidConfig.selector);
        factory.setMaxCreatorTaxBps(1_001);
        vm.expectRevert(QualyraFactory.InvalidConfig.selector);
        factory.setSnipeParams(9_901, 5);
        vm.expectRevert(QualyraFactory.InvalidConfig.selector);
        factory.setFeeSplit(4_000, 3_000, 3_000);

        factory.setFeeSplit(8_000, 1_000, 1_000);
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        assertEq(factory.getLaunch(curve.token()).creatorShareBps, 8_000);
    }

    function test_setters_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setLaunchFee(0);
    }

    function test_renounceOwnership_disabled() public {
        vm.expectRevert(QualyraFactory.RenounceDisabled.selector);
        factory.renounceOwnership();
    }

    function test_setCreatorFeeRecipient() public {
        (QualyraLaunchToken token,) = _launch(address(0), 0);

        vm.prank(alice);
        vm.expectRevert(QualyraFactory.Unauthorized.selector);
        factory.setCreatorFeeRecipient(address(token), alice);

        vm.prank(creator);
        factory.setCreatorFeeRecipient(address(token), bob);
        assertEq(factory.feeRecipientOf(address(token)), bob);
    }

    // ---------------------------------------------------------------------------------------------
    // Curve trading
    // ---------------------------------------------------------------------------------------------

    function test_buy_eth_updatesReservesAndSplitsFee() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        uint256 tokensOut = _buyEth(curve, alice, 1 ether);

        uint256 expectedOut = SUPPLY - Math.ceilDiv(uint256(ETH_PHANTOM) * SUPPLY, ETH_PHANTOM + 0.99 ether);
        assertEq(tokensOut, expectedOut);
        assertEq(token.balanceOf(alice), expectedOut);
        assertEq(curve.quoteReserve(), 0.99 ether);
        assertEq(address(curve).balance, 0.99 ether);

        assertEq(feeVault.creatorBalance(address(token), address(0)), 0.007 ether);
        // Competition 0.0015 -> 30% (0.00045) to league, 70% (0.00105) held as pending. Treasury = launch fee (100%) + platform.
        assertEq(competition.leaguePool(address(0)), 0.00045 ether);
        assertEq(feeVault.treasuryBalance(address(0)), 0.0005 ether + 0.0015 ether);
    }

    function test_buy_creatorTaxGoesToCreator() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 500);
        skip(10);

        _buyEth(curve, alice, 1 ether);

        assertEq(curve.quoteReserve(), 0.94 ether);
        assertEq(feeVault.creatorBalance(address(token), address(0)), 0.007 ether + 0.05 ether);
    }

    function test_buy_snipeTaxDecays() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);

        QualyraBondingCurve.BuyQuote memory q = curve.quoteBuy(1 ether, alice);
        assertEq(q.snipeTax, 0.98 ether, "capped at 99% total");

        skip(1);
        assertEq(curve.quoteBuy(1 ether, alice).snipeTax, 0.2475 ether);
        skip(1);
        assertEq(curve.quoteBuy(1 ether, alice).snipeTax, 0.0309 ether);
        skip(3);
        assertEq(curve.quoteBuy(1 ether, alice).snipeTax, 0);
    }

    function test_defaultSnipeParamsMatchPons() public {
        QualyraFactory fresh = new QualyraFactory(address(this));
        assertEq(uint256(fresh.snipeWindow()), 15, "default window should match Pons (15s)");
        assertEq(uint256(fresh.snipeStartBps()), 9_900, "default snipe start should be 99%");
    }

    function test_buy_snipeTaxCappedWithCreatorTax() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 500);
        QualyraBondingCurve.BuyQuote memory q = curve.quoteBuy(1 ether, alice);
        assertEq(q.snipeTax, 0.93 ether);
        assertEq(q.tradeFee + q.creatorTax + q.snipeTax, 0.99 ether);
    }

    function test_buy_snipeTaxSkipsExemptWallets() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        assertEq(curve.quoteBuy(1 ether, creator).snipeTax, 0);
        assertGt(curve.quoteBuy(1 ether, alice).snipeTax, 0);
    }

    function test_buy_snipeTaxIsSplitLikeTradingFee() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        _buyEth(curve, alice, 1 ether);
        // 0.99 ether of trading fee plus snipe tax, 70% to the creator.
        assertEq(feeVault.creatorBalance(address(token), address(0)), 0.693 ether);
    }

    function test_sell_returnsQuoteMinusFees() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);
        uint256 tokensOut = _buyEth(curve, alice, 1 ether);

        uint256 balanceBefore = alice.balance;
        vm.startPrank(alice);
        token.approve(address(curve), tokensOut);
        uint256 amountOut = curve.sell(tokensOut, 0, alice, vm.getBlockTimestamp());
        vm.stopPrank();

        assertEq(amountOut, 0.9801 ether);
        assertEq(alice.balance - balanceBefore, 0.9801 ether);
        assertEq(curve.tokenReserve(), SUPPLY);
        assertEq(curve.quoteReserve(), 0);
    }

    function test_trade_revertsOnSlippageAndDeadline() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        vm.prank(alice);
        vm.expectRevert(QualyraBondingCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(1 ether, type(uint256).max, alice, vm.getBlockTimestamp());

        vm.prank(alice);
        vm.expectRevert(QualyraBondingCurve.Expired.selector);
        curve.buy{value: 1 ether}(1 ether, 0, alice, vm.getBlockTimestamp() - 1);

        vm.prank(alice);
        vm.expectRevert(QualyraBondingCurve.InvalidValue.selector);
        curve.buy{value: 0.5 ether}(1 ether, 0, alice, vm.getBlockTimestamp());
    }

    function test_buy_usdg() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(usdg), 0);
        skip(10);
        usdg.mint(alice, 1_000e6);

        vm.startPrank(alice);
        usdg.approve(address(curve), 1_000e6);
        uint256 tokensOut = curve.buy(1_000e6, 0, alice, vm.getBlockTimestamp());
        vm.stopPrank();

        assertEq(curve.quoteReserve(), 990e6);
        assertEq(usdg.balanceOf(address(curve)), 990e6);
        assertEq(token.balanceOf(alice), tokensOut);
        assertEq(feeVault.creatorBalance(address(token), address(usdg)), 7e6);
        // Competition 1.5e6 -> 30% (0.45e6) to league, 70% (1.05e6) held as pending. Treasury keeps only the flat 15%.
        assertEq(competition.leaguePool(address(usdg)), 450_000);
        assertEq(feeVault.treasuryBalance(address(usdg)), 1_500_000);
    }

    // ---------------------------------------------------------------------------------------------
    // Completion, graduation and refunds
    // ---------------------------------------------------------------------------------------------

    function test_completingBuy_refundsExcessAndGraduates() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        uint256 balanceBefore = alice.balance;
        _buyEth(curve, alice, 10 ether);

        uint256 used = Math.mulDiv(ETH_THRESHOLD, 10_000, 9_900, Math.Rounding.Ceil);
        assertEq(balanceBefore - alice.balance, used);
        assertEq(uint256(curve.phase()), uint256(QualyraBondingCurve.Phase.Graduated));
        assertEq(executor.lastQuoteAmount(), ETH_THRESHOLD);
        assertEq(executor.lastTokenAmount(), curve.reservedTokens());
        assertEq(token.balanceOf(address(executor)), curve.reservedTokens());
        assertEq(token.balanceOf(alice), SUPPLY - curve.reservedTokens());
        assertTrue(factory.isGraduated(address(token)));
    }

    /// @dev The completing buy reports what came back to the buyer. `Bought.amountIn` only carries what was USED,
    ///      so without this event the returned part leaves no trace on-chain at all.
    function test_completingBuy_emitsBuyRefunded() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        uint256 used = Math.mulDiv(ETH_THRESHOLD, 10_000, 9_900, Math.Rounding.Ceil);
        uint256 refund = 10 ether - used;
        assertGt(refund, 0);

        vm.expectEmit(address(curve));
        emit QualyraBondingCurve.BuyRefunded(alice, refund);
        _buyEth(curve, alice, 10 ether);
    }

    /// @dev A buy that is not clamped returns nothing, so it must not report a refund (a zero-amount event would
    ///      be noise for anything indexing it). recordLogs proves the event is ABSENT, not merely zero-valued.
    function test_plainBuy_emitsNoBuyRefunded() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        vm.recordLogs();
        _buyEth(curve, alice, 1 ether);

        bytes32 signature = keccak256("BuyRefunded(address,uint256)");
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != signature, "no refund -> no BuyRefunded");
        }
    }

    /// @dev A partial fill must NOT revert (Pons parity). The caller is filled for what the curve still needed and
    ///      the rest comes back in the same transaction, so a buy sized against a state someone else has already
    ///      moved cannot be griefed into failing outright.
    function test_partialFill_succeedsAndReturnsTheRest() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        // 4 ether nets 3.96 into the reserve, leaving 0.24 of the 4.2 threshold.
        _buyEth(curve, alice, 4 ether);

        // Bob offers 1 ether for a curve that only needs ~0.2424: the offer is clamped, not rejected.
        QualyraBondingCurve.BuyQuote memory q = curve.quoteBuy(1 ether, bob);
        assertLt(q.amountIn, 1 ether, "the offer is clamped to what completes the curve");
        assertEq(q.refund, 1 ether - q.amountIn);
        uint256 refund = q.refund;

        uint256 bobBefore = bob.balance;
        vm.prank(bob);
        vm.expectEmit(address(curve));
        emit QualyraBondingCurve.BuyRefunded(bob, refund);
        uint256 tokensOut = curve.buy{value: 1 ether}(1 ether, q.tokensOut, bob, vm.getBlockTimestamp());

        assertEq(tokensOut, q.tokensOut, "filled for exactly the quoted partial amount");
        assertEq(bobBefore - bob.balance, q.amountIn, "only the used part leaves Bob's wallet");
        assertEq(token.balanceOf(bob), q.tokensOut);
        assertEq(executor.lastQuoteAmount(), ETH_THRESHOLD, "the curve filled exactly to the threshold");
    }

    /// @dev The bound still bites on a partial fill: the caller cannot demand a better price than the one their own
    ///      arguments imply. Bob offers 1 ether but only ~0.2424 is spent, so his implied price allows a bound of
    ///      about 4.1x the fill — 5x is refused.
    function test_partialFill_stillRevertsWhenTheBoundBeatsThePrice() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);
        _buyEth(curve, alice, 4 ether);

        QualyraBondingCurve.BuyQuote memory q = curve.quoteBuy(1 ether, bob);
        assertLt(q.amountIn, 1 ether);

        vm.prank(bob);
        vm.expectRevert(QualyraBondingCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(1 ether, q.tokensOut * 5, bob, vm.getBlockTimestamp());
    }

    /// @dev On a buy the curve fills completely, the price bound is EXACTLY the old quantity bound: the quoted
    ///      amount passes, one token more is refused. This is what keeps ordinary buys as strict as before.
    function test_plainBuy_boundIsStillTheQuotedQuantity() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        QualyraBondingCurve.BuyQuote memory q = curve.quoteBuy(1 ether, alice);
        assertEq(q.refund, 0, "nothing to return when the curve has room");

        vm.prank(bob);
        vm.expectRevert(QualyraBondingCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(1 ether, q.tokensOut + 1, bob, vm.getBlockTimestamp());

        vm.prank(bob);
        curve.buy{value: 1 ether}(1 ether, q.tokensOut, bob, vm.getBlockTimestamp());
    }

    /// @dev An extreme bound must fail as SlippageExceeded, never as a 0x11 arithmetic panic — on a PARTIAL fill,
    ///      where the bound is crossed with a spend smaller than the offer. Pons' cross-multiplied form
    ///      (`spent * minTokensOut`) overflows on exactly this input; the mulDiv form is what it buys us.
    ///      (`test_trade_revertsOnSlippageAndDeadline` covers the same bound on an unclamped buy.)
    function test_partialFill_extremeBound_revertsAsSlippageNotOverflow() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);
        _buyEth(curve, alice, 4 ether);

        vm.prank(bob);
        vm.expectRevert(QualyraBondingCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(1 ether, type(uint256).max, bob, vm.getBlockTimestamp());
    }

    function test_completingBuy_defersGraduationWhenExecutorFails() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);
        executor.setShouldRevert(true);

        vm.expectEmit(address(curve));
        emit QualyraBondingCurve.GraduationDeferred();
        _buyEth(curve, alice, 10 ether);
        assertEq(uint256(curve.phase()), uint256(QualyraBondingCurve.Phase.Completed));

        vm.expectRevert(QualyraBondingCurve.WrongPhase.selector);
        _buyEth(curve, bob, 1 ether);

        executor.setShouldRevert(false);
        factory.graduate(curve.token());
        assertEq(uint256(curve.phase()), uint256(QualyraBondingCurve.Phase.Graduated));
    }

    /// @dev A completing buy that does not carry enough gas to build the pool must REVERT, not defer. This is
    ///      what makes eth_estimateGas provision graduation, so a real wallet's completing buy graduates itself
    ///      instead of parking the curve at Completed. Regression test for the stuck-at-Completed bug.
    function test_completingBuy_revertsWhenUnderfunded() public {
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        // Enough gas to run the buy body and reach the graduation check, but below GRADUATION_GAS_BUFFER, so
        // the curve refuses to complete on the cheap path.
        vm.prank(alice);
        vm.expectRevert(QualyraBondingCurve.InsufficientGasForGraduation.selector);
        curve.buy{value: 10 ether, gas: 700_000}(10 ether, 0, alice, vm.getBlockTimestamp());

        // The failed buy changed nothing: the curve is still trading and can graduate normally with full gas.
        assertEq(uint256(curve.phase()), uint256(QualyraBondingCurve.Phase.Trading));
        _buyEth(curve, alice, 10 ether);
        assertEq(uint256(curve.phase()), uint256(QualyraBondingCurve.Phase.Graduated));
    }

    function test_refunds_afterStuckDelay() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);
        executor.setShouldRevert(true);

        uint256 aliceTokens = _buyEth(curve, alice, 1 ether);
        uint256 bobTokens = _buyEth(curve, bob, 10 ether);

        vm.expectRevert(QualyraBondingCurve.TooEarly.selector);
        factory.recoverStuckLaunch(address(token));

        skip(7 days);
        factory.recoverStuckLaunch(address(token));
        assertEq(uint256(curve.phase()), uint256(QualyraBondingCurve.Phase.Refunding));
        assertEq(token.totalSupply(), aliceTokens + bobTokens);

        vm.startPrank(alice);
        token.approve(address(curve), aliceTokens);
        uint256 aliceRefund = curve.claimRefund(aliceTokens);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(curve), bobTokens);
        uint256 bobRefund = curve.claimRefund(bobTokens);
        vm.stopPrank();

        assertEq(aliceRefund + bobRefund, ETH_THRESHOLD);
        assertEq(address(curve).balance, 0);
        assertEq(token.totalSupply(), 0);
    }

    function test_refunds_coverTokensHoldersBurnedThemselves() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);
        executor.setShouldRevert(true);

        uint256 aliceTokens = _buyEth(curve, alice, 1 ether);
        uint256 bobTokens = _buyEth(curve, bob, 10 ether);

        uint256 burned = aliceTokens / 4;
        vm.prank(alice);
        token.burn(burned);

        skip(7 days);
        factory.recoverStuckLaunch(address(token));
        assertEq(curve.refundableTokens(), token.totalSupply());

        vm.startPrank(alice);
        token.approve(address(curve), aliceTokens - burned);
        uint256 aliceRefund = curve.claimRefund(aliceTokens - burned);
        vm.stopPrank();

        vm.startPrank(bob);
        token.approve(address(curve), bobTokens);
        uint256 bobRefund = curve.claimRefund(bobTokens);
        vm.stopPrank();

        // Burning tokens gives up that share of the refund, and the rest of the raise is still paid out in full.
        assertEq(aliceRefund + bobRefund, ETH_THRESHOLD);
        assertEq(address(curve).balance, 0);
        assertEq(token.totalSupply(), 0);
    }

    function test_recoverStuckLaunch_onlyOwner() public {
        (QualyraLaunchToken token,) = _launch(address(0), 0);
        vm.prank(alice);
        vm.expectRevert();
        factory.recoverStuckLaunch(address(token));
    }

    // ---------------------------------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------------------------------

    function testFuzz_buyThenSell_neverProfits(uint256 amount) public {
        amount = bound(amount, 1e9, 3.5 ether);
        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        _buyEth(curve, bob, 0.5 ether);
        uint256 tokensOut = _buyEth(curve, alice, amount);

        vm.startPrank(alice);
        token.approve(address(curve), tokensOut);
        uint256 amountOut = curve.sell(tokensOut, 0, alice, vm.getBlockTimestamp());
        vm.stopPrank();

        assertLt(amountOut, amount);
        assertEq(token.balanceOf(address(curve)), curve.tokenReserve());
        assertGe(address(curve).balance, curve.quoteReserve());
    }

    function testFuzz_priceRisesWithEveryBuy(uint256 first, uint256 second) public {
        first = bound(first, 1e9, 2 ether);
        second = bound(second, 1e9, 2 ether);
        (, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(10);

        uint256 p0 = curve.spotPrice();
        _buyEth(curve, alice, first);
        uint256 p1 = curve.spotPrice();
        _buyEth(curve, bob, second);
        uint256 p2 = curve.spotPrice();

        assertGt(p1, p0);
        assertGt(p2, p1);
    }
}

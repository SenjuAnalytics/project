// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

import {SystemTestBase} from "./utils/SystemTestBase.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";

import {MockERC20} from "./mocks/MockERC20.sol";
import {MockCompetitionVault} from "./mocks/MockCompetitionVault.sol";
import {IPoolModifyLiquidityTest} from "./utils/V4TestRouters.sol";

contract QualyraPoolTest is SystemTestBase {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    MockCompetitionVault internal competition;

    function setUp() public {
        _deployCore();
        competition = new MockCompetitionVault();
        _initialize(address(competition), makeAddr("burner"), makeAddr("router"));
    }

    // ---------------------------------------------------------------------------------------------
    // Graduation
    // ---------------------------------------------------------------------------------------------

    function test_graduation_opensPoolAtCurvePrice() public {
        (QualyraLaunchToken token, QualyraBondingCurve curve, PoolKey memory key) = _graduatedEthLaunch(0);

        assertTrue(factory.isGraduated(address(token)));
        assertEq(uint256(curve.phase()), uint256(QualyraBondingCurve.Phase.Graduated));
        assertEq(Currency.unwrap(key.currency0), address(0));
        assertEq(Currency.unwrap(key.currency1), address(token));

        (uint160 sqrtPriceX96,,,) = manager.getSlot0(key.toId());
        uint256 poolTokensPerEth = FullMath.mulDiv(uint256(sqrtPriceX96) * sqrtPriceX96, 1e18, 1 << 192);
        uint256 curveTokensPerEth = FullMath.mulDiv(curve.reservedTokens(), 1e18, ETH_PHANTOM + ETH_THRESHOLD);
        assertApproxEqRel(poolTokensPerEth, curveTokensPerEth, 1e12);

        (,,, uint128 liquidity) = locker.positionOf(address(token));
        assertApproxEqRel(liquidity, Math.sqrt(uint256(ETH_PHANTOM) * SUPPLY), 0.01e18);
        assertEq(manager.getLiquidity(key.toId()), liquidity);

        assertEq(token.balanceOf(address(curve)), 0);
        assertEq(address(curve).balance, 0);
        assertEq(token.balanceOf(address(executor)), 0);
        assertEq(address(executor).balance, 0);
        assertApproxEqAbs(address(manager).balance, ETH_THRESHOLD, 10);
        assertLe(token.totalSupply(), SUPPLY);
        assertApproxEqRel(token.totalSupply(), SUPPLY, 0.001e18);
    }

    function test_graduation_holdersCanSellEverythingBack() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        uint256 tokens = token.balanceOf(alice);
        _approveRouter(alice, address(token));
        uint256 before = alice.balance;
        _swap(key, alice, false, -SafeCast.toInt256(tokens), 0);

        // The pool gives back what the curve raised, less the 1% fee.
        assertApproxEqRel(alice.balance - before, 4.158 ether, 0.005e18);
    }

    function test_hook_rejectsForeignPoolsAndLiquidity() public {
        (,, PoolKey memory key) = _graduatedEthLaunch(0);

        MockERC20 other = new MockERC20("Other", "OTH", 18);
        PoolKey memory foreign = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(address(other)),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        vm.expectRevert();
        manager.initialize(foreign, TickMath.getSqrtPriceAtTick(0));

        IPoolModifyLiquidityTest lpRouter = IPoolModifyLiquidityTest(
            deployCode("PoolModifyLiquidityTest.sol:PoolModifyLiquidityTest", abi.encode(address(manager)))
        );
        vm.expectRevert();
        lpRouter.modifyLiquidity{value: 1 ether}(
            key, ModifyLiquidityParams({tickLower: -600, tickUpper: 600, liquidityDelta: 1e18, salt: 0}), ""
        );
    }

    // ---------------------------------------------------------------------------------------------
    // Fees on pool swaps
    // ---------------------------------------------------------------------------------------------

    function test_buyExactInput_takesFeeFromInput() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        uint256 before = bob.balance;
        _swap(key, bob, true, -1 ether, 1 ether);

        assertEq(before - bob.balance, 1 ether);
        assertGt(token.balanceOf(bob), 0);
        (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(address(token), 0);
        assertEq(tradeFee, 0.01 ether);
        assertEq(creatorTax, 0);
        assertEq(manager.balanceOf(address(hook), key.currency0.toId()), 0.01 ether);
    }

    function test_sweep_movesFeesToVault() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);
        _swap(key, bob, true, -1 ether, 1 ether);

        uint256 creatorBefore = feeVault.creatorBalance(address(token), address(0));
        uint256 treasuryBefore = feeVault.treasuryBalance(address(0));
        uint256 leagueBefore = competition.leaguePool(address(0));

        hook.sweepFees(address(token), 0);

        assertEq(feeVault.creatorBalance(address(token), address(0)) - creatorBefore, 0.007 ether);
        // Treasury keeps only the flat 15%; league gets 30% of competition; the 70% battle share is bucketed elsewhere.
        assertEq(feeVault.treasuryBalance(address(0)) - treasuryBefore, 0.0015 ether);
        assertEq(competition.leaguePool(address(0)) - leagueBefore, 0.00045 ether);
        assertEq(manager.balanceOf(address(hook), key.currency0.toId()), 0);

        (uint128 tradeFee,) = hook.accruedFees(address(token), 0);
        assertEq(tradeFee, 0);
    }

    function test_sellExactInput_takesFeeFromOutput() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        uint256 tokens = token.balanceOf(alice) / 10;
        _approveRouter(alice, address(token));
        uint256 before = alice.balance;
        _swap(key, alice, false, -SafeCast.toInt256(tokens), 0);

        uint256 received = alice.balance - before;
        (uint128 tradeFee,) = hook.accruedFees(address(token), 0);
        assertGt(received, 0);
        assertEq(tradeFee, (received + tradeFee) / 100);
    }

    function test_buyExactOutput_addsFeeOnTop() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        BalanceDelta delta = _swap(key, bob, true, int256(1_000_000e18), 1 ether);

        uint256 paid = uint256(uint128(-delta.amount0()));
        (uint128 tradeFee,) = hook.accruedFees(address(token), 0);
        uint256 net = paid - tradeFee;
        assertEq(token.balanceOf(bob), 1_000_000e18);
        assertEq(tradeFee, Math.mulDiv(net, 10_000, 9_900, Math.Rounding.Ceil) - net);
    }

    function test_sellExactOutput_paysExactAmount() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        _approveRouter(alice, address(token));
        uint256 before = alice.balance;
        _swap(key, alice, false, int256(0.1 ether), 0);

        assertEq(alice.balance - before, 0.1 ether);
        (uint128 tradeFee,) = hook.accruedFees(address(token), 0);
        assertEq(tradeFee, Math.mulDiv(0.1 ether, 10_000, 9_900, Math.Rounding.Ceil) - 0.1 ether);
    }

    function test_creatorTaxAppliesOnPool() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(300);
        _swap(key, bob, true, -1 ether, 1 ether);

        (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(address(token), 0);
        assertEq(tradeFee, 0.01 ether);
        assertEq(creatorTax, 0.03 ether);
    }

    function test_battleFeesAreBucketedAndRoutedToPot() public {
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(0);

        competition.setBattle(address(token), 9);
        _swap(key, bob, true, -1 ether, 1 ether);
        (uint128 battleFee,) = hook.accruedFees(address(token), 9);
        assertEq(battleFee, 0.01 ether);

        competition.setBattle(address(token), 0);
        _swap(key, bob, true, -1 ether, 1 ether);
        (uint128 normalFee,) = hook.accruedFees(address(token), 0);
        assertEq(normalFee, 0.01 ether);

        hook.sweepFees(address(token), 9);
        // Battle pot 9 is open, so the whole competition share (0.0015) joins the pot; nothing splits to the league (Phase 2).
        assertEq(competition.battlePot(9, address(0)), 0.0015 ether);
    }

    // ---------------------------------------------------------------------------------------------
    // ERC-20 pair assets on both sides of the pool
    // ---------------------------------------------------------------------------------------------

    function test_usdgPool_whenUsdgIsCurrency0() public {
        _checkUsdgPool(address(0x1000));
    }

    function test_usdgPool_whenUsdgIsCurrency1() public {
        _checkUsdgPool(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF);
    }

    function _checkUsdgPool(address usdgAddress) private {
        deployCodeTo("MockERC20.sol:MockERC20", abi.encode("Global Dollar", "USDG", uint8(6)), usdgAddress);
        MockERC20 usdg = MockERC20(usdgAddress);
        factory.setQuoteAsset(usdgAddress, USDG_PHANTOM, USDG_THRESHOLD, 6);

        (QualyraLaunchToken token, QualyraBondingCurve curve) = _launch(usdgAddress, 0);
        skip(10);
        usdg.mint(alice, 20_000e6);
        vm.startPrank(alice);
        usdg.approve(address(curve), 20_000e6);
        curve.buy(20_000e6, 0, alice, vm.getBlockTimestamp());
        vm.stopPrank();

        assertTrue(factory.isGraduated(address(token)));
        PoolKey memory key = hook.poolKeyOf(address(token));
        bool usdgIsCurrency0 = Currency.unwrap(key.currency0) == usdgAddress;
        assertEq(usdgIsCurrency0, usdgAddress < address(token));

        usdg.mint(bob, 1_000e6);
        _approveRouter(bob, usdgAddress);
        _swap(key, bob, usdgIsCurrency0, -100e6, 0);
        assertGt(token.balanceOf(bob), 0);
        (uint128 tradeFee,) = hook.accruedFees(address(token), 0);
        assertEq(tradeFee, 1e6);

        _approveRouter(bob, address(token));
        uint256 usdgBefore = usdg.balanceOf(bob);
        _swap(key, bob, !usdgIsCurrency0, -SafeCast.toInt256(token.balanceOf(bob)), 0);
        assertApproxEqRel(usdg.balanceOf(bob) - usdgBefore, 98.01e6, 0.001e18);

        hook.sweepFees(address(token), 0);
        assertEq(usdg.balanceOf(address(hook)), 0);
        assertGt(feeVault.creatorBalance(address(token), usdgAddress), 0);
    }

    // ---------------------------------------------------------------------------------------------
    // Fuzz
    // ---------------------------------------------------------------------------------------------

    function testFuzz_claimsMatchAccruedFees(uint256 buyAmount, uint256 sellShare) public {
        buyAmount = bound(buyAmount, 1e12, 50 ether);
        sellShare = bound(sellShare, 1, 100);
        (QualyraLaunchToken token,, PoolKey memory key) = _graduatedEthLaunch(250);

        _swap(key, bob, true, -SafeCast.toInt256(buyAmount), buyAmount);
        uint256 tokens = token.balanceOf(bob) * sellShare / 100;
        if (tokens != 0) {
            _approveRouter(bob, address(token));
            _swap(key, bob, false, -SafeCast.toInt256(tokens), 0);
        }

        (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(address(token), 0);
        assertEq(manager.balanceOf(address(hook), key.currency0.toId()), uint256(tradeFee) + creatorTax);
    }
}

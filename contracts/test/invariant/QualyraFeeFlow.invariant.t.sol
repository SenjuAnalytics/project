// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

import {CompetitionTestBase} from "../utils/CompetitionTestBase.sol";
import {IPoolSwapTest} from "../utils/V4TestRouters.sol";
import {QualyraHook} from "../../src/QualyraHook.sol";
import {QualyraFeeVault} from "../../src/QualyraFeeVault.sol";
import {QualyraLaunchToken} from "../../src/QualyraLaunchToken.sol";

/// @dev Trades both pools in every direction, sweeps fees and moves time through a battle.
contract FeeFlowHandler is Test {
    IPoolSwapTest internal immutable swapRouter;
    QualyraHook internal immutable hook;
    QualyraFeeVault internal immutable feeVault;
    uint256 internal immutable battleId;

    QualyraLaunchToken[2] internal tokens;
    PoolKey[2] internal keys;
    address[3] internal traders;

    constructor(
        IPoolSwapTest swapRouter_,
        QualyraHook hook_,
        QualyraFeeVault feeVault_,
        QualyraLaunchToken[2] memory tokens_,
        PoolKey[2] memory keys_,
        uint256 battleId_
    ) {
        swapRouter = swapRouter_;
        hook = hook_;
        feeVault = feeVault_;
        tokens = tokens_;
        keys[0] = keys_[0];
        keys[1] = keys_[1];
        battleId = battleId_;
        traders = [makeAddr("trader0"), makeAddr("trader1"), makeAddr("trader2")];
    }

    function buyExactIn(uint256 seed, uint256 amount) external {
        amount = bound(amount, 1e9, 5 ether);
        address trader = traders[seed % 3];
        vm.deal(trader, trader.balance + amount);
        _swap(seed % 2, trader, true, -SafeCast.toInt256(amount), amount);
    }

    function buyExactOut(uint256 seed, uint256 tokensOut) external {
        tokensOut = bound(tokensOut, 1e12, 5_000_000e18);
        address trader = traders[seed % 3];
        vm.deal(trader, trader.balance + 50 ether);
        _swap(seed % 2, trader, true, SafeCast.toInt256(tokensOut), 50 ether);
    }

    function sellExactIn(uint256 seed, uint256 share) external {
        uint256 i = seed % 2;
        address trader = traders[seed % 3];
        uint256 amount = tokens[i].balanceOf(trader) * bound(share, 1, 100) / 100;
        if (amount == 0) return;
        _approve(i, trader);
        _swap(i, trader, false, -SafeCast.toInt256(amount), 0);
    }

    function sellExactOut(uint256 seed, uint256 ethOut) external {
        uint256 i = seed % 2;
        address trader = traders[seed % 3];
        if (tokens[i].balanceOf(trader) == 0) return;
        ethOut = bound(ethOut, 1e9, 0.5 ether);
        _approve(i, trader);
        _swap(i, trader, false, SafeCast.toInt256(ethOut), 0);
    }

    function sweep(uint256 seed, bool battleBucket) external {
        hook.sweepFees(address(tokens[seed % 2]), battleBucket ? battleId : 0);
    }

    function withdrawCreatorFees(uint256 seed) external {
        address token = address(tokens[seed % 2]);
        if (feeVault.creatorBalance(token, address(0)) != 0) feeVault.withdrawCreatorFees(token, address(0));
    }

    function withdrawTreasury() external {
        if (feeVault.treasuryBalance(address(0)) != 0) feeVault.withdrawTreasury(address(0));
    }

    function passTime(uint256 secondsToPass) external {
        skip(bound(secondsToPass, 1, 8 hours));
    }

    function _swap(uint256 i, address trader, bool zeroForOne, int256 amountSpecified, uint256 value) private {
        vm.prank(trader);
        swapRouter.swap{value: value}(
            keys[i],
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            IPoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _approve(uint256 i, address trader) private {
        vm.prank(trader);
        tokens[i].approve(address(swapRouter), type(uint256).max);
    }
}

/// @dev Whatever order trades, sweeps and withdrawals happen in, every contract holds exactly what it owes.
contract QualyraFeeFlowInvariantTest is CompetitionTestBase {
    FeeFlowHandler internal handler;
    QualyraLaunchToken internal tokenA;
    QualyraLaunchToken internal tokenB;
    uint256 internal battleId;

    function setUp() public {
        _deploySystem();
        PoolKey memory keyA;
        PoolKey memory keyB;
        (tokenA,, keyA) = _graduatedEthLaunch(300);
        (tokenB,, keyB) = _graduatedEthLaunch(0);
        // Spec §2.1: both tokens must be eligible before they can be scheduled to battle.
        _makeEligible(address(tokenA));
        _makeEligible(address(tokenB));
        battleId = _scheduleBattle(address(tokenA), address(tokenB), _nextMidnight());

        handler = new FeeFlowHandler(swapRouter, hook, feeVault, [tokenA, tokenB], [keyA, keyB], battleId);
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_feeVaultOwesExactlyItsBalance() public view {
        uint256 owed = feeVault.treasuryBalance(address(0)) + feeVault.creatorBalance(address(tokenA), address(0))
            + feeVault.creatorBalance(address(tokenB), address(0));
        assertEq(feeVault.accounted(address(0)), owed);
        assertEq(address(feeVault).balance, owed);
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_competitionVaultOwesExactlyItsBalance() public view {
        // The competition share now also holds each token's pending battle share (accrued while no battle pot
        // is open), which seeds that token's next battle. It is owed by the vault just like a pot or league pool.
        uint256 owed = competition.bootstrapPool(address(0)) + competition.getBattle(battleId).pot
            + competition.pendingBattlePot(address(tokenA), address(0))
            + competition.pendingBattlePot(address(tokenB), address(0));
        assertEq(competition.accounted(address(0)), owed);
        assertEq(address(competition).balance, owed);
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_hookClaimsMatchAccruedFees() public view {
        uint256 accrued;
        address[2] memory tokens = [address(tokenA), address(tokenB)];
        uint256[2] memory buckets = [uint256(0), battleId];
        for (uint256 i; i < 2; ++i) {
            for (uint256 j; j < 2; ++j) {
                (uint128 tradeFee, uint128 creatorTax) = hook.accruedFees(tokens[i], buckets[j]);
                accrued += uint256(tradeFee) + creatorTax;
            }
        }
        uint256 claims = IPoolManager(address(manager)).balanceOf(address(hook), CurrencyLibrary.ADDRESS_ZERO.toId());
        assertEq(claims, accrued);
    }

    /// forge-config: default.invariant.runs = 64
    /// forge-config: default.invariant.depth = 80
    function invariant_contributionSumEqualsPot() public view {
        // Every pot increment — the pending pot seeded on schedule plus each live battle-share fee — is mirrored
        // into contributionOf, so the two tokens' recorded contributions always add up to exactly the pot. This is
        // what lets a Draw or a Void refund each token precisely its own share (spec §2.2 / §5.4 / §5.5).
        assertEq(
            competition.contributionOf(battleId, address(tokenA)) + competition.contributionOf(battleId, address(tokenB)),
            competition.getBattle(battleId).pot
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";

import {QualyraLaunchToken} from "./QualyraLaunchToken.sol";
import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraFeeVault} from "./interfaces/IQualyraFeeVault.sol";
import {IQualyraBondingCurve} from "./interfaces/IQualyraBondingCurve.sol";
import {IQualyraHook} from "./interfaces/IQualyraHook.sol";
import {IQualyraLiquidityLocker} from "./interfaces/IQualyraLiquidityLocker.sol";

/// @title QualyraGraduationExecutor
/// @notice Creates the Uniswap v4 pool of a completed curve and hands the liquidity to the locker.
/// @dev The pool opens at the curve's final marginal price. Its single position runs from the curve's
///      starting price to the end of the tick range, which gives it the same liquidity as the curve's
///      constant product, so trading continues without a price jump. The range edge is rounded outward to
///      the tick spacing, so the raised amount is used in full and a few reserved tokens may be left over.
contract QualyraGraduationExecutor {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    int24 public constant TICK_SPACING = 60;
    /// @dev Outermost ticks that are multiples of TICK_SPACING.
    int24 private constant MIN_USABLE_TICK = -887_220;
    int24 private constant MAX_USABLE_TICK = 887_220;

    struct Plan {
        address token;
        address quoteAsset;
        uint256 quoteAmount;
        uint256 tokenAmount;
        PoolKey key;
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    IPoolManager public immutable poolManager;
    IQualyraFactory public immutable factory;

    event PoolCreated(
        address indexed token,
        bytes32 indexed poolId,
        uint160 sqrtPriceX96,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity
    );

    error Unauthorized();
    error InvalidValue();
    error PriceOutOfRange();
    error NoLiquidity();

    constructor(IPoolManager poolManager_, IQualyraFactory factory_) {
        poolManager = poolManager_;
        factory = factory_;
    }

    /// @dev Receives unused ETH back from the locker.
    receive() external payable {}

    /// @notice Called by a curve once it has sent over the amount raised and its reserved tokens.
    function graduate(address token, uint256 quoteAmount, uint256 tokenAmount, uint256 phantomQuote)
        external
        payable
    {
        IQualyraFactory.Launch memory launch = factory.getLaunch(token);
        if (msg.sender != launch.curve) revert Unauthorized();
        if (msg.value != (launch.quoteAsset == address(0) ? quoteAmount : 0)) revert InvalidValue();

        Plan memory plan = _plan(
            token, launch.quoteAsset, quoteAmount, tokenAmount, phantomQuote, IQualyraBondingCurve(msg.sender).supply()
        );

        IQualyraHook(address(plan.key.hooks)).registerPool(plan.key, token);
        poolManager.initialize(plan.key, plan.sqrtPriceX96);
        _lock(plan);
        _handleLeftovers(token, launch.quoteAsset);
        factory.markGraduated(token);

        emit PoolCreated(
            token,
            PoolId.unwrap(plan.key.toId()),
            plan.sqrtPriceX96,
            plan.tickLower,
            plan.tickUpper,
            plan.liquidity
        );
    }

    /// @notice Reverts if a pair asset setting would put either the starting or the graduation price outside
    ///         the Uniswap v4 price range, for either currency ordering.
    function checkEconomics(address, uint256 phantomQuote, uint256 graduationThreshold, uint256 supply)
        external
        pure
    {
        uint256 reserved = Math.ceilDiv(phantomQuote * supply, phantomQuote + graduationThreshold);
        uint256 finalQuote = phantomQuote + graduationThreshold;
        _poolRange(true, finalQuote, reserved, phantomQuote, supply);
        _poolRange(false, finalQuote, reserved, phantomQuote, supply);
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _plan(
        address token,
        address quoteAsset,
        uint256 quoteAmount,
        uint256 tokenAmount,
        uint256 phantomQuote,
        uint256 supply
    ) private view returns (Plan memory plan) {
        plan.token = token;
        plan.quoteAsset = quoteAsset;
        plan.quoteAmount = quoteAmount;
        plan.tokenAmount = tokenAmount;

        bool quoteIsCurrency0 = quoteAsset < token;
        plan.key = PoolKey({
            currency0: Currency.wrap(quoteIsCurrency0 ? quoteAsset : token),
            currency1: Currency.wrap(quoteIsCurrency0 ? token : quoteAsset),
            fee: 0,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(factory.hook())
        });

        (plan.sqrtPriceX96, plan.tickLower, plan.tickUpper) =
            _poolRange(quoteIsCurrency0, phantomQuote + quoteAmount, tokenAmount, phantomQuote, supply);

        // One unit is held back on each side so rounding inside the PoolManager never asks for more than was sent.
        (uint256 amount0, uint256 amount1) =
            quoteIsCurrency0 ? (quoteAmount - 1, tokenAmount - 1) : (tokenAmount - 1, quoteAmount - 1);
        plan.liquidity = LiquidityAmounts.getLiquidityForAmounts(
            plan.sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(plan.tickLower),
            TickMath.getSqrtPriceAtTick(plan.tickUpper),
            amount0,
            amount1
        );
        if (plan.liquidity == 0) revert NoLiquidity();
    }

    function _lock(Plan memory plan) private {
        address locker = factory.liquidityLocker();
        IERC20(plan.token).safeTransfer(locker, plan.tokenAmount);
        if (plan.quoteAsset == address(0)) {
            IQualyraLiquidityLocker(locker).lockLiquidity{value: plan.quoteAmount}(
                plan.token, plan.key, plan.tickLower, plan.tickUpper, plan.liquidity
            );
        } else {
            IERC20(plan.quoteAsset).safeTransfer(locker, plan.quoteAmount);
            IQualyraLiquidityLocker(locker).lockLiquidity(
                plan.token, plan.key, plan.tickLower, plan.tickUpper, plan.liquidity
            );
        }
    }

    /// @param virtualQuote Phantom reserve plus the amount raised, the curve's final virtual pair asset reserve.
    function _poolRange(
        bool quoteIsCurrency0,
        uint256 virtualQuote,
        uint256 tokenAmount,
        uint256 phantomQuote,
        uint256 supply
    ) private pure returns (uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper) {
        if (quoteIsCurrency0) {
            // Price is tokens per unit of pair asset and falls as the token gets more expensive.
            sqrtPriceX96 = _sqrtPrice(tokenAmount, virtualQuote);
            int24 startTick = TickMath.getTickAtSqrtPrice(_sqrtPrice(supply, phantomQuote));
            tickLower = MIN_USABLE_TICK;
            tickUpper = _ceilTick(startTick + 1);
            if (TickMath.getSqrtPriceAtTick(tickUpper) <= sqrtPriceX96) revert PriceOutOfRange();
        } else {
            // Price is pair asset per token and rises as the token gets more expensive.
            sqrtPriceX96 = _sqrtPrice(virtualQuote, tokenAmount);
            int24 startTick = TickMath.getTickAtSqrtPrice(_sqrtPrice(phantomQuote, supply));
            tickLower = _floorTick(startTick);
            tickUpper = MAX_USABLE_TICK;
            if (TickMath.getSqrtPriceAtTick(tickLower) >= sqrtPriceX96) revert PriceOutOfRange();
        }
    }

    /// @dev sqrt(numerator / denominator) as a Q64.96 value.
    function _sqrtPrice(uint256 numerator, uint256 denominator) private pure returns (uint160) {
        if (denominator == 0 || numerator >= denominator << 64) revert PriceOutOfRange();
        uint256 sqrtPrice = Math.sqrt(FullMath.mulDiv(numerator, 1 << 192, denominator));
        if (sqrtPrice < TickMath.MIN_SQRT_PRICE || sqrtPrice >= TickMath.MAX_SQRT_PRICE) revert PriceOutOfRange();
        return SafeCast.toUint160(sqrtPrice);
    }

    function _floorTick(int24 tick) private pure returns (int24) {
        int24 compressed = tick / TICK_SPACING;
        if (tick < 0 && tick % TICK_SPACING != 0) compressed--;
        return compressed * TICK_SPACING;
    }

    function _ceilTick(int24 tick) private pure returns (int24) {
        int24 compressed = tick / TICK_SPACING;
        if (tick > 0 && tick % TICK_SPACING != 0) compressed++;
        return compressed * TICK_SPACING;
    }

    /// @dev Tokens the position did not take are burned. Pair asset dust, a few units at most, is booked as a
    ///      trading fee, and so is anything else sitting here, such as funds sent to this contract by mistake.
    function _handleLeftovers(address token, address quoteAsset) private {
        uint256 tokenLeft = IERC20(token).balanceOf(address(this));
        if (tokenLeft != 0) QualyraLaunchToken(token).burn(tokenLeft);

        uint256 quoteLeft = quoteAsset == address(0) ? address(this).balance : IERC20(quoteAsset).balanceOf(address(this));
        if (quoteLeft == 0) return;

        address vault = factory.feeVault();
        if (quoteAsset == address(0)) {
            IQualyraFeeVault(vault).collectFees{value: quoteLeft}(token, quoteLeft, 0, 0);
        } else {
            IERC20(quoteAsset).safeTransfer(vault, quoteLeft);
            IQualyraFeeVault(vault).collectFees(token, quoteLeft, 0, 0);
        }
    }
}

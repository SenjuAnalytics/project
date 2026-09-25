// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

import {IQualyraFactory} from "../interfaces/IQualyraFactory.sol";
import {IQualyraHook} from "../interfaces/IQualyraHook.sol";

/// @title QualyraSwapRouter
/// @notice Exact-input swaps against the Uniswap v4 pool of a graduated Qualyra token.
/// @dev Periphery, not part of the nine platform contracts. Nothing in the core trusts it, it holds no balance
///      between transactions and it has no owner, no admin and no upgrade path. Anyone may deploy their own or
///      route through any other v4 router instead; this one exists so the Qualyra interface can offer a swap.
///
///      The swap always runs across the full price range and slippage is enforced with `minAmountOut` alone.
///      That is deliberate: QualyraHook rejects a swap that stops early at a price limit while the pair asset is
///      the specified currency, because the fee is taken before the swap runs and a partial fill would charge on
///      an amount that never traded. Passing the full range keeps every swap a complete fill.
contract QualyraSwapRouter is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolManager public immutable poolManager;
    IQualyraFactory public immutable factory;

    event Swapped(
        address indexed token,
        address indexed payer,
        address indexed recipient,
        bool buyingToken,
        uint256 amountIn,
        uint256 amountOut
    );

    error NotPoolManager();
    error DeadlinePassed();
    error NotGraduated();
    error InvalidAmount();
    error InvalidRecipient();
    error UnexpectedValue();
    error TooLittleReceived(uint256 amountOut, uint256 minAmountOut);

    constructor(IPoolManager poolManager_, IQualyraFactory factory_) {
        poolManager = poolManager_;
        factory = factory_;
    }

    /// @dev Only the PoolManager returning native currency, and refunds from it.
    receive() external payable {}

    /// @notice Swaps `amountIn` for as much of the other side as the pool gives, in one exact-input swap.
    /// @param token A graduated Qualyra token. Its pool and pair asset are read from the hook and the factory.
    /// @param buyingToken True to spend the pair asset and receive `token`, false for the other direction.
    /// @param amountIn Amount of the input currency. For native ETH input it must equal `msg.value`.
    /// @param minAmountOut Reverts below this, which is the only slippage protection on this path.
    /// @param recipient Receives the output.
    /// @param deadline Latest block timestamp this may execute at.
    function swapExactIn(
        address token,
        bool buyingToken,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (amountIn == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidRecipient();
        if (!factory.isGraduated(token)) revert NotGraduated();

        address quoteAsset = factory.getLaunch(token).quoteAsset;
        address assetIn = buyingToken ? quoteAsset : token;
        bool nativeIn = assetIn == address(0);

        // Take the input up front so the unlock callback only moves this contract's own balance.
        if (nativeIn) {
            if (msg.value != amountIn) revert UnexpectedValue();
        } else {
            if (msg.value != 0) revert UnexpectedValue();
            IERC20(assetIn).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        PoolKey memory key = IQualyraHook(factory.hook()).poolKeyOf(token);
        uint256 spent;
        (spent, amountOut) =
            abi.decode(poolManager.unlock(abi.encode(key, assetIn, amountIn, recipient)), (uint256, uint256));

        if (amountOut < minAmountOut) revert TooLittleReceived(amountOut, minAmountOut);

        // The pool consumes the whole exact input, but refund anything left rather than stranding it here.
        uint256 unspent = amountIn - spent;
        if (unspent != 0) {
            if (nativeIn) {
                Address.sendValue(payable(msg.sender), unspent);
            } else {
                IERC20(assetIn).safeTransfer(msg.sender, unspent);
            }
        }

        emit Swapped(token, msg.sender, recipient, buyingToken, spent, amountOut);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, address assetIn, uint256 amountIn, address recipient) =
            abi.decode(data, (PoolKey, address, uint256, address));

        bool zeroForOne = Currency.unwrap(key.currency0) == assetIn;
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -SafeCast.toInt256(amountIn),
                // Full range: the hook rejects a partial fill, so never stop the swap early on price.
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        (int128 inDelta, int128 outDelta) =
            zeroForOne ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());
        uint256 spent = SafeCast.toUint256(-int256(inDelta));
        uint256 received = SafeCast.toUint256(int256(outDelta));

        if (spent != 0) {
            Currency currencyIn = zeroForOne ? key.currency0 : key.currency1;
            if (currencyIn.isAddressZero()) {
                poolManager.settle{value: spent}();
            } else {
                poolManager.sync(currencyIn);
                IERC20(Currency.unwrap(currencyIn)).safeTransfer(address(poolManager), spent);
                poolManager.settle();
            }
        }
        if (received != 0) {
            poolManager.take(zeroForOne ? key.currency1 : key.currency0, recipient, received);
        }

        return abi.encode(spent, received);
    }
}

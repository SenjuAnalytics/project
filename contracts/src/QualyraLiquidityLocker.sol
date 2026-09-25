// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";

/// @title QualyraLiquidityLocker
/// @notice Owns the liquidity position of every graduated pool directly in the PoolManager. There is no
///         function to remove or move liquidity, so the position stays in the pool forever.
contract QualyraLiquidityLocker is IUnlockCallback {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    struct Position {
        PoolId poolId;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    IPoolManager public immutable poolManager;
    IQualyraFactory public immutable factory;

    mapping(address token => Position) public positionOf;

    event LiquidityLocked(
        address indexed token, PoolId indexed poolId, int24 tickLower, int24 tickUpper, uint128 liquidity
    );

    error Unauthorized();
    error NotPoolManager();
    error AlreadyLocked();

    constructor(IPoolManager poolManager_, IQualyraFactory factory_) {
        poolManager = poolManager_;
        factory = factory_;
    }

    /// @notice Adds `liquidity` to the pool of `token` from funds sent by the graduation executor.
    ///         Whatever the position does not use goes back to the executor.
    function lockLiquidity(address token, PoolKey calldata key, int24 tickLower, int24 tickUpper, uint128 liquidity)
        external
        payable
    {
        if (msg.sender != factory.graduationExecutor()) revert Unauthorized();
        if (positionOf[token].liquidity != 0) revert AlreadyLocked();

        positionOf[token] =
            Position({poolId: key.toId(), tickLower: tickLower, tickUpper: tickUpper, liquidity: liquidity});
        poolManager.unlock(abi.encode(key, tickLower, tickUpper, liquidity));

        _returnBalance(key.currency0, msg.sender);
        _returnBalance(key.currency1, msg.sender);

        emit LiquidityLocked(token, key.toId(), tickLower, tickUpper, liquidity);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        (PoolKey memory key, int24 tickLower, int24 tickUpper, uint128 liquidity) =
            abi.decode(data, (PoolKey, int24, int24, uint128));

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: bytes32(0)
            }),
            ""
        );

        _settle(key.currency0, SafeCast.toUint256(-delta.amount0()));
        _settle(key.currency1, SafeCast.toUint256(-delta.amount1()));
        return "";
    }

    function _settle(Currency currency, uint256 amount) private {
        if (amount == 0) return;
        if (currency.isAddressZero()) {
            poolManager.settle{value: amount}();
        } else {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).safeTransfer(address(poolManager), amount);
            poolManager.settle();
        }
    }

    function _returnBalance(Currency currency, address to) private {
        uint256 balance = currency.balanceOfSelf();
        if (balance != 0) currency.transfer(to, balance);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

interface IQualyraLiquidityLocker {
    function lockLiquidity(address token, PoolKey calldata key, int24 tickLower, int24 tickUpper, uint128 liquidity)
        external
        payable;
}

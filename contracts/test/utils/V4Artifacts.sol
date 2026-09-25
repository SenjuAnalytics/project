// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Pulls Uniswap v4 test deployments into the build so tests can deploy them by artifact name.
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {PoolSwapTest} from "v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";

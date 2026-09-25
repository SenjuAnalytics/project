// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

interface IQualyraHook {
    function registerPool(PoolKey calldata key, address token) external;
    function poolKeyOf(address token) external view returns (PoolKey memory);
    function sweepFees(address token, uint256 battleId) external;
    function twapOf(address token) external view returns (uint256 price18, bool ready, uint256 updatedAt);
}

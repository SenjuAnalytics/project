// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IQualyraBuybackBurner {
    function fund(uint256 battleId, address token, address asset, uint256 amount) external payable;
    function executeBuyback(uint256 battleId, address token) external returns (uint256 spent, uint256 burned);
    function remaining(uint256 battleId, address token) external view returns (uint256);
}

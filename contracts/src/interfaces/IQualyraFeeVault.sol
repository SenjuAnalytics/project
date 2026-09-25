// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IQualyraFeeVault {
    function collectFees(address token, uint256 tradeFee, uint256 creatorTax, uint256 battleId) external payable;
    function collectLaunchFee() external payable;
    /// @notice Books competition-vault funds straight to the treasury (a disqualified token's drained pending pot).
    function creditTreasury(address asset, uint256 amount) external payable;
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IQualyraBondingCurve {
    function token() external view returns (address);
    function quoteAsset() external view returns (address);
    function supply() external view returns (uint256);
    function buy(uint256 amountIn, uint256 minTokensOut, address recipient, uint256 deadline)
        external
        payable
        returns (uint256 tokensOut);
    function graduate() external;
    function enableRefunds() external;
}

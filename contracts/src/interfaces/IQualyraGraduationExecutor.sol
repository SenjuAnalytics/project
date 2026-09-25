// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IQualyraGraduationExecutor {
    function graduate(address token, uint256 quoteAmount, uint256 tokenAmount, uint256 phantomQuote)
        external
        payable;

    /// @notice Reverts when a pair asset configuration would produce pool prices outside the Uniswap v4 range.
    function checkEconomics(address quoteAsset, uint256 phantomQuote, uint256 graduationThreshold, uint256 supply)
        external
        view;
}

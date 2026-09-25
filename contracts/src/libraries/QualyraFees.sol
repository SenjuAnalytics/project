// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title QualyraFees
/// @notice Fee constants and the opening snipe tax, shared by the curve, the pool hook and the vaults.
library QualyraFees {
    uint256 internal constant BPS = 10_000;

    /// @notice Time after launch a token may go without starting its eligibility timer. Past it, the battle share
    ///         of its fees goes to the treasury instead of waiting for a battle it is unlikely to reach.
    uint256 internal constant PENDING_EXPIRY = 30 days;

    /// @notice Trading fee charged on the pair asset side of every trade.
    uint256 internal constant TRADE_FEE_BPS = 100;

    /// @notice Part of a buy that always reaches the buyer, whatever fee, creator tax and snipe tax add up to.
    uint256 internal constant MIN_BUYER_SHARE_BPS = 100;

    /// @notice Snipe tax for a buy made now.
    /// @dev Starts at `startBps` and is shifted right as time passes, reaching zero when the window closes.
    ///      Capped so that trading fee, creator tax and snipe tax never take more than 99% of a buy.
    function snipeTaxBps(uint256 launchedAt, uint256 startBps, uint256 window, uint256 creatorTaxBps)
        internal
        view
        returns (uint256 bps)
    {
        if (window == 0 || block.timestamp >= launchedAt + window) return 0;
        bps = startBps >> (((block.timestamp - launchedAt) * 14) / window);
        uint256 cap = BPS - TRADE_FEE_BPS - creatorTaxBps - MIN_BUYER_SHARE_BPS;
        if (bps > cap) bps = cap;
    }
}

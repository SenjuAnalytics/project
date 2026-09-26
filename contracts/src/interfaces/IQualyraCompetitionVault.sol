// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IQualyraCompetitionVault {
    enum Outcome {
        None,
        WinnerA,
        WinnerB,
        Draw,
        DisqualifiedA,
        DisqualifiedB,
        Void
    }

    event BattleResultProposed(
        uint256 indexed battleId, Outcome outcome, uint256 scoreA, uint256 scoreB, bytes32 datasetHash, bytes32 resultHash
    );
    event WeeklyWinnersProposed(uint256 indexed week, address[5] winners, bytes32 datasetHash, bytes32 resultHash);

    error MissingCommitment();

    function activeBattleOf(address token) external view returns (uint256);
    /// @notice Battle the fees `token` earns right now belong to, or zero. The hook tags every swap's fees with it.
    function feeBucketOf(address token) external view returns (uint256);
    /// @notice Evaluate a token's market-cap eligibility after a swap on its pool.
    /// @dev Callable only by the hook (`factory.hook()`). Internally fail-safe: any oracle problem is a no-op and it
    ///      never reverts for the hook.
    /// @param token The launch token that was traded.
    /// @param tokenPrice18 Time-weighted price of one whole token in whole pair asset units, 18-decimal fixed point.
    /// @param asset The pair asset (address(0) for native ETH); used to resolve the USD price feed.
    function onTradeClose(address token, uint256 tokenPrice18, address asset) external;
    function isBattlePotOpen(uint256 battleId, address token, address asset) external view returns (bool);
    /// @notice Whether a token has already used its one lifetime battle (also selects fee-routing Phase 3).
    function hasBattled(address token) external view returns (bool);
    /// @notice Close-based eligibility state per token (spec §2.1). Mirrors the public `eligibilityOf` getter.
    function eligibilityOf(address token)
        external
        view
        returns (uint48 firstCloseAt, bool eligible, bool disqualified, uint48 disqualifiedAt);
    /// @notice A token's cumulative contribution to a battle's pot (seed + live fees), used for Draw/Void refunds.
    function contributionOf(uint256 battleId, address token) external view returns (uint256);
    /// @notice Battle share `token` earned before its battle was scheduled, held to seed that battle's pot.
    function pendingBattlePot(address token, address asset) external view returns (uint256);
    /// @notice Sends the pending battle pot of a token past its pending expiry without an eligibility timer to the
    ///         treasury.
    function releaseExpiredPending(address token, address asset) external;
    /// @notice Whether `token` stops waiting for a battle it cannot reach, so its pending pot may be released to the
    ///         treasury. The single definition of the rule: the fee vault routes on this rather than mirroring it.
    function isPendingExpired(address token) external view returns (bool);
    function paused() external view returns (bool);
    function depositBattleFees(uint256 battleId, address token, address asset, uint256 amount) external payable;
    function depositLeagueFees(address asset, uint256 amount) external payable;
    function proposeBattleResult(
        uint256 battleId, Outcome outcome, uint256 scoreA, uint256 scoreB, bytes32 datasetHash, bytes32 resultHash
    ) external;
    function proposeWeeklyWinners(uint256 week, address[5] calldata winners, bytes32 datasetHash, bytes32 resultHash)
        external;
}

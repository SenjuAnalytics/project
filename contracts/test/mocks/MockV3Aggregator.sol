// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Configurable mock of a Chainlink AggregatorV3 USD price feed for QualyraOracle tests.
/// @dev Also implements the optional `oraclePaused()` used by RWA/stock feeds so the pause fail-safe
///      path can be exercised. Set `revertOnRead` to simulate an unreadable / malformed feed.
contract MockV3Aggregator {
    uint8 public decimals;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public roundId;

    bool public paused;
    bool public revertOnRead;

    constructor(uint8 _decimals, int256 _answer) {
        decimals = _decimals;
        _update(_answer);
    }

    function _update(int256 _answer) internal {
        answer = _answer;
        roundId += 1;
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    /// @notice Update the answer and stamp it fresh at the current block time.
    function setAnswer(int256 _answer) external {
        _update(_answer);
    }

    /// @notice Fully control the returned round data (used to simulate stale / future timestamps).
    function setRoundData(uint80 _roundId, int256 _answer, uint256 _startedAt, uint256 _updatedAt) external {
        roundId = _roundId;
        answer = _answer;
        startedAt = _startedAt;
        updatedAt = _updatedAt;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function setPaused(bool _paused) external {
        paused = _paused;
    }

    function setRevertOnRead(bool _revert) external {
        revertOnRead = _revert;
    }

    function oraclePaused() external view returns (bool) {
        return paused;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        require(!revertOnRead, "MockV3Aggregator: read revert");
        return (roundId, answer, startedAt, updatedAt, roundId);
    }
}

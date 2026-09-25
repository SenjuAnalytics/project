// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Configurable mock of a Chainlink L2 Sequencer Uptime feed for QualyraOracle tests.
/// @dev answer semantics: 0 = sequencer UP, 1 = sequencer DOWN. `startedAt` marks the time of the last
///      status change and drives the grace-period logic.
contract MockSequencerFeed {
    /// @dev 0 = up, 1 = down.
    int256 public answer;
    uint256 public startedAt;
    bool public revertOnRead;

    constructor(int256 _answer, uint256 _startedAt) {
        answer = _answer;
        startedAt = _startedAt;
    }

    /// @notice Set sequencer status. Pass the timestamp of the (simulated) status change as `_startedAt`.
    function setStatus(int256 _answer, uint256 _startedAt) external {
        answer = _answer;
        startedAt = _startedAt;
    }

    function setRevertOnRead(bool _revert) external {
        revertOnRead = _revert;
    }

    function decimals() external pure returns (uint8) {
        return 0;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        require(!revertOnRead, "MockSequencerFeed: read revert");
        return (1, answer, startedAt, startedAt, 1);
    }
}

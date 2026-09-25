// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Stand-in used by the curve and fee vault tests before the real competition vault is involved.
contract MockCompetitionVault {
    struct Eligibility {
        uint48 firstCloseAt;
        bool eligible;
        bool disqualified;
        uint48 disqualifiedAt;
    }

    mapping(address token => uint256) public battleOf;
    mapping(uint256 battleId => mapping(address asset => uint256)) public battlePot;
    mapping(address asset => uint256) public leaguePool;
    /// @dev Mirrors the real vault's phase flags so the fee vault's routing can be exercised against the mock.
    mapping(address token => bool) public hasBattled;
    mapping(address token => Eligibility) public eligibilityOf;
    bool public paused;

    receive() external payable {}

    function setBattle(address token, uint256 battleId) external {
        battleOf[token] = battleId;
    }

    function setHasBattled(address token, bool value) external {
        hasBattled[token] = value;
    }

    function setDisqualified(address token, bool value) external {
        eligibilityOf[token].disqualified = value;
    }

    function activeBattleOf(address token) external view returns (uint256) {
        return battleOf[token];
    }

    function feeBucketOf(address token) external view returns (uint256) {
        return battleOf[token];
    }

    /// @dev The mock keeps no per-token pending pot, so the fee vault never tries to release one.
    function pendingBattlePot(address, address) external pure returns (uint256) {
        return 0;
    }

    function releaseExpiredPending(address, address) external {}

    /// @dev No-op stand-in for the eligibility CLOSE hook so curve/hook trade paths call a real function.
    function onTradeClose(address, uint256, address) external {}

    function isBattlePotOpen(uint256 battleId, address, address) external pure returns (bool) {
        return battleId != 0;
    }

    function depositBattleFees(uint256 battleId, address, address asset, uint256 amount) external payable {
        _check(asset, amount);
        battlePot[battleId][asset] += amount;
    }

    function depositLeagueFees(address asset, uint256 amount) external payable {
        _check(asset, amount);
        leaguePool[asset] += amount;
    }

    function _check(address asset, uint256 amount) private view {
        if (asset == address(0)) require(msg.value == amount, "value");
        else require(IERC20(asset).balanceOf(address(this)) >= amount, "balance");
    }
}

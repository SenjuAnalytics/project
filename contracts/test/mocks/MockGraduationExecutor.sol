// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IQualyraFactory} from "../../src/interfaces/IQualyraFactory.sol";

/// @dev Accepts graduation funds without creating a pool. Can be told to fail.
contract MockGraduationExecutor {
    IQualyraFactory public immutable factory;
    bool public shouldRevert;
    uint256 public lastQuoteAmount;
    uint256 public lastTokenAmount;

    constructor(address factory_) {
        factory = IQualyraFactory(factory_);
    }

    receive() external payable {}

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function graduate(address token, uint256 quoteAmount, uint256 tokenAmount, uint256) external payable {
        require(!shouldRevert, "graduation failed");
        require(msg.sender == factory.curveOf(token), "not curve");
        lastQuoteAmount = quoteAmount;
        lastTokenAmount = tokenAmount;
        factory.markGraduated(token);
    }

    function checkEconomics(address, uint256, uint256, uint256) external pure {}
}

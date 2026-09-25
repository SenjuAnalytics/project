// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @dev Stand-in for a replacement contract that receives funds during an emergency migration.
contract MockSuccessor {
    receive() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title QualyraLaunchToken
/// @notice Fixed supply ERC-20 created for every launch. No owner, no minting after deployment,
///         no transfer tax and no blocklist. Holders can burn their own tokens.
/// @dev `metadataURI` is a single off-chain pointer (e.g. `ipfs://...`) to a JSON document holding the
///      logo image and social links. Only the pointer lives on-chain, matching the standard launchpad
///      pattern (pump.fun / Metaplex): contract stores the URI, the JSON + image stay off-chain.
contract QualyraLaunchToken is ERC20Burnable {
    /// @notice Off-chain metadata pointer (JSON with image + socials). Set once at deployment.
    string public metadataURI;

    constructor(
        string memory name_,
        string memory symbol_,
        string memory metadataURI_,
        address holder,
        uint256 supply
    ) ERC20(name_, symbol_) {
        metadataURI = metadataURI_;
        _mint(holder, supply);
    }
}

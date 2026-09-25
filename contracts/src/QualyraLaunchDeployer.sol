// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {QualyraLaunchToken} from "./QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "./QualyraBondingCurve.sol";

/// @title QualyraLaunchDeployer
/// @notice Deploys the token and bonding curve of a launch with CREATE2, so both addresses are known in advance.
/// @dev Kept apart from the factory to stay under the contract size limit.
contract QualyraLaunchDeployer {
    using SafeERC20 for IERC20;

    struct DeployParams {
        string name;
        string symbol;
        string metadataURI;
        address quoteAsset;
        uint256 supply;
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint256 creatorTaxBps;
        uint256 snipeStartBps;
        uint256 snipeWindow;
    }

    address public immutable factory;

    error NotFactory();
    error ZeroFactory();

    constructor(address factory_) {
        if (factory_ == address(0)) revert ZeroFactory();
        factory = factory_;
    }

    function deploy(bytes32 salt, DeployParams calldata params) external returns (address token, address curve) {
        if (msg.sender != factory) revert NotFactory();

        token = address(
            new QualyraLaunchToken{salt: salt}(
                params.name, params.symbol, params.metadataURI, address(this), params.supply
            )
        );
        curve = address(
            new QualyraBondingCurve{salt: salt}(
                QualyraBondingCurve.Init({
                    factory: factory,
                    token: token,
                    quoteAsset: params.quoteAsset,
                    supply: params.supply,
                    phantomQuote: params.phantomQuote,
                    graduationThreshold: params.graduationThreshold,
                    creatorTaxBps: params.creatorTaxBps,
                    snipeStartBps: params.snipeStartBps,
                    snipeWindow: params.snipeWindow
                })
            )
        );
        IERC20(token).safeTransfer(curve, params.supply);
    }
}

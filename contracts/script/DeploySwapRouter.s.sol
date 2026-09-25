// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

import {QualyraSwapRouter} from "../src/periphery/QualyraSwapRouter.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

/// @notice Deploys the periphery swap router for an existing Qualyra deployment.
/// @dev Separate from DeployQualyra so the platform deployment record stays untouched. The router holds no
///      balance, has no owner and is not referenced by any core contract, so it can be redeployed or replaced
///      at any time without touching the platform.
///
///      Environment:
///        POOL_MANAGER     Uniswap v4 PoolManager on the target chain
///        QUALYRA_FACTORY  The already deployed QualyraFactory
///
///      forge script script/DeploySwapRouter.s.sol --rpc-url <rpc> --broadcast --account <keystore>
contract DeploySwapRouter is Script {
    error PoolManagerHasNoCode();
    error FactoryHasNoCode();
    error PoolManagerMismatch();

    function run() external returns (QualyraSwapRouter router) {
        address poolManager = vm.envAddress("POOL_MANAGER");
        address factory = vm.envAddress("QUALYRA_FACTORY");

        vm.startBroadcast();
        router = deploy(IPoolManager(poolManager), IQualyraFactory(factory));
        vm.stopBroadcast();

        console2.log("QualyraSwapRouter", address(router));
    }

    function deploy(IPoolManager poolManager, IQualyraFactory factory) public returns (QualyraSwapRouter) {
        if (address(poolManager).code.length == 0) revert PoolManagerHasNoCode();
        if (address(factory).code.length == 0) revert FactoryHasNoCode();

        // The router reads pool keys from the factory's hook, so both must sit on the same PoolManager.
        if (address(poolManager) != _poolManagerOf(factory)) revert PoolManagerMismatch();

        return new QualyraSwapRouter(poolManager, factory);
    }

    /// @dev The graduation executor is constructed with the PoolManager, so it is the cheapest place to read it.
    function _poolManagerOf(IQualyraFactory factory) private view returns (address) {
        (bool ok, bytes memory data) =
            factory.graduationExecutor().staticcall(abi.encodeWithSignature("poolManager()"));
        require(ok && data.length == 32, "cannot read poolManager from the deployment");
        return abi.decode(data, (address));
    }
}

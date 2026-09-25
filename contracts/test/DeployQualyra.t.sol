// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";

import {DeployQualyra} from "../script/DeployQualyra.s.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

import {MockERC20} from "./mocks/MockERC20.sol";

contract DeployQualyraTest is Test {
    address internal timelock = makeAddr("timelock");
    address internal treasury = makeAddr("treasury");
    address internal operator = makeAddr("operator");
    address internal guardian = makeAddr("guardian");
    address internal creator = makeAddr("creator");

    function test_deploy_wiresTheWholeSystem() public {
        IPoolManager manager = IPoolManager(deployCode("PoolManager.sol:PoolManager", abi.encode(address(this))));
        MockERC20 usdg = new MockERC20("Global Dollar", "USDG", 6);
        DeployQualyra script = new DeployQualyra();

        DeployQualyra.Deployment memory d = script.deploy(
            DeployQualyra.Config({
                poolManager: manager,
                timelock: timelock,
                treasury: treasury,
                operator: operator,
                guardian: guardian,
                usdg: address(usdg)
            }),
            address(script),
            address(script)
        );

        assertEq(d.factory.hook(), address(d.hook));
        assertEq(d.factory.competitionVault(), address(d.competitionVault));
        assertEq(d.factory.buybackBurner(), address(d.buybackBurner));
        assertEq(d.factory.launchRouter(), address(d.launchRouter));
        assertEq(uint160(address(d.hook)) & Hooks.ALL_HOOK_MASK, 0x28CC);
        assertEq(d.feeVault.treasury(), treasury);
        assertEq(d.competitionVault.operator(), operator);
        assertEq(d.competitionVault.guardian(), guardian);

        IQualyraFactory.QuoteAssetConfig memory eth = d.factory.quoteAssetConfig(address(0));
        IQualyraFactory.QuoteAssetConfig memory dollar = d.factory.quoteAssetConfig(address(usdg));
        assertEq(eth.graduationThreshold, 4.2 ether);
        assertEq(dollar.graduationThreshold, 8_090e6);

        // The timelock takes over once it accepts.
        assertEq(d.factory.pendingOwner(), timelock);
        vm.prank(timelock);
        d.factory.acceptOwnership();
        assertEq(d.factory.owner(), timelock);

        // A launch that graduates proves the mined hook address works with the PoolManager.
        skip(1 days);
        vm.deal(creator, 10 ether);
        IQualyraFactory.LaunchParams memory params;
        params.name = "Rocket";
        params.symbol = "RKT";
        uint256 fee = d.factory.launchFee();
        vm.prank(creator);
        (address token,,) = d.launchRouter.launchAndBuy{value: fee + 5 ether}(params, 5 ether, 0);
        assertTrue(d.factory.isGraduated(token));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {QualyraFactory} from "../../src/QualyraFactory.sol";
import {QualyraLaunchDeployer} from "../../src/QualyraLaunchDeployer.sol";
import {QualyraFeeVault} from "../../src/QualyraFeeVault.sol";
import {QualyraLaunchToken} from "../../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../../src/QualyraBondingCurve.sol";
import {IQualyraFactory} from "../../src/interfaces/IQualyraFactory.sol";

import {MockERC20} from "../mocks/MockERC20.sol";
import {MockCompetitionVault} from "../mocks/MockCompetitionVault.sol";
import {MockGraduationExecutor} from "../mocks/MockGraduationExecutor.sol";

/// @dev Launch, curve and fee vault setup with the pool side mocked out.
abstract contract LaunchTestBase is Test {
    uint128 internal constant ETH_PHANTOM = 1.68 ether;
    uint128 internal constant ETH_THRESHOLD = 4.2 ether;
    uint128 internal constant USDG_PHANTOM = 3_236e6;
    uint128 internal constant USDG_THRESHOLD = 8_090e6;

    QualyraFactory internal factory;
    QualyraLaunchDeployer internal deployer;
    QualyraFeeVault internal feeVault;
    MockCompetitionVault internal competition;
    MockGraduationExecutor internal executor;
    MockERC20 internal usdg;

    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal hook = makeAddr("hook");

    function setUp() public virtual {
        factory = new QualyraFactory(address(this));
        deployer = new QualyraLaunchDeployer(address(factory));
        feeVault = new QualyraFeeVault(address(factory), treasury);
        competition = new MockCompetitionVault();
        executor = new MockGraduationExecutor(address(factory));
        usdg = new MockERC20("Global Dollar", "USDG", 6);

        factory.initialize(
            QualyraFactory.Modules({
                deployer: address(deployer),
                feeVault: address(feeVault),
                competitionVault: address(competition),
                graduationExecutor: address(executor),
                hook: hook,
                liquidityLocker: makeAddr("locker"),
                buybackBurner: makeAddr("burner"),
                launchRouter: makeAddr("router")
            })
        );
        factory.setQuoteAsset(address(0), ETH_PHANTOM, ETH_THRESHOLD, 18);
        factory.setQuoteAsset(address(usdg), USDG_PHANTOM, USDG_THRESHOLD, 6);
        // Pin the snipe window to 5s so legacy fee-math tests stay deterministic;
        // production default is 15s (Pons parity) — see test_defaultSnipeParamsMatchPons.
        factory.setSnipeParams(9_900, 5);

        vm.deal(creator, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _params(address quoteAsset, uint16 creatorTaxBps)
        internal
        pure
        returns (IQualyraFactory.LaunchParams memory params)
    {
        params.name = "Rocket";
        params.symbol = "RKT";
        params.metadataURI = "ipfs://rocket";
        params.quoteAsset = quoteAsset;
        params.creatorTaxBps = creatorTaxBps;
    }

    function _launch(address quoteAsset, uint16 creatorTaxBps)
        internal
        returns (QualyraLaunchToken token, QualyraBondingCurve curve)
    {
        uint256 fee = factory.launchFee();
        vm.prank(creator);
        (address tokenAddress, address curveAddress) = factory.launchToken{value: fee}(_params(quoteAsset, creatorTaxBps));
        return (QualyraLaunchToken(tokenAddress), QualyraBondingCurve(curveAddress));
    }

    function _buyEth(QualyraBondingCurve curve, address buyer, uint256 amount) internal returns (uint256) {
        vm.prank(buyer);
        return curve.buy{value: amount}(amount, 0, buyer, vm.getBlockTimestamp());
    }
}

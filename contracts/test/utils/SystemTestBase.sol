// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

import {QualyraFactory} from "../../src/QualyraFactory.sol";
import {QualyraLaunchDeployer} from "../../src/QualyraLaunchDeployer.sol";
import {QualyraFeeVault} from "../../src/QualyraFeeVault.sol";
import {QualyraLaunchToken} from "../../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../../src/QualyraBondingCurve.sol";
import {QualyraGraduationExecutor} from "../../src/QualyraGraduationExecutor.sol";
import {QualyraLiquidityLocker} from "../../src/QualyraLiquidityLocker.sol";
import {QualyraHook} from "../../src/QualyraHook.sol";
import {IQualyraFactory} from "../../src/interfaces/IQualyraFactory.sol";

import {MockERC20} from "../mocks/MockERC20.sol";
import {IPoolSwapTest} from "./V4TestRouters.sol";

/// @dev Full launch and pool setup on a real PoolManager. Competition contracts are provided by the child test.
abstract contract SystemTestBase is Test {
    uint128 internal constant ETH_PHANTOM = 1.68 ether;
    uint128 internal constant ETH_THRESHOLD = 4.2 ether;
    uint128 internal constant USDG_PHANTOM = 3_236e6;
    uint128 internal constant USDG_THRESHOLD = 8_090e6;
    uint256 internal constant SUPPLY = 1_000_000_000e18;

    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    IPoolManager internal manager;
    IPoolSwapTest internal swapRouter;

    QualyraFactory internal factory;
    QualyraLaunchDeployer internal deployer;
    QualyraFeeVault internal feeVault;
    QualyraGraduationExecutor internal executor;
    QualyraLiquidityLocker internal locker;
    QualyraHook internal hook;

    address internal treasury = makeAddr("treasury");
    address internal creator = makeAddr("creator");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function _deployCore() internal {
        manager = IPoolManager(deployCode("PoolManager.sol:PoolManager", abi.encode(address(this))));
        swapRouter = IPoolSwapTest(deployCode("PoolSwapTest.sol:PoolSwapTest", abi.encode(address(manager))));

        factory = new QualyraFactory(address(this));
        deployer = new QualyraLaunchDeployer(address(factory));
        feeVault = new QualyraFeeVault(address(factory), treasury);
        executor = new QualyraGraduationExecutor(manager, IQualyraFactory(address(factory)));
        locker = new QualyraLiquidityLocker(manager, IQualyraFactory(address(factory)));

        address hookAddress = address(HOOK_FLAGS | (uint160(0x4444) << 144));
        deployCodeTo("QualyraHook.sol:QualyraHook", abi.encode(manager, factory), hookAddress);
        hook = QualyraHook(hookAddress);

        vm.deal(creator, 1_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
    }

    function _initialize(address competitionVault, address buybackBurner, address launchRouter) internal {
        factory.initialize(
            QualyraFactory.Modules({
                deployer: address(deployer),
                feeVault: address(feeVault),
                competitionVault: competitionVault,
                graduationExecutor: address(executor),
                hook: address(hook),
                liquidityLocker: address(locker),
                buybackBurner: buybackBurner,
                launchRouter: launchRouter
            })
        );
        factory.setQuoteAsset(address(0), ETH_PHANTOM, ETH_THRESHOLD, 18);
        // Pin the snipe window to 5s so legacy fee-math tests stay deterministic;
        // production default is 15s (Pons parity) — see test_defaultSnipeParamsMatchPons.
        factory.setSnipeParams(9_900, 5);
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

    /// @dev Launches an ETH pair and fills the curve so it graduates.
    function _graduatedEthLaunch(uint16 creatorTaxBps)
        internal
        returns (QualyraLaunchToken token, QualyraBondingCurve curve, PoolKey memory key)
    {
        (token, curve) = _launch(address(0), creatorTaxBps);
        skip(10);
        vm.prank(alice);
        curve.buy{value: 10 ether}(10 ether, 0, alice, vm.getBlockTimestamp());
        key = hook.poolKeyOf(address(token));
    }

    function _swap(PoolKey memory key, address from, bool zeroForOne, int256 amountSpecified, uint256 value)
        internal
        returns (BalanceDelta delta)
    {
        vm.prank(from);
        delta = swapRouter.swap{value: value}(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            IPoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    /// @dev Same as `_swap` but with a price limit the swap can run into.
    function _swapWithLimit(
        PoolKey memory key,
        address from,
        bool zeroForOne,
        int256 amountSpecified,
        uint256 value,
        uint160 sqrtPriceLimitX96
    ) internal returns (BalanceDelta delta) {
        vm.prank(from);
        delta = swapRouter.swap{value: value}(
            key,
            SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: amountSpecified,
                sqrtPriceLimitX96: sqrtPriceLimitX96
            }),
            IPoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    /// @dev The next 00:00 UTC after now: the earliest start a battle can be booked for.
    function _nextMidnight() internal view returns (uint256) {
        return (vm.getBlockTimestamp() / 1 days + 1) * 1 days;
    }

    function _approveRouter(address owner, address token) internal {
        vm.prank(owner);
        MockERC20(token).approve(address(swapRouter), type(uint256).max);
    }
}

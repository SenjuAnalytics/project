// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {PoolModifyLiquidityTest} from "v4-core/src/test/PoolModifyLiquidityTest.sol";

import {MockERC20} from "../test/mocks/MockERC20.sol";

/// @notice Tahap 2 of the "testnet == mainnet" price plan.
///         Deploys a testnet USDG mock (6 decimals) and initializes a standalone
///         Uniswap v4 ETH/USDG price-reference pool so the indexer's
///         OnchainPriceProvider (Tahap 3) reads the ETH/USD basis on-chain on BOTH
///         chains via the exact same code path (no testnet/mainnet branch).
///
/// @dev    In v4 `initialize` sets slot0 (sqrtPriceX96 + tick) immediately, even at
///         zero liquidity, and the price only moves on a swap. The provider only
///         READS slot0, so USDG + `initialize` is the low-risk, low-gas core.
///         Liquidity is cosmetic here, so it is single-sided USDG (range strictly
///         BELOW the current tick -> only USDG, no native ETH) and wrapped in
///         try/catch so a seeding hiccup can never block the USDG + pool deploy.
///         The testnet pool price = the ratio we set here (documented + pinned into
///         the indexer dataset); it is not a live market — expected for testnet.
///
///         PoolKey params (fee, tickSpacing, hooks=0) MUST match the indexer's
///         OnchainPriceProvider PoolKey used to derive the poolId.
///
///         Environment:
///           POOL_MANAGER          v4 PoolManager (testnet 46630: 0x8366a39CC670B4001A1121B8F6A443A643e40951)
///           ETH_USDG_PRICE        USDG per 1 ETH, integer (default 2660)
///           SEED_USDG_LIQUIDITY   "true"/"false" (default true) — single-sided USDG
///           DEPLOYER              optional; recipient of minted USDG / the LP
///
///         Run (broadcast with YOUR keystore — pass --sender so mint/LP land on it):
///           cd contracts
///           set POOL_MANAGER=0x8366a39CC670B4001A1121B8F6A443A643e40951
///           forge script script/DeployTestnetUsdgPool.s.sol \
///             --rpc-url https://rpc.testnet.chain.robinhood.com \
///             --account <your-keystore> --sender <your-address> --broadcast
contract DeployTestnetUsdgPool is Script {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    // Reference-pool key params. MUST stay in sync with the indexer PoolKey.
    uint24 internal constant POOL_FEE = 3000; // 0.30% static fee (never swapped here)
    int24 internal constant TICK_SPACING = 60;

    error PoolManagerHasNoCode();

    function run() external {
        address poolManagerAddr = vm.envAddress("POOL_MANAGER");
        if (poolManagerAddr.code.length == 0) revert PoolManagerHasNoCode();
        IPoolManager manager = IPoolManager(poolManagerAddr);
        uint256 ethUsdgPrice = vm.envOr("ETH_USDG_PRICE", uint256(2660));
        // Recipient of minted USDG / the LP. Read OUTSIDE broadcast so it is NOT the
        // guarded broadcast `msg.sender`; pass --sender <you> so it matches the keystore.
        address deployer = vm.envOr("DEPLOYER", msg.sender);

        vm.startBroadcast();

        MockERC20 usdg = new MockERC20("Global Dollar", "USDG", 6);
        usdg.mint(deployer, 1_000_000_000e6);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)), // native ETH (18 dec) — address(0) sorts first
            currency1: Currency.wrap(address(usdg)), // USDG (6 dec)
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });

        // sqrtPriceX96 for price = currency1/currency0 (raw) = (ethUsdgPrice*1e6)/1e18
        // => sqrt(price_raw) * 2^96 = sqrt(price_raw * 2^192)
        uint160 sqrtPriceX96 =
            uint160(Math.sqrt(FullMath.mulDiv(ethUsdgPrice * 1e6, uint256(1) << 192, 1e18)));
        int24 tick = manager.initialize(key, sqrtPriceX96);

        address lpRouter;
        bool seeded;
        if (vm.envOr("SEED_USDG_LIQUIDITY", true)) {
            (lpRouter, seeded) = _seedSingleSidedUsdg(manager, key, usdg, tick);
        }

        vm.stopBroadcast();

        _report(manager, address(usdg), key, sqrtPriceX96, ethUsdgPrice, seeded, lpRouter);
    }

    /// @dev Single-sided USDG liquidity strictly BELOW the current tick (USDG-only,
    ///      no native ETH). try/catch so failure never blocks the USDG + pool deploy.
    function _seedSingleSidedUsdg(IPoolManager manager, PoolKey memory key, MockERC20 usdg, int24 tick)
        internal
        returns (address lpRouter, bool seeded)
    {
        PoolModifyLiquidityTest router = new PoolModifyLiquidityTest(manager);
        lpRouter = address(router);
        usdg.approve(address(router), type(uint256).max);

        int24 tickUpper = (tick / TICK_SPACING - 1) * TICK_SPACING; // one spacing below current tick
        int24 tickLower = tickUpper - TICK_SPACING * 1000; // ~1000 spacings wide (USDG-only)

        try router.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(1e12),
                salt: bytes32(0)
            }),
            ""
        ) {
            seeded = true;
        } catch {
            seeded = false; // cosmetic only — USDG + pool are already live
        }
    }

    /// @dev Reads the pool back and prints everything the indexer wiring needs.
    function _report(
        IPoolManager manager,
        address usdg,
        PoolKey memory key,
        uint160 sqrtSet,
        uint256 ethUsdgPrice,
        bool seeded,
        address lpRouter
    ) internal view {
        (uint160 sqrtRead, int24 tickRead,,) = manager.getSlot0(key.toId());
        console2.log("== Tahap 2: Testnet USDG + ETH/USDG v4 price pool ==");
        console2.log("USDG (MockERC20, 6 dec):", usdg);
        console2.log("PoolManager:", address(manager));
        console2.log("pool fee (uint24):", uint256(POOL_FEE));
        console2.log("pool tickSpacing:", uint256(uint24(TICK_SPACING)));
        console2.log("ETH price used (USDG per ETH):", ethUsdgPrice);
        console2.log("sqrtPriceX96 set :", uint256(sqrtSet));
        console2.log("sqrtPriceX96 read:", uint256(sqrtRead));
        console2.log("current tick:", int256(tickRead));
        console2.log("liquidity seeded:", seeded);
        console2.log("lpRouter (0 = not seeded):", lpRouter);
        console2.log("poolId (bytes32):");
        console2.logBytes32(PoolId.unwrap(key.toId()));
    }
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

import {DeployQualyra} from "../script/DeployQualyra.s.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

/// @notice Dry-run of the production deploy against a live Robinhood Chain (4663) fork.
/// @dev This is a fork test, so it is SKIPPED unless ROBINHOOD_RPC_URL is set. That keeps the default
///      offline `forge test` fast and network-free, while still allowing a real dry-run on demand:
///
///      set "ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com"
///      forge test --match-contract DeployQualyraForkTest -vv
///
///      Running deploy() against real state exercises every pre-flight check (POOL_MANAGER has code,
///      USDG.decimals()==6, byte-for-byte canonical addresses, stock tokens have code) plus the real
///      setQuoteAsset decimals guard for all three tokenized stocks.
contract DeployQualyraForkTest is Test {
    // Canonical Robinhood Chain externals, verified on-chain (docs/PRE-MAINNET-VERIFICATION.md §2).
    address internal constant RBH_POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant RBH_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    // Tokenized-stock pair assets (all 18 decimals).
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address internal constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address internal constant SPY = 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C;

    function test_dryRunDeploy_onRobinhoodFork() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            emit log("SKIPPED: set ROBINHOOD_RPC_URL to dry-run the deploy on a Robinhood Chain fork");
            return;
        }

        vm.createSelectFork(rpc);
        assertEq(block.chainid, 4663, "not forking Robinhood Chain");

        DeployQualyra script = new DeployQualyra();
        DeployQualyra.Config memory config = DeployQualyra.Config({
            poolManager: IPoolManager(RBH_POOL_MANAGER),
            timelock: makeAddr("timelock"),
            treasury: makeAddr("treasury"),
            operator: makeAddr("operator"),
            guardian: makeAddr("guardian"),
            usdg: RBH_USDG
        });

        // deployer == create2Deployer == the script instance so the mined hook address matches
        // (same convention as DeployQualyra.t.sol). deploy() runs _preflight() against the live fork.
        DeployQualyra.Deployment memory d = script.deploy(config, address(script), address(script));

        // Ownership hand-off is aimed at the timelock (Ownable2Step; accepted separately by the timelock).
        assertEq(d.factory.pendingOwner(), config.timelock, "handoff target");

        // ETH (native) and USDG (6 decimals) pair assets.
        assertEq(d.factory.quoteAssetConfig(address(0)).graduationThreshold, 4.2 ether, "ETH threshold");
        IQualyraFactory.QuoteAssetConfig memory usdg = d.factory.quoteAssetConfig(RBH_USDG);
        assertEq(uint256(usdg.decimals), 6, "USDG decimals");
        assertEq(usdg.graduationThreshold, 8_090e6, "USDG threshold");

        // The three tokenized stocks listed with the exact on-chain Pons economics (18 decimals).
        _assertStock(IQualyraFactory(address(d.factory)), NVDA, 16640000000000000000, 41600000000000000000);
        _assertStock(IQualyraFactory(address(d.factory)), AAPL, 9680000000000000000, 24200000000000000000);
        _assertStock(IQualyraFactory(address(d.factory)), SPY, 4360000000000000000, 10900000000000000000);

        emit log("DRY-RUN OK: full deploy simulated on Robinhood Chain fork, all pair assets listed");
    }

    function _assertStock(IQualyraFactory factory, address token, uint256 phantom, uint256 threshold)
        internal
        view
    {
        IQualyraFactory.QuoteAssetConfig memory c = factory.quoteAssetConfig(token);
        assertTrue(c.listed, "stock not listed");
        assertTrue(c.enabled, "stock not enabled");
        assertEq(uint256(c.decimals), 18, "stock decimals");
        assertEq(c.phantomQuote, phantom, "stock phantom");
        assertEq(c.graduationThreshold, threshold, "stock threshold");
    }
}

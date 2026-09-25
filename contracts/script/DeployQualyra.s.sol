// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "v4-periphery/test/shared/HookMiner.sol";

import {QualyraFactory} from "../src/QualyraFactory.sol";
import {QualyraLaunchDeployer} from "../src/QualyraLaunchDeployer.sol";
import {QualyraFeeVault} from "../src/QualyraFeeVault.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";
import {QualyraGraduationExecutor} from "../src/QualyraGraduationExecutor.sol";
import {QualyraLiquidityLocker} from "../src/QualyraLiquidityLocker.sol";
import {QualyraBuybackBurner} from "../src/QualyraBuybackBurner.sol";
import {QualyraLaunchRouter} from "../src/QualyraLaunchRouter.sol";
import {QualyraHook} from "../src/QualyraHook.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

/// @notice Minimal ERC-20 view used only for deploy-time pre-flight checks.
interface IERC20Decimals {
    function decimals() external view returns (uint8);
}

/// @notice Deploys the nine Qualyra platform contracts, wires them together, lists the launch pair assets and
///         hands the factory to the timelock.
/// @dev Environment:
///      POOL_MANAGER      Uniswap v4 PoolManager on the target chain
///      QUALYRA_TIMELOCK  Timelock that becomes the factory owner (it still has to call acceptOwnership)
///      QUALYRA_TREASURY  Receives the platform share of fees
///      QUALYRA_OPERATOR  Publishes battle schedules and competition results
///      QUALYRA_GUARDIAN  Can pause the prize contracts and veto results
///      USDG              Optional. Listed as a pair asset when set
///
///      forge script script/DeployQualyra.s.sol --rpc-url <rpc> --broadcast --account <keystore>
contract DeployQualyra is Script {
    /// @dev Deterministic deployment proxy used by forge for CREATE2 deployments during a broadcast.
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    uint128 internal constant ETH_PHANTOM = 1.68 ether;
    uint128 internal constant ETH_THRESHOLD = 4.2 ether;
    uint128 internal constant USDG_PHANTOM = 3_236e6;
    uint128 internal constant USDG_THRESHOLD = 8_090e6;

    /// @dev Robinhood Chain mainnet. Tokenized-stock pair assets only have code here, and
    ///      setQuoteAsset reverts on a code-less asset, so their listing is gated on this id.
    uint256 internal constant ROBINHOOD_CHAIN_ID = 4663;

    /// @dev Robinhood Chain testnet. The native-ETH graduation economics are scaled down here
    ///      (ratio phantom/threshold = 0.40 preserved, so `reserved` supply and the token math are
    ///      identical to mainnet — only the price scales), so the full launch -> graduation -> pool
    ///      lifecycle can be exercised with faucet-sized balances (~0.02 ETH: 0.008 to graduate +
    ///      0.0005 launch fee + gas). Mainnet (4663) and the 31337 unit tests keep the canonical
    ///      1.68 / 4.2 ETH economics untouched.
    uint256 internal constant ROBINHOOD_TESTNET_CHAIN_ID = 46630;
    uint128 internal constant ETH_PHANTOM_TESTNET = 0.0032 ether;
    uint128 internal constant ETH_THRESHOLD_TESTNET = 0.008 ether;

    /// @dev Canonical Robinhood Chain (4663) externals, verified on-chain (docs/PRE-MAINNET-VERIFICATION.md §2).
    ///      On chain 4663 the env-provided POOL_MANAGER / USDG must match these byte-for-byte.
    address internal constant RBH_POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address internal constant RBH_USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;

    /// @dev USDG (Global Dollar) is a 6-decimal token; the USDG phantom/threshold literals assume it.
    uint8 internal constant USDG_DECIMALS = 6;

    // Robinhood Chain tokenized-stock pair assets (all 18 decimals). Addresses and the
    // phantomQuote / graduationThreshold literals below are copied verbatim from Pons's
    // on-chain pairTokenEconomics getter (0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e),
    // so a Qualyra launch against them prices identically to Pons. phantom/threshold = 0.40.
    //
    // Only these three are listed at deployment. The remaining Pons assets are held back until
    // each has been reviewed, then listed through the timelock with the same call and the values here:
    //
    //   GOOGL 0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3   9680000000000000000    24200000000000000000
    //   GME   0x1b0E319c6A659F002271B69dB8A7df2F911c153E   147600000000000000000  369000000000000000000
    //   SPCX  0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa   28880000000000000000   72200000000000000000
    //   SGOV  0x92FD66527192E3e61d4DDd13322Aa222DE86F9B5   41126623402476410529   102816558506191026323
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address internal constant AAPL = 0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9;
    address internal constant SPY = 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C;

    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG
        | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;

    struct Config {
        IPoolManager poolManager;
        address timelock;
        address treasury;
        address operator;
        address guardian;
        address usdg;
    }

    struct Deployment {
        QualyraFactory factory;
        QualyraLaunchDeployer launchDeployer;
        QualyraFeeVault feeVault;
        QualyraCompetitionVault competitionVault;
        QualyraGraduationExecutor graduationExecutor;
        QualyraLiquidityLocker liquidityLocker;
        QualyraBuybackBurner buybackBurner;
        QualyraLaunchRouter launchRouter;
        QualyraHook hook;
    }

    error HookAddressMismatch();

    function run() external returns (Deployment memory deployment) {
        Config memory config = Config({
            poolManager: IPoolManager(vm.envAddress("POOL_MANAGER")),
            timelock: vm.envAddress("QUALYRA_TIMELOCK"),
            treasury: vm.envAddress("QUALYRA_TREASURY"),
            operator: vm.envAddress("QUALYRA_OPERATOR"),
            guardian: vm.envAddress("QUALYRA_GUARDIAN"),
            usdg: vm.envOr("USDG", address(0))
        });

        vm.startBroadcast();
        (, address broadcaster,) = vm.readCallers();
        deployment = deploy(config, broadcaster, CREATE2_DEPLOYER);
        vm.stopBroadcast();

        _log(deployment);
    }

    /// @param deployer Account sending the transactions. It owns the factory until the timelock accepts it.
    /// @param create2Deployer Account that performs the CREATE2 deployment of the hook.
    function deploy(Config memory config, address deployer, address create2Deployer)
        public
        returns (Deployment memory d)
    {
        _preflight(config);

        d.factory = new QualyraFactory(deployer);
        IQualyraFactory factory = IQualyraFactory(address(d.factory));

        d.launchDeployer = new QualyraLaunchDeployer(address(factory));
        d.feeVault = new QualyraFeeVault(address(factory), config.treasury);
        d.competitionVault = new QualyraCompetitionVault(address(factory), config.operator, config.guardian);
        d.graduationExecutor = new QualyraGraduationExecutor(config.poolManager, factory);
        d.liquidityLocker = new QualyraLiquidityLocker(config.poolManager, factory);
        d.buybackBurner = new QualyraBuybackBurner(config.poolManager, factory);
        d.launchRouter = new QualyraLaunchRouter(factory);

        // Uniswap v4 reads hook permissions from the address, so the salt is mined for the right flag bits.
        bytes memory constructorArgs = abi.encode(config.poolManager, factory);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(create2Deployer, HOOK_FLAGS, type(QualyraHook).creationCode, constructorArgs);
        d.hook = new QualyraHook{salt: salt}(config.poolManager, factory);
        if (address(d.hook) != hookAddress) revert HookAddressMismatch();

        d.factory.initialize(
            QualyraFactory.Modules({
                deployer: address(d.launchDeployer),
                feeVault: address(d.feeVault),
                competitionVault: address(d.competitionVault),
                graduationExecutor: address(d.graduationExecutor),
                hook: address(d.hook),
                liquidityLocker: address(d.liquidityLocker),
                buybackBurner: address(d.buybackBurner),
                launchRouter: address(d.launchRouter)
            })
        );

        // Native ETH pair asset. On the Robinhood testnet the graduation threshold is scaled down
        // (ETH_*_TESTNET) so the full lifecycle is reachable with faucet funds; every other chain
        // (mainnet 4663, the 31337 unit tests) keeps the canonical 1.68 / 4.2 ETH economics.
        if (block.chainid == ROBINHOOD_TESTNET_CHAIN_ID) {
            d.factory.setQuoteAsset(address(0), ETH_PHANTOM_TESTNET, ETH_THRESHOLD_TESTNET, 18);
        } else {
            d.factory.setQuoteAsset(address(0), ETH_PHANTOM, ETH_THRESHOLD, 18);
        }
        if (config.usdg != address(0)) d.factory.setQuoteAsset(config.usdg, USDG_PHANTOM, USDG_THRESHOLD, 6);

        // Tokenized-stock pair assets, listed only on Robinhood Chain where they have code.
        // Values are Pons's exact on-chain pairTokenEconomics (18 decimals, phantom/threshold = 0.40);
        // the comment on each line is the human-readable graduation threshold in whole shares.
        if (block.chainid == ROBINHOOD_CHAIN_ID) {
            d.factory.setQuoteAsset(NVDA, 16640000000000000000, 41600000000000000000, 18); // 41.6 NVDA
            d.factory.setQuoteAsset(AAPL, 9680000000000000000, 24200000000000000000, 18); // 24.2 AAPL
            d.factory.setQuoteAsset(SPY, 4360000000000000000, 10900000000000000000, 18); // 10.9 SPY
        }

        // Chainlink feed config registry (spec §2.2 / §2.2.1). Config plumbing only — nothing here reads
        // a price; the future eligibility engine reads these back from the factory. Placeholders are
        // address(0), which the read-only QualyraOracle treats as NOT-EVALUABLE (fail-safe, never blocks
        // trading), so wiring them here cannot revert (the feed==address(0) path skips heartbeat!=0).
        // Do this while the deployer is still owner, alongside setQuoteAsset, before the timelock hand-off.
        _wireFeeds(d.factory, config);

        d.factory.transferOwnership(config.timelock);

        // Ownable2Step: ownership only moves once the timelock calls acceptOwnership(); until then
        // owner() stays the deployer. Assert the hand-off is aimed at the timelock, not left dangling.
        require(d.factory.pendingOwner() == config.timelock, "ownership handoff target mismatch");
    }

    /// @notice Wires the Chainlink feed-config registry (spec §2.2 / §2.2.1) into the factory, per network.
    /// @dev Config plumbing only — NOTHING here reads a price; the eligibility engine reads these back later.
    ///      Chainlink mandates that feed proxy addresses are NOT hardcoded: they are maintained in the official
    ///      Robinhood / Chainlink Data Feeds registry and differ per network. They are therefore supplied at
    ///      DEPLOY TIME via environment variables, sourced from https://docs.robinhood.com/chain
    ///      ("Oracles & Price Feeds") or https://data.chain.link:
    ///        FEED_ETH_USD, FEED_USDG, FEED_NVDA, FEED_AAPL, FEED_SPY, SEQUENCER_UPTIME_FEED  (proxy addresses)
    ///        FEED_HEARTBEAT                    default staleness bound in seconds (per-feed override:
    ///                                          FEED_ETH_USD_HEARTBEAT / FEED_USDG_HEARTBEAT / FEED_<TICKER>_HEARTBEAT)
    ///        SEQUENCER_GRACE_PERIOD            seconds to wait after the L2 sequencer recovers (spec §2.2.2)
    ///      Any feed left unset defaults to address(0), which the read-only QualyraOracle treats as
    ///      NOT-EVALUABLE (fail-safe: eligibility is skipped, trading is never blocked), so a partial or empty
    ///      config can never revert here — the feed==address(0) path skips the heartbeat!=0 requirement.
    ///      Run while the deployer still owns the factory; feeds can also be updated later through the timelock
    ///      via setPriceFeed / setSequencerFeed. Never ship a chain-4663 deploy with feeds left at address(0).
    function _wireFeeds(QualyraFactory factory, Config memory config) internal {
        uint256 defaultHeartbeat = vm.envOr("FEED_HEARTBEAT", uint256(3600));

        // ETH pair asset is the zero address; the key must match setQuoteAsset(address(0), ...).
        factory.setPriceFeed(
            address(0), vm.envOr("FEED_ETH_USD", address(0)), vm.envOr("FEED_ETH_USD_HEARTBEAT", defaultHeartbeat)
        );

        // USDG feed is keyed by the USDG actually listed on THIS network (testnet USDG != mainnet USDG), so a
        // USDG-paired token resolves its feed by its own quoteAsset. Only wired when USDG is listed.
        if (config.usdg != address(0)) {
            factory.setPriceFeed(
                config.usdg, vm.envOr("FEED_USDG", address(0)), vm.envOr("FEED_USDG_HEARTBEAT", defaultHeartbeat)
            );
        }

        // Tokenized-stock feeds only exist where the stocks are listed as pair assets: Robinhood Chain (4663).
        if (block.chainid == ROBINHOOD_CHAIN_ID) {
            factory.setPriceFeed(NVDA, vm.envOr("FEED_NVDA", address(0)), vm.envOr("FEED_NVDA_HEARTBEAT", defaultHeartbeat));
            factory.setPriceFeed(AAPL, vm.envOr("FEED_AAPL", address(0)), vm.envOr("FEED_AAPL_HEARTBEAT", defaultHeartbeat));
            factory.setPriceFeed(SPY, vm.envOr("FEED_SPY", address(0)), vm.envOr("FEED_SPY_HEARTBEAT", defaultHeartbeat));
        }

        // L2 sequencer uptime feed (spec §2.2.2), required on the Arbitrum-Orbit Robinhood Chain. address(0)
        // (the default when unset, e.g. the off-chain unit tests) disables the L2 check.
        factory.setSequencerFeed(
            vm.envOr("SEQUENCER_UPTIME_FEED", address(0)), vm.envOr("SEQUENCER_GRACE_PERIOD", uint256(3600))
        );
    }

    /// @notice Fail fast, before spending gas, when the deploy environment is misconfigured.
    /// @dev The byte-for-byte canonical checks only run on Robinhood Chain (4663); on other chain ids
    ///      (e.g. the 31337 unit tests) they are skipped, so existing tests are unaffected.
    function _preflight(Config memory config) internal view {
        require(address(config.poolManager) != address(0), "POOL_MANAGER unset");
        require(config.timelock != address(0), "QUALYRA_TIMELOCK unset");
        require(config.treasury != address(0), "QUALYRA_TREASURY unset");
        require(config.operator != address(0), "QUALYRA_OPERATOR unset");
        require(config.guardian != address(0), "QUALYRA_GUARDIAN unset");

        // The PoolManager must be a live contract, otherwise the whole platform wires to a dead address.
        require(address(config.poolManager).code.length > 0, "POOL_MANAGER has no code");

        // USDG is optional, but when listed it must be a 6-decimal token (guards the 10^12 mispricing bug).
        if (config.usdg != address(0)) {
            require(config.usdg.code.length > 0, "USDG has no code");
            require(IERC20Decimals(config.usdg).decimals() == USDG_DECIMALS, "USDG decimals != 6");
        }

        // On Robinhood Chain the externals are fixed and already verified on-chain: match the env values
        // byte-for-byte, confirm the CREATE2 deployer exists (hook mining needs it) and every stock has code.
        if (block.chainid == ROBINHOOD_CHAIN_ID) {
            require(address(config.poolManager) == RBH_POOL_MANAGER, "POOL_MANAGER != canonical (4663)");
            if (config.usdg != address(0)) require(config.usdg == RBH_USDG, "USDG != canonical (4663)");
            require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer missing");
            require(NVDA.code.length > 0, "NVDA has no code");
            require(AAPL.code.length > 0, "AAPL has no code");
            require(SPY.code.length > 0, "SPY has no code");
        }
    }

    function _log(Deployment memory d) private pure {
        console2.log("QualyraFactory            ", address(d.factory));
        console2.log("QualyraLaunchDeployer     ", address(d.launchDeployer));
        console2.log("QualyraFeeVault           ", address(d.feeVault));
        console2.log("QualyraCompetitionVault   ", address(d.competitionVault));
        console2.log("QualyraGraduationExecutor ", address(d.graduationExecutor));
        console2.log("QualyraLiquidityLocker    ", address(d.liquidityLocker));
        console2.log("QualyraBuybackBurner      ", address(d.buybackBurner));
        console2.log("QualyraLaunchRouter       ", address(d.launchRouter));
        console2.log("QualyraHook               ", address(d.hook));
    }
}

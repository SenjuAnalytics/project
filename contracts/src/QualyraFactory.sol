// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {QualyraLaunchDeployer} from "./QualyraLaunchDeployer.sol";
import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraFeeVault} from "./interfaces/IQualyraFeeVault.sol";
import {IQualyraBondingCurve} from "./interfaces/IQualyraBondingCurve.sol";
import {IQualyraGraduationExecutor} from "./interfaces/IQualyraGraduationExecutor.sol";

/// @title QualyraFactory
/// @notice Creates launches and acts as the registry the other Qualyra contracts read from.
///         Every parameter the owner can change only applies to launches created afterwards, and each
///         setter is bounded by the hard limits below. The owner is expected to be a timelock.
contract QualyraFactory is Ownable2Step, ReentrancyGuard {
    struct Modules {
        address deployer;
        address feeVault;
        address competitionVault;
        address graduationExecutor;
        address hook;
        address liquidityLocker;
        address buybackBurner;
        address launchRouter;
    }

    uint256 public constant TOKEN_SUPPLY = 1_000_000_000e18;
    uint256 public constant MAX_LAUNCH_FEE = 0.05 ether;
    uint256 public constant MAX_CREATOR_TAX_BPS = 1_000;
    uint256 public constant MAX_SNIPE_START_BPS = 9_900;
    uint256 public constant MAX_SNIPE_WINDOW = 60;
    uint256 public constant MIN_CREATOR_SHARE_BPS = 5_000;
    uint256 public constant MAX_PLATFORM_SHARE_BPS = 3_000;
    uint256 public constant MAX_COMPETITION_SHARE_BPS = 3_000;
    uint256 public constant MAX_SNIPE_EXEMPT = 32;
    /// @dev Minimum decimals a quote asset may report. Below six, integer
    ///      basis-point curve fees can round to zero and be split fee-free.
    uint8 public constant MIN_QUOTE_ASSET_DECIMALS = 6;
    /// @dev Maximum decimals a quote asset may report. The hook scales pool prices to 18 decimals, and
    ///      the scale factor for anything above this would stop fitting its arithmetic.
    uint8 public constant MAX_QUOTE_ASSET_DECIMALS = 36;

    address public deployer;
    address public feeVault;
    address public competitionVault;
    address public graduationExecutor;
    address public hook;
    address public liquidityLocker;
    address public buybackBurner;
    address public launchRouter;
    bool public initialized;

    uint256 public launchFee = 0.0005 ether;
    uint16 public maxCreatorTaxBps = 500;
    uint16 public snipeStartBps = 9_900;
    uint16 public snipeWindow = 15;
    uint16 public creatorShareBps = 7_000;
    uint16 public platformShareBps = 1_500;
    uint16 public competitionShareBps = 1_500;

    mapping(address asset => IQualyraFactory.QuoteAssetConfig) private _quoteAssets;
    address[] private _quoteAssetList;
    mapping(address token => IQualyraFactory.Launch) private _launches;
    address[] private _tokens;
    uint256 private _launchNonce;

    mapping(address token => mapping(address account => bool)) public isSnipeExempt;
    mapping(address token => address) public feeRecipientOf;

    // ---------------------------------------------------------------------------------------------
    // Chainlink feed config registry (spec §2.2 / §2.2.1)
    //
    // Purely a config registry the future eligibility engine reads from; nothing here reads a
    // price or affects launches. `asset => USD price feed` maps a pair asset (address(0) = native
    // ETH) to its Chainlink AggregatorV3 USD proxy, and each configured feed carries its own
    // staleness bound. The L2 (Arbitrum Orbit) sequencer uptime feed + grace period gate stale
    // reads after a sequencer outage. address(0) on any slot means "not configured" and the oracle
    // treats the price as NOT-EVALUABLE (fail-safe) — it never blocks trading.
    // ---------------------------------------------------------------------------------------------

    /// @notice USD price feed for a pair asset. address(0) is the native-ETH asset and is a valid key.
    mapping(address asset => address) public priceFeedOf;
    /// @notice Staleness bound (seconds) for a configured feed.
    mapping(address feed => uint256) public heartbeatOf;
    /// @notice L2 (Arbitrum Orbit) sequencer uptime feed. address(0) disables the L2 check.
    address public sequencerUptimeFeed;
    /// @notice Seconds to wait after the sequencer recovers before trusting prices again.
    uint256 public sequencerGracePeriod;

    event Initialized(Modules modules);
    event QuoteAssetSet(address indexed asset, uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals);
    event QuoteAssetDisabled(address indexed asset);
    event LaunchFeeSet(uint256 launchFee);
    event MaxCreatorTaxSet(uint256 maxCreatorTaxBps);
    event SnipeParamsSet(uint256 startBps, uint256 window);
    event FeeSplitSet(uint256 creatorShareBps, uint256 platformShareBps, uint256 competitionShareBps);
    event PriceFeedSet(address indexed asset, address indexed feed, uint256 heartbeat);
    event SequencerFeedSet(address indexed feed, uint256 gracePeriod);
    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed creator,
        address quoteAsset,
        uint256 creatorTaxBps,
        string name,
        string symbol,
        string metadataURI
    );
    event SnipeExemptionsSet(address indexed token, address[] accounts);
    event CreatorFeeRecipientSet(address indexed token, address indexed previousRecipient, address indexed newRecipient);
    event TokenGraduated(address indexed token, address indexed curve);
    event StuckLaunchRecovered(address indexed token);

    error AlreadyInitialized();
    error NotInitialized();
    error ZeroAddress();
    error Unauthorized();
    error InvalidConfig();
    error InvalidLaunchFee();
    error InvalidMetadata();
    error QuoteAssetNotEnabled();
    error CreatorTaxTooHigh();
    error TooManyExemptions();
    error UnknownToken();
    error RenounceDisabled();
    error QuoteAssetDecimalsTooLow();
    error QuoteAssetDecimalsTooHigh();
    error QuoteAssetDecimalsMismatch(uint8 expected, uint8 actual);
    error QuoteAssetDecimalsUnavailable();
    /// @dev A configured (non-zero) price feed must carry a non-zero staleness bound.
    error InvalidHeartbeat();

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ---------------------------------------------------------------------------------------------
    // Setup and parameters
    // ---------------------------------------------------------------------------------------------

    /// @notice Wires the rest of the system. Can only run once.
    function initialize(Modules calldata modules) external onlyOwner {
        if (initialized) revert AlreadyInitialized();
        if (
            modules.deployer == address(0) || modules.feeVault == address(0) || modules.competitionVault == address(0)
                || modules.graduationExecutor == address(0) || modules.hook == address(0)
                || modules.liquidityLocker == address(0) || modules.buybackBurner == address(0)
                || modules.launchRouter == address(0)
        ) revert ZeroAddress();

        deployer = modules.deployer;
        feeVault = modules.feeVault;
        competitionVault = modules.competitionVault;
        graduationExecutor = modules.graduationExecutor;
        hook = modules.hook;
        liquidityLocker = modules.liquidityLocker;
        buybackBurner = modules.buybackBurner;
        launchRouter = modules.launchRouter;
        initialized = true;

        emit Initialized(modules);
    }

    /// @notice Lists or updates a pair asset. `asset` is address(0) for native ETH.
    /// @param phantomQuote Virtual pair asset reserve that sets the starting price.
    /// @param graduationThreshold Amount the curve has to raise before it graduates.
    /// @param expectedDecimals The pair asset's own token decimals. `phantomQuote` and
    ///        `graduationThreshold` are denominated in these decimals, so an unverified
    ///        scale would silently misprice every curve against this asset by orders of
    ///        magnitude. The stated scale is checked against the token's on-chain
    ///        `decimals()` before the asset is enabled.
    function setQuoteAsset(
        address asset,
        uint128 phantomQuote,
        uint128 graduationThreshold,
        uint8 expectedDecimals
    ) external onlyOwner {
        if (!initialized) revert NotInitialized();
        if (phantomQuote == 0 || graduationThreshold == 0) revert InvalidConfig();
        if (expectedDecimals < MIN_QUOTE_ASSET_DECIMALS) revert QuoteAssetDecimalsTooLow();
        if (expectedDecimals > MAX_QUOTE_ASSET_DECIMALS) revert QuoteAssetDecimalsTooHigh();
        if (asset == address(0)) {
            // Native ETH has no metadata to read and is 18 decimals by definition.
            if (expectedDecimals != 18) revert QuoteAssetDecimalsMismatch(18, expectedDecimals);
        } else {
            if (asset.code.length == 0) revert InvalidConfig();
            // Enabling here is the asset's entry into service, so its scale must be
            // readable and match now; there is no separate approval step to defer to.
            _requireQuoteAssetDecimals(asset, expectedDecimals);
        }
        IQualyraGraduationExecutor(graduationExecutor).checkEconomics(
            asset, phantomQuote, graduationThreshold, TOKEN_SUPPLY
        );

        IQualyraFactory.QuoteAssetConfig storage config = _quoteAssets[asset];
        if (!config.listed) {
            config.listed = true;
            _quoteAssetList.push(asset);
        }
        config.enabled = true;
        config.phantomQuote = phantomQuote;
        config.graduationThreshold = graduationThreshold;
        config.decimals = expectedDecimals;

        emit QuoteAssetSet(asset, phantomQuote, graduationThreshold, expectedDecimals);
    }

    /// @dev Reverts unless `asset` reports exactly `expectedDecimals`. An asset whose
    ///      scale cannot be read must never enter service on an unverified claim.
    function _requireQuoteAssetDecimals(address asset, uint8 expectedDecimals) private view {
        try IERC20Metadata(asset).decimals() returns (uint8 actual) {
            if (actual != expectedDecimals) revert QuoteAssetDecimalsMismatch(expectedDecimals, actual);
        } catch {
            revert QuoteAssetDecimalsUnavailable();
        }
    }

    /// @notice Stops new launches against `asset`. Existing launches are not affected.
    function disableQuoteAsset(address asset) external onlyOwner {
        if (!_quoteAssets[asset].enabled) revert QuoteAssetNotEnabled();
        _quoteAssets[asset].enabled = false;
        emit QuoteAssetDisabled(asset);
    }

    function setLaunchFee(uint256 newLaunchFee) external onlyOwner {
        if (newLaunchFee > MAX_LAUNCH_FEE) revert InvalidConfig();
        launchFee = newLaunchFee;
        emit LaunchFeeSet(newLaunchFee);
    }

    function setMaxCreatorTaxBps(uint16 newMaxCreatorTaxBps) external onlyOwner {
        if (newMaxCreatorTaxBps > MAX_CREATOR_TAX_BPS) revert InvalidConfig();
        maxCreatorTaxBps = newMaxCreatorTaxBps;
        emit MaxCreatorTaxSet(newMaxCreatorTaxBps);
    }

    function setSnipeParams(uint16 startBps, uint16 window) external onlyOwner {
        if (startBps > MAX_SNIPE_START_BPS || window > MAX_SNIPE_WINDOW) revert InvalidConfig();
        snipeStartBps = startBps;
        snipeWindow = window;
        emit SnipeParamsSet(startBps, window);
    }

    /// @notice Split of the trading fee for future launches. Creator tax always goes fully to the creator.
    function setFeeSplit(uint16 creatorShare, uint16 platformShare, uint16 competitionShare) external onlyOwner {
        if (
            uint256(creatorShare) + platformShare + competitionShare != 10_000 || creatorShare < MIN_CREATOR_SHARE_BPS
                || platformShare > MAX_PLATFORM_SHARE_BPS || competitionShare > MAX_COMPETITION_SHARE_BPS
        ) revert InvalidConfig();
        creatorShareBps = creatorShare;
        platformShareBps = platformShare;
        competitionShareBps = competitionShare;
        emit FeeSplitSet(creatorShare, platformShare, competitionShare);
    }

    /// @notice Registers (or clears) the Chainlink USD price feed for a pair asset. `asset` is
    ///         address(0) for the native-ETH asset, which is a legitimate key (never rejected).
    /// @dev Config plumbing only — read later by the eligibility engine. Passing `feed == address(0)`
    ///      unsets the asset's feed (the oracle then treats its price as NOT-EVALUABLE, fail-safe). A
    ///      non-zero feed must carry a non-zero staleness bound, so `heartbeatOf[feed]` is recorded here.
    function setPriceFeed(address asset, address feed, uint256 heartbeat) external onlyOwner {
        priceFeedOf[asset] = feed;
        if (feed != address(0)) {
            if (heartbeat == 0) revert InvalidHeartbeat();
            heartbeatOf[feed] = heartbeat;
        }
        emit PriceFeedSet(asset, feed, heartbeat);
    }

    /// @notice Registers (or clears) the L2 sequencer uptime feed and its recovery grace period.
    /// @dev `feed == address(0)` disables the L2 sequencer check (used on non-L2 chains and tests).
    function setSequencerFeed(address feed, uint256 gracePeriod) external onlyOwner {
        sequencerUptimeFeed = feed;
        sequencerGracePeriod = gracePeriod;
        emit SequencerFeedSet(feed, gracePeriod);
    }

    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    // ---------------------------------------------------------------------------------------------
    // Launches
    // ---------------------------------------------------------------------------------------------

    /// @notice Creates a token and its bonding curve. `msg.value` must equal the launch fee.
    function launchToken(IQualyraFactory.LaunchParams calldata params)
        external
        payable
        nonReentrant
        returns (address token, address curve)
    {
        return _launch(msg.sender, params);
    }

    /// @notice Same as `launchToken`, used by the launch router so the creator can buy in the same transaction.
    function launchTokenFor(address creator, IQualyraFactory.LaunchParams calldata params)
        external
        payable
        nonReentrant
        returns (address token, address curve)
    {
        if (msg.sender != launchRouter) revert Unauthorized();
        return _launch(creator, params);
    }

    /// @notice Retries graduation of a completed curve.
    function graduate(address token) external {
        address curve = _launches[token].curve;
        if (curve == address(0)) revert UnknownToken();
        IQualyraBondingCurve(curve).graduate();
    }

    function markGraduated(address token) external {
        if (msg.sender != graduationExecutor) revert Unauthorized();
        IQualyraFactory.Launch storage launch = _launches[token];
        if (launch.curve == address(0)) revert UnknownToken();
        launch.graduated = true;
        emit TokenGraduated(token, launch.curve);
    }

    /// @notice Opens refunds on a curve that completed but has been unable to graduate for seven days.
    function recoverStuckLaunch(address token) external onlyOwner {
        address curve = _launches[token].curve;
        if (curve == address(0)) revert UnknownToken();
        IQualyraBondingCurve(curve).enableRefunds();
        emit StuckLaunchRecovered(token);
    }

    /// @notice Hands the creator fee stream of `token` to a new address. Only the current recipient can do this.
    function setCreatorFeeRecipient(address token, address newRecipient) external {
        address current = feeRecipientOf[token];
        if (current == address(0)) revert UnknownToken();
        if (msg.sender != current) revert Unauthorized();
        if (newRecipient == address(0)) revert ZeroAddress();
        feeRecipientOf[token] = newRecipient;
        emit CreatorFeeRecipientSet(token, current, newRecipient);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    function getLaunch(address token) external view returns (IQualyraFactory.Launch memory) {
        return _launches[token];
    }

    function curveOf(address token) external view returns (address) {
        return _launches[token].curve;
    }

    function isQualyraToken(address token) external view returns (bool) {
        return _launches[token].curve != address(0);
    }

    function isGraduated(address token) external view returns (bool) {
        return _launches[token].graduated;
    }

    function quoteAssetConfig(address asset) external view returns (IQualyraFactory.QuoteAssetConfig memory) {
        return _quoteAssets[asset];
    }

    function quoteAssetCount() external view returns (uint256) {
        return _quoteAssetList.length;
    }

    function quoteAssetAt(uint256 index) external view returns (address) {
        return _quoteAssetList[index];
    }

    function tokenCount() external view returns (uint256) {
        return _tokens.length;
    }

    function tokenAt(uint256 index) external view returns (address) {
        return _tokens[index];
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _launch(address creator, IQualyraFactory.LaunchParams calldata params)
        private
        returns (address token, address curve)
    {
        if (!initialized) revert NotInitialized();
        if (msg.value != launchFee) revert InvalidLaunchFee();
        if (bytes(params.name).length == 0 || bytes(params.symbol).length == 0) revert InvalidMetadata();
        if (params.creatorTaxBps > maxCreatorTaxBps) revert CreatorTaxTooHigh();
        if (params.snipeExempt.length > MAX_SNIPE_EXEMPT) revert TooManyExemptions();

        IQualyraFactory.QuoteAssetConfig memory config = _quoteAssets[params.quoteAsset];
        if (!config.enabled) revert QuoteAssetNotEnabled();

        (token, curve) = QualyraLaunchDeployer(deployer).deploy(
            keccak256(abi.encode(creator, _launchNonce++)),
            QualyraLaunchDeployer.DeployParams({
                name: params.name,
                symbol: params.symbol,
                metadataURI: params.metadataURI,
                quoteAsset: params.quoteAsset,
                supply: TOKEN_SUPPLY,
                phantomQuote: config.phantomQuote,
                graduationThreshold: config.graduationThreshold,
                creatorTaxBps: params.creatorTaxBps,
                snipeStartBps: snipeStartBps,
                snipeWindow: snipeWindow
            })
        );

        _launches[token] = IQualyraFactory.Launch({
            curve: curve,
            creator: creator,
            quoteAsset: params.quoteAsset,
            launchedAt: SafeCast.toUint64(block.timestamp),
            creatorTaxBps: params.creatorTaxBps,
            creatorShareBps: creatorShareBps,
            platformShareBps: platformShareBps,
            competitionShareBps: competitionShareBps,
            snipeStartBps: snipeStartBps,
            snipeWindow: snipeWindow,
            graduated: false
        });
        _tokens.push(token);

        address recipient = params.creatorFeeRecipient == address(0) ? creator : params.creatorFeeRecipient;
        feeRecipientOf[token] = recipient;
        isSnipeExempt[token][creator] = true;
        isSnipeExempt[token][recipient] = true;
        for (uint256 i; i < params.snipeExempt.length; ++i) {
            isSnipeExempt[token][params.snipeExempt[i]] = true;
        }

        if (msg.value != 0) IQualyraFeeVault(feeVault).collectLaunchFee{value: msg.value}();

        emit TokenLaunched(
            token,
            curve,
            creator,
            params.quoteAsset,
            params.creatorTaxBps,
            params.name,
            params.symbol,
            params.metadataURI
        );
        emit CreatorFeeRecipientSet(token, address(0), recipient);
        if (params.snipeExempt.length != 0) emit SnipeExemptionsSet(token, params.snipeExempt);
    }
}

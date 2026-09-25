// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IQualyraFactory {
    struct QuoteAssetConfig {
        bool listed;
        bool enabled;
        uint128 phantomQuote;
        uint128 graduationThreshold;
        /// @dev The pair asset's own token decimals. `phantomQuote` and
        ///      `graduationThreshold` are denominated in these decimals.
        uint8 decimals;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string metadataURI;
        /// @dev address(0) for native ETH.
        address quoteAsset;
        uint16 creatorTaxBps;
        /// @dev Defaults to the creator when left empty.
        address creatorFeeRecipient;
        /// @dev Extra wallets that skip the snipe tax, up to 32.
        address[] snipeExempt;
    }

    struct Launch {
        address curve;
        address creator;
        address quoteAsset;
        uint64 launchedAt;
        uint16 creatorTaxBps;
        uint16 creatorShareBps;
        uint16 platformShareBps;
        uint16 competitionShareBps;
        uint16 snipeStartBps;
        uint16 snipeWindow;
        bool graduated;
    }

    function owner() external view returns (address);
    function feeVault() external view returns (address);
    function competitionVault() external view returns (address);
    function graduationExecutor() external view returns (address);
    function hook() external view returns (address);
    function liquidityLocker() external view returns (address);
    function buybackBurner() external view returns (address);
    function launchRouter() external view returns (address);
    function launchFee() external view returns (uint256);

    function getLaunch(address token) external view returns (Launch memory);
    function curveOf(address token) external view returns (address);
    function isQualyraToken(address token) external view returns (bool);
    function isGraduated(address token) external view returns (bool);
    function isSnipeExempt(address token, address account) external view returns (bool);
    function feeRecipientOf(address token) external view returns (address);
    function quoteAssetConfig(address asset) external view returns (QuoteAssetConfig memory);
    function quoteAssetCount() external view returns (uint256);
    function quoteAssetAt(uint256 index) external view returns (address);

    // Chainlink feed config registry (spec §2.2 / §2.2.1). Read by the eligibility engine.
    function priceFeedOf(address asset) external view returns (address);
    function heartbeatOf(address feed) external view returns (uint256);
    function sequencerUptimeFeed() external view returns (address);
    function sequencerGracePeriod() external view returns (uint256);

    function launchTokenFor(address creator, LaunchParams calldata params)
        external
        payable
        returns (address token, address curve);
    function markGraduated(address token) external;
}

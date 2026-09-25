// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SystemTestBase} from "./utils/SystemTestBase.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Proves Qualyra's REAL graduation-executor checkEconomics accepts the exact on-chain
///         Pons pairTokenEconomics for the three Robinhood Chain tokenized stocks.
///
///         Unlike QualyraQuoteAsset.t.sol (which runs on LaunchTestBase's mock executor so it can
///         isolate the decimals guard), this suite wires the production QualyraGraduationExecutor via
///         SystemTestBase, so setQuoteAsset here runs the genuine geometric mintability check. If any
///         Pons value were unmintable on Qualyra's curve, setQuoteAsset would revert.
///
///         Values are copied verbatim from Pons's pairTokenEconomics getter on Robinhood Chain (4663);
///         all quotes are 18 decimals and keep phantomQuote/graduationThreshold = 0.40 (the ETH base).
contract QualyraStockQuoteAssetTest is SystemTestBase {
    struct StockPair {
        string symbol;
        uint128 phantomQuote;
        uint128 graduationThreshold;
    }

    function setUp() public {
        _deployCore();
        // The competition/buyback/router modules are unused here; initialize only checks non-zero.
        _initialize(makeAddr("competitionVault"), makeAddr("buybackBurner"), makeAddr("launchRouter"));
    }

    /// @dev The three shipped Pons pairs, exact on-chain integers.
    function _pairs() internal pure returns (StockPair[3] memory pairs) {
        pairs[0] = StockPair("NVDA", 16640000000000000000, 41600000000000000000); // 41.6 NVDA
        pairs[1] = StockPair("AAPL", 9680000000000000000, 24200000000000000000); // 24.2 AAPL
        pairs[2] = StockPair("SPY", 4360000000000000000, 10900000000000000000); // 10.9 SPY
    }

    /// @dev Registers a fresh 18-decimal mock for each Pons pair through the real executor and asserts
    ///      the stored config matches. A revert here would mean a Pons value is not mintable on Qualyra.
    function test_ponsStockEconomics_acceptedByRealCheckEconomics() public {
        StockPair[3] memory pairs = _pairs();
        for (uint256 i = 0; i < pairs.length; i++) {
            MockERC20 token = new MockERC20(pairs[i].symbol, pairs[i].symbol, 18);

            factory.setQuoteAsset(address(token), pairs[i].phantomQuote, pairs[i].graduationThreshold, 18);

            IQualyraFactory.QuoteAssetConfig memory config = factory.quoteAssetConfig(address(token));
            assertTrue(config.listed, "quote asset not listed");
            assertTrue(config.enabled, "quote asset not enabled");
            assertEq(config.phantomQuote, pairs[i].phantomQuote, "phantomQuote mismatch");
            assertEq(config.graduationThreshold, pairs[i].graduationThreshold, "graduationThreshold mismatch");
            assertEq(config.decimals, 18, "decimals must be 18");
        }
    }

    /// @dev Every Pons pair keeps the ETH-base curve shape: phantomQuote / graduationThreshold = 0.40.
    ///      Equivalently phantomQuote * 5 == graduationThreshold * 2 (exact for all three shipped pairs).
    function test_ponsStockEconomics_preserveFortyPercentRatio() public pure {
        StockPair[3] memory pairs = _pairs();
        for (uint256 i = 0; i < pairs.length; i++) {
            uint256 lhs = uint256(pairs[i].phantomQuote) * 5;
            uint256 rhs = uint256(pairs[i].graduationThreshold) * 2;
            uint256 diff = lhs > rhs ? lhs - rhs : rhs - lhs;
            assertLe(diff, 1, "phantom/threshold ratio is not 0.40");
        }
    }
}

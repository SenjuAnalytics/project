// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LaunchTestBase} from "./utils/LaunchTestBase.sol";
import {QualyraFactory} from "../src/QualyraFactory.sol";
import {IQualyraFactory} from "../src/interfaces/IQualyraFactory.sol";

import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev A contract that holds bytecode but does not implement `decimals()`.
contract NoDecimalsToken {}

/// @notice Covers the Pons-faithful quote-asset decimals guard on setQuoteAsset:
///         a min-6 floor, an on-chain `decimals()` match for ERC-20 assets, and
///         the native-ETH-is-18 rule. The base's mock graduation executor makes
///         `checkEconomics` a no-op, so these tests isolate the decimals logic.
contract QualyraQuoteAssetTest is LaunchTestBase {
    function test_setQuoteAsset_storesDecimalsForSixDecimalToken() public {
        MockERC20 token = new MockERC20("Six", "SIX", 6);
        factory.setQuoteAsset(address(token), USDG_PHANTOM, USDG_THRESHOLD, 6);

        IQualyraFactory.QuoteAssetConfig memory config = factory.quoteAssetConfig(address(token));
        assertEq(config.decimals, 6);
        assertTrue(config.enabled);
        assertTrue(config.listed);
    }

    function test_setQuoteAsset_revertsOnDecimalsMismatch() public {
        // Real token is 18 decimals but the operator claims 6.
        MockERC20 token = new MockERC20("Eighteen", "EIGHT", 18);
        vm.expectRevert(
            abi.encodeWithSelector(QualyraFactory.QuoteAssetDecimalsMismatch.selector, uint8(6), uint8(18))
        );
        factory.setQuoteAsset(address(token), USDG_PHANTOM, USDG_THRESHOLD, 6);
    }

    function test_setQuoteAsset_revertsWhenDecimalsBelowFloor() public {
        MockERC20 token = new MockERC20("Five", "FIVE", 5);
        vm.expectRevert(QualyraFactory.QuoteAssetDecimalsTooLow.selector);
        factory.setQuoteAsset(address(token), USDG_PHANTOM, USDG_THRESHOLD, 5);
    }

    function test_setQuoteAsset_revertsWhenDecimalsUnavailable() public {
        // Has code, but no decimals() to read -> must never enter service.
        NoDecimalsToken token = new NoDecimalsToken();
        vm.expectRevert(QualyraFactory.QuoteAssetDecimalsUnavailable.selector);
        factory.setQuoteAsset(address(token), USDG_PHANTOM, USDG_THRESHOLD, 6);
    }

    function test_setQuoteAsset_nativeEthRejectsNon18() public {
        vm.expectRevert(
            abi.encodeWithSelector(QualyraFactory.QuoteAssetDecimalsMismatch.selector, uint8(18), uint8(6))
        );
        factory.setQuoteAsset(address(0), ETH_PHANTOM, ETH_THRESHOLD, 6);
    }

    function test_setQuoteAsset_nativeEthAcceptsEighteen() public {
        factory.setQuoteAsset(address(0), ETH_PHANTOM, ETH_THRESHOLD, 18);
        assertEq(factory.quoteAssetConfig(address(0)).decimals, 18);
    }
}

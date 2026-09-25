// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {LaunchTestBase} from "./utils/LaunchTestBase.sol";
import {QualyraFactory} from "../src/QualyraFactory.sol";

import {MockERC20} from "./mocks/MockERC20.sol";

/// @notice Covers the additive Chainlink FEED CONFIG REGISTRY on QualyraFactory (spec §2.2 / §2.2.1):
///         owner-only price/sequencer setters, event emission, the configured-feed heartbeat guard,
///         and the deliberate allowance of address(0) keys (native ETH asset, unset/disabled feed).
///
///         This is config plumbing only — nothing here reads a price. LaunchTestBase deploys and
///         initializes a QualyraFactory owned by the test contract (address(this)), so the test
///         contract is the timelock owner for onlyOwner calls and `alice` is a plain non-owner.
contract QualyraFactoryFeedsTest is LaunchTestBase {
    // Local copies of the factory events so vm.expectEmit can match them by signature.
    event PriceFeedSet(address indexed asset, address indexed feed, uint256 heartbeat);
    event SequencerFeedSet(address indexed feed, uint256 gracePeriod);

    address internal ethFeed = makeAddr("ethUsdFeed");
    address internal stockFeed = makeAddr("stockFeed");
    address internal sequencerFeed = makeAddr("sequencerFeed");

    uint256 internal constant HEARTBEAT = 3_600;
    uint256 internal constant GRACE = 3_600;

    // ---------------------------------------------------------------------------------------------
    // setPriceFeed
    // ---------------------------------------------------------------------------------------------

    function test_setPriceFeed_ownerStoresMappingAndHeartbeatAndEmits() public {
        MockERC20 stock = new MockERC20("Nvidia", "NVDA", 18);

        vm.expectEmit(true, true, true, true, address(factory));
        emit PriceFeedSet(address(stock), stockFeed, HEARTBEAT);
        factory.setPriceFeed(address(stock), stockFeed, HEARTBEAT);

        assertEq(factory.priceFeedOf(address(stock)), stockFeed, "feed mapping stored");
        assertEq(factory.heartbeatOf(stockFeed), HEARTBEAT, "heartbeat stored");
    }

    function test_setPriceFeed_nativeEthAssetAllowed() public {
        // address(0) is the native-ETH asset and MUST be a valid key (never rejected as ZeroAddress).
        vm.expectEmit(true, true, true, true, address(factory));
        emit PriceFeedSet(address(0), ethFeed, HEARTBEAT);
        factory.setPriceFeed(address(0), ethFeed, HEARTBEAT);

        assertEq(factory.priceFeedOf(address(0)), ethFeed, "native ETH feed stored");
        assertEq(factory.heartbeatOf(ethFeed), HEARTBEAT, "native ETH feed heartbeat stored");
    }

    function test_setPriceFeed_zeroFeedUnsetsWithoutHeartbeat() public {
        // Unsetting a feed (feed==address(0)) is allowed and skips the heartbeat!=0 requirement.
        factory.setPriceFeed(address(0), address(0), 0);
        assertEq(factory.priceFeedOf(address(0)), address(0), "feed cleared");
    }

    function test_setPriceFeed_revertsWhenConfiguredFeedHasZeroHeartbeat() public {
        MockERC20 stock = new MockERC20("Apple", "AAPL", 18);
        vm.expectRevert(QualyraFactory.InvalidHeartbeat.selector);
        factory.setPriceFeed(address(stock), stockFeed, 0);
    }

    function test_setPriceFeed_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setPriceFeed(address(0), ethFeed, HEARTBEAT);
    }

    // ---------------------------------------------------------------------------------------------
    // setSequencerFeed
    // ---------------------------------------------------------------------------------------------

    function test_setSequencerFeed_ownerStoresFieldsAndEmits() public {
        vm.expectEmit(true, true, true, true, address(factory));
        emit SequencerFeedSet(sequencerFeed, GRACE);
        factory.setSequencerFeed(sequencerFeed, GRACE);

        assertEq(factory.sequencerUptimeFeed(), sequencerFeed, "sequencer feed stored");
        assertEq(factory.sequencerGracePeriod(), GRACE, "grace period stored");
    }

    function test_setSequencerFeed_zeroFeedDisablesCheck() public {
        // feed==address(0) disables the L2 sequencer check (non-L2 / test chains) — must be allowed.
        factory.setSequencerFeed(address(0), GRACE);
        assertEq(factory.sequencerUptimeFeed(), address(0), "sequencer check disabled");
        assertEq(factory.sequencerGracePeriod(), GRACE, "grace period still stored");
    }

    function test_setSequencerFeed_revertsForNonOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        factory.setSequencerFeed(sequencerFeed, GRACE);
    }
}

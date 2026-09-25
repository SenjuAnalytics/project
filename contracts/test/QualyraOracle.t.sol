// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";

import {QualyraOracle} from "../src/libraries/QualyraOracle.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {MockSequencerFeed} from "./mocks/MockSequencerFeed.sol";

/// @notice Fail-safe unit tests for the QualyraOracle foundation module (plan §9 / §10 step 1).
/// @dev Internal library functions are inlined into this test contract, so they can be called directly.
contract QualyraOracleTest is Test {
    uint256 internal constant BASE_TIME = 1_000_000;
    uint256 internal constant HEARTBEAT = 3_600; // 1h
    uint256 internal constant GRACE = 3_600; // 1h

    MockV3Aggregator internal ethUsd; // 8 decimals, like a real Chainlink USD feed
    MockSequencerFeed internal seq;

    function setUp() public {
        vm.warp(BASE_TIME);
        ethUsd = new MockV3Aggregator(8, int256(2_000e8)); // ETH = $2,000
        seq = new MockSequencerFeed(0, BASE_TIME - 10 * GRACE); // up, long ago
    }

    // ---------------------------------------------------------------------
    // readUsdPrice — happy paths & decimal normalization
    // ---------------------------------------------------------------------

    function test_ReadUsdPrice_Normalizes8Decimals() public view {
        (uint256 price18, bool ok) = QualyraOracle.readUsdPrice(address(ethUsd), HEARTBEAT);
        assertTrue(ok, "should be evaluable");
        assertEq(price18, 2_000e18, "8-dec feed must scale up to 18 dec");
    }

    function test_ReadUsdPrice_Handles18Decimals() public {
        MockV3Aggregator feed = new MockV3Aggregator(18, int256(1e18));
        (uint256 price18, bool ok) = QualyraOracle.readUsdPrice(address(feed), HEARTBEAT);
        assertTrue(ok);
        assertEq(price18, 1e18);
    }

    function test_ReadUsdPrice_ScalesDownHighDecimals() public {
        MockV3Aggregator feed = new MockV3Aggregator(20, int256(3e20)); // $3 at 20 dec
        (uint256 price18, bool ok) = QualyraOracle.readUsdPrice(address(feed), HEARTBEAT);
        assertTrue(ok);
        assertEq(price18, 3e18);
    }

    // ---------------------------------------------------------------------
    // readUsdPrice — fail-safe (NOT-EVALUABLE) paths
    // ---------------------------------------------------------------------

    function test_ReadUsdPrice_StaleIsNotEvaluable() public {
        ethUsd.setUpdatedAt(vm.getBlockTimestamp() - HEARTBEAT - 1); // just past heartbeat
        (uint256 price18, bool ok) = QualyraOracle.readUsdPrice(address(ethUsd), HEARTBEAT);
        assertFalse(ok, "stale price must be NOT-EVALUABLE");
        assertEq(price18, 0);
    }

    function test_ReadUsdPrice_FutureTimestampIsNotEvaluable() public {
        ethUsd.setUpdatedAt(vm.getBlockTimestamp() + 1);
        (, bool ok) = QualyraOracle.readUsdPrice(address(ethUsd), HEARTBEAT);
        assertFalse(ok);
    }

    function test_ReadUsdPrice_NonPositiveIsNotEvaluable() public {
        ethUsd.setAnswer(0);
        (, bool okZero) = QualyraOracle.readUsdPrice(address(ethUsd), HEARTBEAT);
        assertFalse(okZero, "zero answer");

        ethUsd.setAnswer(-1);
        (, bool okNeg) = QualyraOracle.readUsdPrice(address(ethUsd), HEARTBEAT);
        assertFalse(okNeg, "negative answer");
    }

    function test_ReadUsdPrice_ZeroHeartbeatIsNotEvaluable() public view {
        (, bool ok) = QualyraOracle.readUsdPrice(address(ethUsd), 0);
        assertFalse(ok, "unconfigured heartbeat must be NOT-EVALUABLE");
    }

    function test_ReadUsdPrice_PausedIsNotEvaluable() public {
        ethUsd.setPaused(true);
        (, bool ok) = QualyraOracle.readUsdPrice(address(ethUsd), HEARTBEAT);
        assertFalse(ok, "paused feed must be NOT-EVALUABLE");
    }

    function test_ReadUsdPrice_UnreadableFeedIsNotEvaluable() public {
        ethUsd.setRevertOnRead(true);
        (, bool ok) = QualyraOracle.readUsdPrice(address(ethUsd), HEARTBEAT);
        assertFalse(ok, "reverting feed must be caught -> NOT-EVALUABLE");
    }

    function test_ReadUsdPrice_ZeroFeedIsNotEvaluable() public view {
        (, bool ok) = QualyraOracle.readUsdPrice(address(0), HEARTBEAT);
        assertFalse(ok);
    }

    // ---------------------------------------------------------------------
    // sequencerUp — L2 uptime gate
    // ---------------------------------------------------------------------

    function test_SequencerUp_WhenUpPastGrace() public view {
        assertTrue(QualyraOracle.sequencerUp(address(seq), GRACE));
    }

    function test_SequencerDown_IsNotEvaluable() public {
        seq.setStatus(1, vm.getBlockTimestamp()); // down now
        assertFalse(QualyraOracle.sequencerUp(address(seq), GRACE));
    }

    function test_SequencerWithinGrace_IsNotEvaluable() public {
        seq.setStatus(0, vm.getBlockTimestamp() - 1); // just recovered, still in grace window
        assertFalse(QualyraOracle.sequencerUp(address(seq), GRACE));
    }

    function test_SequencerZeroFeed_SkipsCheck() public view {
        assertTrue(QualyraOracle.sequencerUp(address(0), GRACE), "no feed configured -> check skipped");
    }

    function test_SequencerUnreadable_IsNotEvaluable() public {
        seq.setRevertOnRead(true);
        assertFalse(QualyraOracle.sequencerUp(address(seq), GRACE));
    }

    // ---------------------------------------------------------------------
    // evaluateUsdPrice — sequencer gate + price read
    // ---------------------------------------------------------------------

    function test_EvaluateUsdPrice_OkWhenAllHealthy() public view {
        (uint256 price18, bool ok) =
            QualyraOracle.evaluateUsdPrice(address(seq), GRACE, address(ethUsd), HEARTBEAT);
        assertTrue(ok);
        assertEq(price18, 2_000e18);
    }

    function test_EvaluateUsdPrice_SequencerDownBlocksFreshPrice() public {
        seq.setStatus(1, vm.getBlockTimestamp()); // down
        (uint256 price18, bool ok) =
            QualyraOracle.evaluateUsdPrice(address(seq), GRACE, address(ethUsd), HEARTBEAT);
        assertFalse(ok, "sequencer down must gate an otherwise-fresh price");
        assertEq(price18, 0);
    }

    // ---------------------------------------------------------------------
    // marketCapUsd18
    // ---------------------------------------------------------------------

    function test_MarketCapUsd18_HitsThreshold() public pure {
        // $100 price x 1,000 tokens = $100,000 == MC_THRESHOLD_USD
        uint256 mc = QualyraOracle.marketCapUsd18(100e18, 1_000e18);
        assertEq(mc, 100_000e18);
    }

    function test_MarketCapUsd18_FractionalPrice() public pure {
        // $0.05 price x 3,000,000 tokens = $150,000
        uint256 mc = QualyraOracle.marketCapUsd18(5e16, 3_000_000e18);
        assertEq(mc, 150_000e18);
    }
}

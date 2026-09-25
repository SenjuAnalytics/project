// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Minimal Chainlink AggregatorV3 interface. Used for BOTH USD price feeds and the
///         L2 sequencer uptime feed (same ABI).
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice Optional interface exposed by some Chainlink RWA / stock feeds (24/5 markets) that can pause
///         during market close or corporate actions. Feeds that do not implement it are ignored gracefully.
interface IPausableFeed {
    function oraclePaused() external view returns (bool);
}

/// @title QualyraOracle
/// @notice Fail-safe helpers to read Chainlink USD prices on an Arbitrum-Orbit L2 (Robinhood Chain).
/// @dev FOUNDATION MODULE (docs/CODE-IMPLEMENTATION-PLAN.md §10 step 1). It only READS feeds and does not
///      touch any fee / battle flow. Source of truth: docs/FEE-AND-BATTLE-SPEC.md §2.2, plan §5.
///
///      Core design rule — "never punish on stale data": every abnormal condition (unreadable feed, stale
///      round, non-positive answer, paused feed, sequencer down or in grace period) returns `ok == false`
///      (NOT-EVALUABLE) instead of reverting. The eligibility engine that will consume this MUST treat
///      `ok == false` as a no-op for that trade (do not evaluate MC, do not disqualify, do not start the
///      timer) so that trading is never blocked and tokens are never wrongly disqualified.
library QualyraOracle {
    /// @dev All prices are normalized to this many decimals to match MC_THRESHOLD_USD = 100_000e18.
    uint8 internal constant TARGET_DECIMALS = 18;

    /// @notice L2 sequencer uptime check (mandatory on Arbitrum Orbit — Robinhood Chain).
    /// @param sequencerFeed Chainlink sequencer uptime feed. address(0) disables the check (returns true)
    ///                      for networks/tests without a sequencer feed.
    /// @param gracePeriod Seconds to wait after the sequencer is back up before trusting prices again.
    /// @return up True only when the sequencer is up AND the grace period has fully elapsed.
    function sequencerUp(address sequencerFeed, uint256 gracePeriod) internal view returns (bool up) {
        if (sequencerFeed == address(0)) {
            return true; // no L2 sequencer feed configured for this network
        }
        try AggregatorV3Interface(sequencerFeed).latestRoundData() returns (
            uint80, int256 answer, uint256 startedAt, uint256, uint80
        ) {
            // answer: 0 = sequencer UP, 1 = sequencer DOWN.
            if (answer != 0) return false;
            if (startedAt == 0 || startedAt > block.timestamp) return false;
            // Still within the grace window right after recovery -> do not trust prices yet.
            if (block.timestamp - startedAt <= gracePeriod) return false;
            return true;
        } catch {
            return false; // unreadable sequencer feed -> not evaluable (fail-safe)
        }
    }

    /// @notice Read a Chainlink USD price and normalize it to 18 decimals with staleness + pause fail-safes.
    /// @param feed Price feed proxy (per-asset; configured off-contract, never hardcoded).
    /// @param heartbeat Max age in seconds for a fresh round. 0 (unconfigured) is treated as NOT-EVALUABLE.
    /// @return price18 USD price scaled to 18 decimals (0 when not evaluable).
    /// @return ok False when the price MUST NOT be used (stale, non-positive, paused, unreadable, unconfigured).
    function readUsdPrice(address feed, uint256 heartbeat) internal view returns (uint256 price18, bool ok) {
        if (feed == address(0)) return (0, false);

        // Optional pause flag on RWA / stock feeds. Feeds without it fall through the catch and are used.
        try IPausableFeed(feed).oraclePaused() returns (bool paused) {
            if (paused) return (0, false);
        } catch {
            // feed does not expose oraclePaused() -> nothing to do
        }

        uint8 dec;
        try AggregatorV3Interface(feed).decimals() returns (uint8 d) {
            dec = d;
        } catch {
            return (0, false);
        }
        if (dec > 36) return (0, false); // sanity guard against absurd decimals

        try AggregatorV3Interface(feed).latestRoundData() returns (
            uint80, int256 answer, uint256, uint256 updatedAt, uint80
        ) {
            if (answer <= 0) return (0, false);
            if (updatedAt == 0 || updatedAt > block.timestamp) return (0, false);
            // Staleness: an unconfigured heartbeat (0) is intentionally NOT-EVALUABLE.
            if (heartbeat == 0 || block.timestamp - updatedAt > heartbeat) return (0, false);

            uint256 raw = uint256(answer);
            if (dec == TARGET_DECIMALS) {
                price18 = raw;
            } else if (dec < TARGET_DECIMALS) {
                price18 = raw * (10 ** (TARGET_DECIMALS - dec));
            } else {
                price18 = raw / (10 ** (dec - TARGET_DECIMALS));
            }
            return (price18, price18 > 0);
        } catch {
            return (0, false);
        }
    }

    /// @notice Full evaluation: L2 sequencer gate THEN price read. NOT-EVALUABLE if either step fails.
    function evaluateUsdPrice(address sequencerFeed, uint256 gracePeriod, address feed, uint256 heartbeat)
        internal
        view
        returns (uint256 price18, bool ok)
    {
        if (!sequencerUp(sequencerFeed, gracePeriod)) return (0, false);
        return readUsdPrice(feed, heartbeat);
    }

    /// @notice Market cap in USD (18 decimals) = usdPrice(18) * circulatingSupply / 1e18.
    /// @param price18 USD price of one whole token, scaled to 18 decimals.
    /// @param circulatingSupply Token units in wei (18-decimals ERC20) = totalSupply - burned.
    /// @dev Uses Math.mulDiv for full-precision, overflow-safe multiplication.
    function marketCapUsd18(uint256 price18, uint256 circulatingSupply) internal pure returns (uint256) {
        return Math.mulDiv(price18, circulatingSupply, 1e18);
    }
}

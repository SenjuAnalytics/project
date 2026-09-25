// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

import {SystemTestBase} from "./SystemTestBase.sol";
import {QualyraCompetitionVault} from "../../src/QualyraCompetitionVault.sol";
import {QualyraBuybackBurner} from "../../src/QualyraBuybackBurner.sol";
import {QualyraLaunchRouter} from "../../src/QualyraLaunchRouter.sol";
import {QualyraLaunchToken} from "../../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../../src/QualyraBondingCurve.sol";
import {IQualyraFactory} from "../../src/interfaces/IQualyraFactory.sol";

import {MockERC20} from "../mocks/MockERC20.sol";
import {MockV3Aggregator} from "../mocks/MockV3Aggregator.sol";
import {MockSequencerFeed} from "../mocks/MockSequencerFeed.sol";

/// @dev Complete system with the real competition vault, buyback burner and launch router.
abstract contract CompetitionTestBase is SystemTestBase {
    /// @dev Monday 14 September 2026, 00:00 UTC.
    uint256 internal constant MONDAY = 1_789_344_000;

    QualyraCompetitionVault internal competition;
    QualyraBuybackBurner internal burner;
    QualyraLaunchRouter internal router;
    MockERC20 internal usdg;

    address internal operator = makeAddr("operator");
    address internal guardian = makeAddr("guardian");

    // --- Eligibility oracle (so `scheduleBattles`' MC gate is satisfiable in tests, spec §2.1) ---
    MockV3Aggregator internal ethUsd;
    MockV3Aggregator internal usdgUsd;
    MockSequencerFeed internal seq;
    uint256 internal constant ELIG_HEARTBEAT = 1 hours;
    uint256 internal constant ELIG_GRACE = 1 hours;
    /// @dev Deliberately high USD prices so the realistic curve/pool market cap of a launched token clears
    ///      the $100k threshold (and stays clear during live-battle swaps) without bespoke per-test math.
    int256 internal constant ELIG_ETH_USD = 1_000_000e8;
    int256 internal constant ELIG_USDG_USD = 1_000_000e8;
    /// @dev Synthetic per-token price fed to `onTradeClose` when forcing eligibility: 0.000001 of the pair asset,
    ///      as an 18-decimal number. With the high USD prices above it clears the threshold for any pair asset.
    uint256 internal constant ELIG_PRICE = 1e12;

    function _deploySystem() internal {
        vm.warp(MONDAY);
        _deployCore();
        competition = new QualyraCompetitionVault(address(factory), operator, guardian);
        burner = new QualyraBuybackBurner(manager, IQualyraFactory(address(factory)));
        router = new QualyraLaunchRouter(IQualyraFactory(address(factory)));
        _initialize(address(competition), address(burner), address(router));
        _configureEligibilityOracle();
    }

    /// @dev Registers a live sequencer feed and an ETH/USD price feed so tokens can be made eligible.
    function _configureEligibilityOracle() internal {
        seq = new MockSequencerFeed(0, vm.getBlockTimestamp() - 10 * ELIG_GRACE);
        factory.setSequencerFeed(address(seq), ELIG_GRACE);
        ethUsd = new MockV3Aggregator(8, ELIG_ETH_USD);
        factory.setPriceFeed(address(0), address(ethUsd), ELIG_HEARTBEAT);
    }

    /// @dev Re-stamps every configured feed fresh at the current block time (used after time warps).
    function _refreshEligibilityFeeds() internal {
        if (address(ethUsd) != address(0)) ethUsd.setAnswer(ELIG_ETH_USD);
        if (address(usdgUsd) != address(0)) usdgUsd.setAnswer(ELIG_USDG_USD);
    }

    /// @dev Drives `token` to the eligible state exactly as production would: a first qualifying CLOSE starts
    ///      the 24h timer, then after the window elapses a second qualifying CLOSE latches `eligible`. Advances
    ///      block time by ELIGIBILITY_WINDOW, so callers must compute battle start times AFTER calling this.
    function _makeEligible(address token) internal {
        address asset = factory.getLaunch(token).quoteAsset;
        address src = factory.hook(); // an authorised trade source for onTradeClose
        _refreshEligibilityFeeds();
        vm.prank(src);
        competition.onTradeClose(token, ELIG_PRICE, asset);
        skip(competition.ELIGIBILITY_WINDOW());
        _refreshEligibilityFeeds();
        vm.prank(src);
        competition.onTradeClose(token, ELIG_PRICE, asset);
        require(_isEligible(token), "test helper: token not eligible");
    }

    function _isEligible(address token) internal view returns (bool eligible) {
        (, eligible,,) = competition.eligibilityOf(token);
    }

    /// @dev Lists a mock USDG deployed at `at`, so tests can pick which side of the pool it lands on.
    function _enableUsdg(address at) internal {
        deployCodeTo("MockERC20.sol:MockERC20", abi.encode("Global Dollar", "USDG", uint8(6)), at);
        usdg = MockERC20(at);
        factory.setQuoteAsset(at, USDG_PHANTOM, USDG_THRESHOLD, 6);
        // A USDG/USD feed so USDG-paired tokens can also be made eligible for battles.
        usdgUsd = new MockV3Aggregator(8, ELIG_USDG_USD);
        factory.setPriceFeed(at, address(usdgUsd), ELIG_HEARTBEAT);
    }

    function _graduatedUsdgLaunch() internal returns (QualyraLaunchToken token, PoolKey memory key) {
        QualyraBondingCurve curve;
        (token, curve) = _launch(address(usdg), 0);
        skip(10);
        usdg.mint(alice, 20_000e6);
        vm.startPrank(alice);
        usdg.approve(address(curve), 20_000e6);
        curve.buy(20_000e6, 0, alice, vm.getBlockTimestamp());
        vm.stopPrank();
        key = hook.poolKeyOf(address(token));
    }

    function _scheduleBattle(address tokenA, address tokenB, uint256 startTime) internal returns (uint256) {
        address[] memory tokensA = new address[](1);
        address[] memory tokensB = new address[](1);
        tokensA[0] = tokenA;
        tokensB[0] = tokenB;
        vm.prank(operator);
        return competition.scheduleBattles(tokensA, tokensB, startTime);
    }

    function _proposeBattle(uint256 battleId, QualyraCompetitionVault.Outcome outcome, uint256 scoreA, uint256 scoreB)
        internal
    {
        vm.prank(operator);
        competition.proposeBattleResult(
            battleId, outcome, scoreA, scoreB, keccak256(abi.encodePacked("dataset")), keccak256(abi.encodePacked("result"))
        );
    }

    /// @dev What the burner was funded with for `token` in `battleId`, tranches already spent included.
    function _funded(uint256 battleId, address token) internal view returns (uint256 total) {
        (, total,) = burner.buybacks(battleId, token);
    }

    /// @dev Runs a battle between two fresh ETH tokens with `buyAmount` bought on each side while it is live,
    ///      then settles it with `outcome`.
    function _settledBattle(QualyraCompetitionVault.Outcome outcome, uint256 buyAmount)
        internal
        returns (uint256 battleId, QualyraLaunchToken tokenA, QualyraLaunchToken tokenB)
    {
        PoolKey memory keyA;
        PoolKey memory keyB;
        (tokenA,, keyA) = _graduatedEthLaunch(0);
        (tokenB,, keyB) = _graduatedEthLaunch(0);

        // Spec §2.1: only eligible tokens may battle. Establish eligibility BEFORE computing the start time
        // (this advances block time by the 24h window per token).
        _makeEligible(address(tokenA));
        _makeEligible(address(tokenB));

        uint256 start = _nextMidnight();
        battleId = _scheduleBattle(address(tokenA), address(tokenB), start);
        vm.warp(start);
        _swap(keyA, bob, true, -SafeCast.toInt256(buyAmount), buyAmount);
        _swap(keyB, bob, true, -SafeCast.toInt256(buyAmount), buyAmount);

        vm.warp(start + competition.BATTLE_DURATION());
        uint256 scoreA = 0.6e18;
        uint256 scoreB = 0.4e18;
        if (outcome == QualyraCompetitionVault.Outcome.WinnerB) {
            (scoreA, scoreB) = (0.4e18, 0.6e18);
        } else if (outcome == QualyraCompetitionVault.Outcome.Draw) {
            (scoreA, scoreB) = (0.5e18, 0.5e18);
        }
        _proposeBattle(battleId, outcome, scoreA, scoreB);
        skip(competition.BATTLE_CHALLENGE_PERIOD());
        competition.finalizeBattle(battleId);
    }

    /// @dev Credits the Trader League as the fee vault would.
    function _depositLeague(address asset, uint256 amount) internal {
        if (asset == address(0)) {
            vm.deal(address(feeVault), address(feeVault).balance + amount);
            vm.prank(address(feeVault));
            competition.depositLeagueFees{value: amount}(asset, amount);
        } else {
            MockERC20(asset).mint(address(competition), amount);
            vm.prank(address(feeVault));
            competition.depositLeagueFees(asset, amount);
        }
    }
}

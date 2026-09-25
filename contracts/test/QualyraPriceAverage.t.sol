// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";

import {CompetitionTestBase} from "./utils/CompetitionTestBase.sol";
import {QualyraLaunchToken} from "../src/QualyraLaunchToken.sol";
import {QualyraBondingCurve} from "../src/QualyraBondingCurve.sol";
import {QualyraCompetitionVault} from "../src/QualyraCompetitionVault.sol";

/// @notice The hook's time-weighted pool price and the eligibility rules that run on it.
contract QualyraPriceAverageTest is CompetitionTestBase {
    using PoolIdLibrary for PoolKey;

    QualyraLaunchToken internal token;
    PoolKey internal key;
    uint256 internal createdAt;

    function setUp() public {
        _deploySystem();
        (token,, key) = _graduatedEthLaunch(0);
        createdAt = vm.getBlockTimestamp();
    }

    /// @dev Start of the first window in which the pool's average is ready.
    function _readyAt() internal view returns (uint256) {
        uint256 window = hook.TWAP_WINDOW();
        return (createdAt / window + 2) * window;
    }

    function _average() internal view returns (uint256 price) {
        bool ready;
        (price, ready,) = hook.twapOf(address(token));
        assertTrue(ready, "average not ready");
    }

    function _spotPrice() internal view returns (uint256) {
        return _spotPriceOf(key);
    }

    /// @dev Spot pool price in wei per whole token. ETH is always currency0, so the pool's price is inverted.
    function _spotPriceOf(PoolKey memory poolKey) internal view returns (uint256) {
        (uint160 sqrtPriceX96,,,) = StateLibrary.getSlot0(manager, poolKey.toId());
        return Math.mulDiv(Math.mulDiv(1e18, FixedPoint96.Q96, sqrtPriceX96), FixedPoint96.Q96, sqrtPriceX96);
    }

    function _marketCap(uint256 price, int256 ethUsdAnswer) internal view returns (uint256) {
        uint256 tokenUsd = Math.mulDiv(price, uint256(ethUsdAnswer) * 1e10, 1e18);
        return Math.mulDiv(tokenUsd, token.totalSupply(), 1e18);
    }

    function _isDisqualified() internal view returns (bool disqualified) {
        (,, disqualified,) = competition.eligibilityOf(address(token));
    }

    function test_average_isReadyAfterAFullWindow_andStartsAtThePoolPrice() public {
        vm.warp(_readyAt() - 1);
        (, bool ready,) = hook.twapOf(address(token));
        assertFalse(ready);

        vm.warp(_readyAt());
        assertEq(_average(), _spotPrice(), "nothing traded yet, so the average is the starting price");
    }

    function test_average_isInTheUnitTheVaultExpects() public {
        vm.warp(_readyAt());
        uint256 average = _average();

        // A tiny buy trades at the pool price plus the 1% fee.
        BalanceDelta delta = _swap(key, bob, true, -0.001 ether, 0.001 ether);
        uint256 paid = uint256(-int256(delta.amount0()));
        uint256 received = uint256(int256(delta.amount1()));
        assertApproxEqRel(Math.mulDiv(paid, 1e18, received), average, 0.02e18);
    }

    function test_average_weighsEachPriceByHowLongItHeld() public {
        uint256 window = hook.TWAP_WINDOW();
        uint256 start = _readyAt();
        vm.warp(start + 10 minutes);
        uint256 before = _spotPrice();
        _swap(key, bob, true, -2 ether, 2 ether);
        uint256 afterBuy = _spotPrice();
        assertGt(afterBuy, before);

        // One window later: the previous window held `before` for 10 minutes and `afterBuy` for the rest, and the
        // current window has held `afterBuy` for 10 minutes so far.
        vm.warp(start + window + 10 minutes);
        uint256 expected = (before * 10 minutes + afterBuy * window) / (window + 10 minutes);
        assertEq(_average(), expected);

        // With no trade for several windows, the last price is all that is left.
        vm.warp(start + 5 * window + 1 minutes);
        assertEq(_average(), afterBuy);
    }

    function test_aPriceMovedAndRestoredInOneBlock_leavesTheAverageAlone() public {
        vm.warp(_readyAt() + 10 minutes);
        uint256 before = _average();
        uint256 spotBefore = _spotPrice();

        uint256 dumped = token.balanceOf(alice) / 2;
        _approveRouter(alice, address(token));
        _swap(key, alice, false, -int256(dumped), 0);
        assertLt(_spotPrice(), spotBefore / 2, "the dump halved the pool price at least");
        _swap(key, alice, true, int256(dumped), 100 ether);
        assertEq(_average(), before, "same block: nothing has been folded in yet");

        skip(20 minutes);
        assertApproxEqRel(_average(), before, 1e12, "only the price the block closed at carried forward");
    }

    function test_oneDump_isNotEnough_butAHeldDropDisqualifies() public {
        _makeEligible(address(token)); // queued and eligible; the average has long been ready
        uint256 average = _average();

        // Price ETH so the average puts the token at a $150k market cap.
        int256 answer = int256(Math.mulDiv(150_000e18, 1e26, average * token.totalSupply()));
        ethUsd.setAnswer(answer);

        // Alice dumps half her bag. The pool price now puts the token far below $100k, but the swap reports the
        // average from before it, which still clears the threshold.
        uint256 dumped = token.balanceOf(alice) / 2;
        _approveRouter(alice, address(token));
        _swap(key, alice, false, -int256(dumped), 0);
        uint256 dumpedAt = vm.getBlockTimestamp();
        assertLt(_marketCap(_spotPrice(), answer), 70_000e18);
        assertEq(competition.belowThresholdSince(address(token)), 0);

        // Small trades keep reporting while the low price holds. The average follows it down, and 30 minutes after
        // it crosses the threshold the token is out.
        uint48 below;
        for (uint256 i; i < 36 && !_isDisqualified(); ++i) {
            skip(5 minutes);
            ethUsd.setAnswer(answer);
            _swap(key, bob, true, -0.001 ether, 0.001 ether);
            if (below == 0) below = competition.belowThresholdSince(address(token));
        }

        assertTrue(_isDisqualified(), "a drop that holds disqualifies the token");
        assertGt(below, dumpedAt, "the average took time to follow the price down");
        (,,, uint48 disqualifiedAt) = competition.eligibilityOf(address(token));
        assertEq(disqualifiedAt, below, "dated from when the average went below");
        assertGe(vm.getBlockTimestamp(), uint256(below) + competition.DQ_DWELL());
    }

    function test_buybackSwaps_moveTheAverage_butDontReport() public {
        (uint256 battleId, QualyraLaunchToken winner,) = _settledBattle(QualyraCompetitionVault.Outcome.WinnerA, 1 ether);
        PoolKey memory winnerKey = hook.poolKeyOf(address(winner));
        skip(burner.TRANCHE_INTERVAL()); // the first tranche ran at finalize
        uint256 before = _spotPriceOf(winnerKey);

        vm.expectCall(address(competition), abi.encodeWithSelector(competition.onTradeClose.selector), 0);
        burner.executeBuyback(battleId, address(winner));
        uint256 afterBuyback = _spotPriceOf(winnerKey);
        assertGt(afterBuyback, before);

        // With no other swap, two windows later the average is the price the buyback left.
        skip(2 * hook.TWAP_WINDOW());
        (uint256 average,,) = hook.twapOf(address(winner));
        assertEq(average, afterBuyback);
    }

    function test_aTokenGraduatingRightBeforeItsExpiry_getsTheWarmUpToStartItsTimer() public {
        (QualyraLaunchToken late, QualyraBondingCurve curve) = _launch(address(0), 0);
        skip(competition.PENDING_EXPIRY() - 10 minutes);
        vm.prank(alice);
        curve.buy{value: 10 ether}(10 ether, 0, alice, vm.getBlockTimestamp()); // graduates
        uint256 graduatedAt = vm.getBlockTimestamp();
        PoolKey memory lateKey = hook.poolKeyOf(address(late));

        skip(20 minutes);
        assertFalse(competition.isPendingExpired(address(late)), "past 30 days, but its pool can't report yet");

        uint256 window = hook.TWAP_WINDOW();
        vm.warp((graduatedAt / window + 2) * window);
        assertTrue(competition.isPendingExpired(address(late)), "the average is ready and no trade started the timer");

        _refreshEligibilityFeeds();
        _swap(lateKey, bob, true, -0.1 ether, 0.1 ether);
        (uint48 firstCloseAt,,,) = competition.eligibilityOf(address(late));
        assertEq(firstCloseAt, uint48(vm.getBlockTimestamp()));
        assertFalse(competition.isPendingExpired(address(late)));
    }

    /// @dev USDG pays 6 decimals, so a trade's price is scaled by 1e12 to compare it with the 18-decimal average.
    function _usdgPairPricing(address usdgAt, bool usdgIsCurrency0) internal {
        _enableUsdg(usdgAt);
        (QualyraLaunchToken usdgToken, PoolKey memory usdgKey) = _graduatedUsdgLaunch();
        assertEq(Currency.unwrap(usdgIsCurrency0 ? usdgKey.currency0 : usdgKey.currency1), address(usdg));

        uint256 window = hook.TWAP_WINDOW();
        vm.warp((vm.getBlockTimestamp() / window + 2) * window);
        (uint256 average, bool ready,) = hook.twapOf(address(usdgToken));
        assertTrue(ready);
        // Around $50k of market cap on a billion tokens: a few dozen of USDG's smallest units per token, which the
        // 18-decimal price carries with every digit.
        assertGt(average, 1e12);

        // A small buy (USDG in, token out) trades at the pool price plus the 1% fee.
        usdg.mint(bob, 10e6);
        _approveRouter(bob, address(usdg));
        BalanceDelta delta = _swap(usdgKey, bob, usdgIsCurrency0, -10e6, 0);
        int128 usdgDelta = usdgIsCurrency0 ? delta.amount0() : delta.amount1();
        int128 tokenDelta = usdgIsCurrency0 ? delta.amount1() : delta.amount0();
        uint256 paid = uint256(-int256(usdgDelta));
        uint256 received = uint256(int256(tokenDelta));
        assertApproxEqRel(Math.mulDiv(paid * 1e12, 1e18, received), average, 0.02e18);
    }

    function test_usdgPair_usdgAsCurrency1_isPricedInWholeUnits() public {
        _usdgPairPricing(0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF, false); // USDG sorts after the token
    }

    function test_usdgPair_usdgAsCurrency0_isPricedInWholeUnits() public {
        _usdgPairPricing(address(0x1000), true); // USDG sorts before the token
    }

    function test_poke_startsTheTimerWithoutATrade() public {
        vm.warp(_readyAt());
        _refreshEligibilityFeeds();
        (uint48 before,,,) = competition.eligibilityOf(address(token));
        assertEq(before, 0);

        vm.prank(makeAddr("anyone"));
        competition.pokeEligibility(address(token));
        (uint48 firstCloseAt,,,) = competition.eligibilityOf(address(token));
        assertEq(firstCloseAt, uint48(vm.getBlockTimestamp()));
    }

    function test_poke_isANoOpUntilTheAverageIsReady() public {
        _refreshEligibilityFeeds();
        competition.pokeEligibility(address(token));
        competition.pokeEligibility(makeAddr("not a token"));
        (uint48 firstCloseAt,,,) = competition.eligibilityOf(address(token));
        assertEq(firstCloseAt, 0);
    }

    /// @notice Nobody trades, but ETH falls and takes the token's dollar market cap under $100k. Only pokes see it.
    function test_poke_catchesADropNobodyTradedThrough() public {
        _makeEligible(address(token));
        uint256 average = _average();
        int256 at150k = int256(Math.mulDiv(150_000e18, 1e26, average * token.totalSupply()));
        int256 at90k = int256(Math.mulDiv(90_000e18, 1e26, average * token.totalSupply()));
        ethUsd.setAnswer(at150k);
        competition.pokeEligibility(address(token));
        assertEq(competition.belowThresholdSince(address(token)), 0);

        ethUsd.setAnswer(at90k);
        competition.pokeEligibility(address(token));
        uint48 droppedAt = uint48(vm.getBlockTimestamp());
        assertEq(competition.belowThresholdSince(address(token)), droppedAt);

        skip(competition.DQ_DWELL());
        ethUsd.setAnswer(at90k);
        competition.pokeEligibility(address(token));
        (,, bool disqualified, uint48 disqualifiedAt) = competition.eligibilityOf(address(token));
        assertTrue(disqualified);
        assertEq(disqualifiedAt, droppedAt);
    }
}

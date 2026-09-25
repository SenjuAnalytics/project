// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraHook} from "./interfaces/IQualyraHook.sol";
import {IQualyraBuybackBurner} from "./interfaces/IQualyraBuybackBurner.sol";
import {IQualyraFeeVault} from "./interfaces/IQualyraFeeVault.sol";
import {QualyraOracle} from "./libraries/QualyraOracle.sol";
import {QualyraFees} from "./libraries/QualyraFees.sol";

/// @title QualyraCompetitionVault
/// @notice Holds the competition share of Qualyra fees and settles both competitions.
///
///         Token League: graduated tokens with the same pair asset meet in 24 hour battles. While a battle runs,
///         the competition share of both tokens' fees builds its pot, and the pot is later spent on buying back
///         and burning the winner.
///
///         Trader League: a single weekly leaderboard covering every token launched on Qualyra. The top five
///         wallets receive 40%, 30%, 15%, 10% and 5% of each asset in that week's pool.
///
///         Scores and rankings are computed off-chain. The operator publishes them here, the guardian can veto
///         them during a challenge period, and only then can funds move.
/// @dev Deposits from the fee vault sit on the trading path of every curve and pool, so they are accepted even
///      while the vault is paused. Pausing stops schedules, results, payouts and claims.
contract QualyraCompetitionVault is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Outcome {
        None,
        WinnerA,
        WinnerB,
        Draw,
        DisqualifiedA,
        DisqualifiedB,
        Void
    }

    struct Battle {
        address tokenA;
        uint48 startTime;
        address tokenB;
        uint48 proposedAt;
        Outcome outcome;
        bool finalized;
        address asset;
        uint256 pot;
        /// @notice On-chain commitment to the exact off-chain dataset and result used for this battle.
        bytes32 datasetHash;
        bytes32 resultHash;
    }

    /// @dev The one battle a token is booked into. A token battles once in its lifetime, so there is never a second.
    struct Schedule {
        uint64 battleId;
        uint48 startTime;
    }

    struct WeekResult {
        address[5] winners;
        uint48 proposedAt;
        uint48 finalizedAt;
        bool closed;
        /// @notice On-chain commitment to the exact off-chain dataset and result used for this week.
        bytes32 datasetHash;
        bytes32 resultHash;
    }

    /// @notice Battle-eligibility bookkeeping for a token (spec §2.1 / plan §4). This is CLOSE-BASED state:
    ///         it is only advanced by `onTradeClose`, which the curve/hook call after a trade has settled, so
    ///         an intraday price spike can never start the timer or flip eligibility on its own.
    /// @dev `firstCloseAt` is the timestamp of the first settled close whose market cap reached the threshold.
    ///      `eligible` latches true once the 24h window has elapsed while still at/above threshold. `disqualified`
    ///      is permanent: once set, the token can never become eligible again.
    struct Eligibility {
        uint48 firstCloseAt;
        bool eligible;
        bool disqualified;
        uint48 disqualifiedAt;
    }

    uint256 public constant BATTLE_DURATION = 24 hours;
    uint256 public constant MAX_SCHEDULE_LEAD = 7 days;
    uint256 public constant BATTLE_CHALLENGE_PERIOD = 24 hours;
    uint256 public constant LEAGUE_CHALLENGE_PERIOD = 48 hours;
    uint256 public constant CLAIM_WINDOW = 60 days;
    uint256 public constant BOOTSTRAP_WEEKS = 4;
    uint256 public constant WEEK = 7 days;

    /// @notice Battle scores are expressed as a share of SCORE_SCALE. A lead below DRAW_MARGIN, one percentage
    ///         point, is a draw.
    uint256 public constant SCORE_SCALE = 1e18;
    uint256 public constant DRAW_MARGIN = 1e16;

    /// @notice Market-cap threshold a token must reach (and hold for ELIGIBILITY_WINDOW) to enter the league,
    ///         normalized to 18 decimals to match QualyraOracle's price scaling. $100,000.
    uint256 public constant MC_THRESHOLD_USD = 100_000e18;
    /// @notice Time a token must stay at/above MC_THRESHOLD_USD (across settled closes) before it is eligible.
    uint256 public constant ELIGIBILITY_WINDOW = 24 hours;
    /// @notice How long after launch a token may go without starting its eligibility timer. Past that, its pending
    ///         battle pot is released to the treasury and new battle shares go there too, until the timer starts.
    uint256 public constant PENDING_EXPIRY = QualyraFees.PENDING_EXPIRY;

    /// @dev Unix time 0 fell on a Thursday. Shifting by three days puts every week boundary on Monday 00:00 UTC.
    uint256 private constant WEEK_SHIFT = 3 days;
    uint256 private constant BPS = 10_000;

    IQualyraFactory public immutable factory;
    address public operator;
    address public guardian;
    /// @notice Replacement contract chosen during an emergency migration. Set at most once.
    address public successor;

    uint256 public battleCount;
    mapping(uint256 battleId => Battle) private _battles;
    mapping(address token => Schedule) private _schedules;

    /// @notice First week that pays prizes, or zero before the league has started.
    uint256 public firstLeagueWeek;
    /// @notice League funds collected before the league started.
    mapping(address asset => uint256) public bootstrapPool;
    mapping(uint256 week => mapping(address asset => uint256)) public weekPool;
    mapping(uint256 week => WeekResult) private _weekResults;
    mapping(uint256 week => mapping(address asset => mapping(uint256 rank => bool))) public prizeClaimed;

    /// @notice Balance per asset owed to pots, pools and prizes.
    mapping(address asset => uint256) public accounted;
    /// @notice Battle share of fees a token earned before its battle was scheduled. It seeds that battle's pot.
    ///         A token disqualified before battling, or past PENDING_EXPIRY without a timer, releases it to the
    ///         treasury instead.
    mapping(address token => mapping(address asset => uint256)) public pendingBattlePot;
    address[] private _assets;
    mapping(address asset => bool) private _isKnownAsset;

    /// @notice Close-based eligibility state per token (spec §2.1 / plan §4). Advanced only by `onTradeClose`.
    mapping(address token => Eligibility) public eligibilityOf;

    /// @notice Whether a token has used its one lifetime battle (spec §2.1). Latched `true` when the battle is
    ///         scheduled, so a token can never be booked twice; only a guardian cancel before the start gives it
    ///         back. Fee routing reads it as Phase 3 for every fee not tagged to that battle, which after the
    ///         schedule means fees earned once the battle is over.
    mapping(address token => bool) public hasBattled;

    /// @notice Each token's cumulative contribution to a battle's pot: the pending pot seeded at scheduling plus
    ///         every fee tagged to that battle (spec §2.2 / plan §2.2). Used to refund per-contribution
    ///         on a Draw or a Void — each token gets its own contribution back (buyback&burn), never a 50/50 split
    ///         nor the Trader League. Invariant: `contributionOf[b][tokenA] + contributionOf[b][tokenB] == pot`.
    mapping(uint256 battleId => mapping(address token => uint256)) public contributionOf;

    event BattleScheduled(
        uint256 indexed battleId,
        address indexed tokenA,
        address indexed tokenB,
        address asset,
        uint256 startTime,
        uint256 endTime
    );
    event BattleCanceled(uint256 indexed battleId);
    event BattlePotIncreased(uint256 indexed battleId, address indexed token, uint256 amount);
    event PendingBattlePotIncreased(address indexed token, address indexed asset, uint256 amount);
    event BattlePotSeeded(uint256 indexed battleId, address indexed token, address indexed asset, uint256 amount);
    event BattleResultProposed(
        uint256 indexed battleId, Outcome outcome, uint256 scoreA, uint256 scoreB, bytes32 datasetHash, bytes32 resultHash
    );
    event BattleResultVetoed(uint256 indexed battleId);
    event BattleFinalized(uint256 indexed battleId, Outcome outcome, uint256 pot);
    event LeagueFunded(uint256 indexed week, address indexed asset, uint256 amount);
    event LeagueStarted(uint256 firstWeek);
    event WeeklyWinnersProposed(uint256 indexed week, address[5] winners, bytes32 datasetHash, bytes32 resultHash);
    event WeeklyWinnersVetoed(uint256 indexed week);
    event WeekFinalized(uint256 indexed week);
    event PrizeClaimed(uint256 indexed week, uint256 indexed rank, address indexed winner, address asset, uint256 amount);
    event UnclaimedRolledOver(uint256 indexed week, uint256 indexed toWeek, address indexed asset, uint256 amount);
    event OperatorSet(address indexed operator);
    event GuardianSet(address indexed guardian);
    event Migrated(address indexed successor);
    event SweptToSuccessor(address indexed asset, uint256 amount);
    event FeesReceived(address indexed asset, uint256 amount);
    /// @notice A token first closed at/above the market-cap threshold; the 24h eligibility window begins.
    event EligibilityTimerStarted(address indexed token, uint256 mcUsd, uint48 at);
    /// @notice A token held at/above threshold for the full window and is now league-eligible.
    event TokenEligible(address indexed token, uint48 at);
    /// @notice A token was permanently disqualified. `duringLiveBattle` distinguishes an in-battle DQ from a
    ///         pre-eligibility drop; `mcUsd` is the close market cap that triggered it.
    event TokenDisqualified(address indexed token, bool duringLiveBattle, uint256 mcUsd, uint48 at);
    /// @notice A token's pending battle pot went to the treasury: it was disqualified before battling (§4.1), or it
    ///         passed PENDING_EXPIRY without starting its eligibility timer.
    event PendingBattlePotDrained(address indexed token, address indexed asset, uint256 amount);

    error Unauthorized();
    error ZeroAddress();
    error InvalidValue();
    error FundsNotReceived();
    error InvalidInput();
    error InvalidStartTime();
    error InvalidPair();
    error UnknownBattle();
    error BattleStarted();
    error BattleNotOver();
    error InvalidResult();
    error MissingCommitment();
    error ResultAlreadyProposed();
    error NoPendingResult();
    error ChallengePeriodActive();
    error ChallengePeriodOver();
    error LeagueAlreadyStarted();
    error WeekNotInLeague();
    error WeekNotOver();
    error InvalidWinners();
    error InvalidRank();
    error ClaimsClosed();
    error ClaimWindowOpen();
    error NothingToClaim();
    error AlreadyMigrated();
    error NotMigrated();
    error InvalidSuccessor();
    error NothingToSweep();
    /// @notice `onTradeClose` was called by an address that is neither the token's curve nor the hook.
    error NotTradeSource();
    /// @notice A token proposed for a battle has already used its one lifetime battle (spec §2.1).
    error AlreadyBattled(address token);
    /// @notice A token proposed for a battle is not (or no longer) eligible: MC never held ≥ $100k for 24h,
    ///         or it was disqualified (spec §2.1).
    error NotEligible(address token);
    /// @notice `releaseExpiredPending` was called for a token that is not past PENDING_EXPIRY without a timer.
    error PendingNotExpired(address token);

    modifier onlyAdmin() {
        if (msg.sender != factory.owner()) revert Unauthorized();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert Unauthorized();
        _;
    }

    modifier onlyGuardian() {
        if (msg.sender != guardian) revert Unauthorized();
        _;
    }

    modifier notMigrated() {
        if (successor != address(0)) revert AlreadyMigrated();
        _;
    }

    constructor(address factory_, address operator_, address guardian_) {
        if (factory_ == address(0) || operator_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        factory = IQualyraFactory(factory_);
        operator = operator_;
        guardian = guardian_;
    }

    // ---------------------------------------------------------------------------------------------
    // Deposits from the fee vault
    // ---------------------------------------------------------------------------------------------

    /// @notice Adds the battle share of fees that `token` earned for `battleId` to that battle's pot.
    ///         Fees that arrive while no battle pot is open are held in `pendingBattlePot` for the token's battle.
    function depositBattleFees(uint256 battleId, address token, address asset, uint256 amount) external payable {
        _receive(asset, amount);

        if (isBattlePotOpen(battleId, token, asset)) {
            _battles[battleId].pot += amount;
            // Track this token's own contribution so a Draw/Void can refund it exactly (plan §2.2 / §6).
            contributionOf[battleId][token] += amount;
            emit BattlePotIncreased(battleId, token, amount);
        } else {
            pendingBattlePot[token][asset] += amount;
            emit PendingBattlePotIncreased(token, asset, amount);
        }
    }

    function depositLeagueFees(address asset, uint256 amount) external payable {
        _receive(asset, amount);
        _addToLeague(asset, amount);
    }

    /// @notice Sends the pending battle pot of a token past PENDING_EXPIRY without an eligibility timer to the
    ///         treasury. The fee vault does this on the token's next fee; anyone can call it for a token that no
    ///         longer trades.
    /// @dev Not `whenNotPaused`: the fee vault calls it on the trading path, which keeps working while paused.
    function releaseExpiredPending(address token, address asset) external notMigrated {
        if (!isPendingExpired(token)) revert PendingNotExpired(token);
        _drainPendingToTreasury(token, asset);
    }

    // ---------------------------------------------------------------------------------------------
    // Eligibility engine (spec §2.1 / plan §4).
    // ---------------------------------------------------------------------------------------------

    /// @notice Close hook the bonding curve / pool hook call once a trade has settled. It advances the token's
    ///         eligibility state machine based on its market cap at the settled price. This step is CLOSE-BASED:
    ///         because it is only ever invoked post-trade (settled state), an intraday spike inside a single
    ///         transaction cannot start the timer or flip eligibility.
    /// @dev Fail-safe and non-reverting by design (spec §2.2 / §5 point 8): any oracle problem (sequencer down,
    ///      stale/paused/unconfigured feed) makes this a no-op, so trading is never blocked and tokens are never
    ///      wrongly disqualified. The only funds it moves are on a pre-battle disqualification, when the token's
    ///      pending battle pot goes to the treasury (spec §4.1).
    ///
    ///      Not `whenNotPaused`: like deposits, this sits on the trading path and must keep working while the
    ///      vault is paused. It is also intentionally not `nonReentrant`: it only writes eligibility storage and
    ///      performs staticcall reads through the oracle's try/catch, so there is no external-call reentrancy to
    ///      guard against and the trading path stays lightweight.
    /// @param token The launch token that just traded.
    /// @param tokenPriceInAsset Settled price of one whole token, in the pair asset's own decimals (curve
    ///        `spotPrice()` convention).
    /// @param asset The pair asset (address(0) for native ETH).
    function onTradeClose(address token, uint256 tokenPriceInAsset, address asset) external {
        if (msg.sender != factory.curveOf(token) && msg.sender != factory.hook()) revert NotTradeSource();

        Eligibility storage e = eligibilityOf[token];
        // 1. Disqualification is permanent.
        if (e.disqualified) return;

        // 2. Evaluate market cap. Any oracle problem is NOT-EVALUABLE -> no-op (no timer, no DQ, never revert).
        // Fail-safe: not evaluable -> no timer, no DQ, never revert (spec §5 point 8).
        (uint256 mc, bool evaluable) = _marketCapUsd(token, tokenPriceInAsset, asset);
        if (!evaluable) return;

        bool live = activeBattleOf(token) != 0;
        uint48 nowTs = uint48(block.timestamp);

        // 3. While a battle is live, dropping below the threshold disqualifies the token. The battle keeps
        //    running and the finalize step decides the winner; no funds move here.
        if (live) {
            if (mc < MC_THRESHOLD_USD) {
                e.disqualified = true;
                e.disqualifiedAt = nowTs;
                emit TokenDisqualified(token, true, mc, nowTs);
            }
            return;
        }

        // 4. Not in a battle: run the timer / eligibility / pre-eligibility-DQ state machine.
        if (e.firstCloseAt == 0) {
            // Start the 24h timer on the first settled close that reaches the threshold.
            if (mc >= MC_THRESHOLD_USD) {
                e.firstCloseAt = nowTs;
                emit EligibilityTimerStarted(token, mc, nowTs);
            }
            return;
        }

        if (!e.eligible) {
            if (mc < MC_THRESHOLD_USD) {
                // Dropped below threshold before becoming eligible -> permanent disqualification (spec §4.1).
                e.disqualified = true;
                e.disqualifiedAt = nowTs;
                emit TokenDisqualified(token, false, mc, nowTs);
                // Drain the battle share this token accrued while never eligible straight to the treasury, so
                // funds are never stranded on a token that can now never battle (spec §4.1). Flags are already
                // set, and the curve/hook wrap this call in try/catch, so trading can never be blocked by it.
                _drainPendingToTreasury(token, asset);
                return;
            }
            if (block.timestamp >= uint256(e.firstCloseAt) + ELIGIBILITY_WINDOW) {
                e.eligible = true;
                emit TokenEligible(token, nowTs);
            }
        }
    }

    /// @notice Market cap of `token` in USD, normalized to 18 decimals, using the pair asset's Chainlink feed.
    /// @dev Returns `ok == false` (NOT-EVALUABLE) whenever the oracle cannot supply a trustworthy price; callers
    ///      must treat that as a no-op. Decimal math:
    ///        tokenUsdPrice18 = mulDiv(tokenPriceInAsset, assetUsdPrice18, 10**assetDecimals)
    ///        mcUsd           = marketCapUsd18(tokenUsdPrice18, totalSupply)
    ///      Worked example: ETH/USD $2000 (assetUsdPrice18 = 2000e18), asset = ETH (18 dec),
    ///      tokenPriceInAsset = 1e12, supply = 1e27 -> tokenUsdPrice18 = 2e15, mcUsd = 2e24 ($2,000,000).
    /// @param token The launch token (18-dec fixed-supply ERC20Burnable; circulating == totalSupply()).
    /// @param tokenPriceInAsset Price of one whole token in the pair asset's own decimals.
    /// @param asset The pair asset (address(0) for native ETH).
    function _marketCapUsd(address token, uint256 tokenPriceInAsset, address asset)
        internal
        view
        returns (uint256 mcUsd, bool ok)
    {
        address feed = factory.priceFeedOf(asset);
        (uint256 assetUsdPrice18, bool priceOk) = QualyraOracle.evaluateUsdPrice(
            factory.sequencerUptimeFeed(), factory.sequencerGracePeriod(), feed, factory.heartbeatOf(feed)
        );
        // USDG≈$1 fallback: TODO — only if the configured USDG asset can be identified cleanly from the Factory.
        // Until then, an unconfigured feed is NOT-EVALUABLE (never guess a stablecoin address).
        // Fail-safe: an unreadable/stale/paused/unconfigured feed makes market cap NOT-EVALUABLE. Guard the
        // happy path (evaluate only when the feed is usable) rather than early-returning on the negation.
        if (priceOk) {
            uint8 assetDecimals = factory.quoteAssetConfig(asset).decimals;
            uint256 tokenUsdPrice18 = Math.mulDiv(tokenPriceInAsset, assetUsdPrice18, 10 ** assetDecimals);
            uint256 supply = IERC20(token).totalSupply();
            mcUsd = QualyraOracle.marketCapUsd18(tokenUsdPrice18, supply);
            ok = priceOk; // reached only when priceOk is true, so this always sets ok true.
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Token League
    // ---------------------------------------------------------------------------------------------

    /// @notice Records one battle per pair, `tokensA[i]` against `tokensB[i]`, all starting at `startTime`, which
    ///         must be a coming 00:00 UTC within MAX_SCHEDULE_LEAD: every battle runs from midnight to midnight.
    ///         Both tokens must have graduated and share a pair asset. The schedule spends both tokens' one
    ///         lifetime battle; only the guardian can call it off, and only before it starts.
    function scheduleBattles(address[] calldata tokensA, address[] calldata tokensB, uint256 startTime)
        external
        onlyOperator
        whenNotPaused
        notMigrated
        returns (uint256 firstBattleId)
    {
        uint256 count = tokensA.length;
        if (count == 0 || count != tokensB.length) revert InvalidInput();
        if (
            startTime <= block.timestamp || startTime > block.timestamp + MAX_SCHEDULE_LEAD
                || startTime % 1 days != 0
        ) revert InvalidStartTime();

        firstBattleId = battleCount + 1;
        for (uint256 i; i < count; ++i) {
            address tokenA = tokensA[i];
            address tokenB = tokensB[i];
            if (tokenA == tokenB || !factory.isGraduated(tokenA) || !factory.isGraduated(tokenB)) revert InvalidPair();

            address asset = factory.getLaunch(tokenA).quoteAsset;
            if (factory.getLaunch(tokenB).quoteAsset != asset) revert InvalidPair();

            // Spec §2.1: both tokens must be currently eligible (MC held ≥ $100k for 24h, not disqualified)
            // and neither may have used its one lifetime battle.
            _requireBattleReady(tokenA);
            _requireBattleReady(tokenB);

            uint256 battleId = ++battleCount;
            _reserve(tokenA, battleId, startTime);
            _reserve(tokenB, battleId, startTime);

            Battle storage battle = _battles[battleId];
            battle.tokenA = tokenA;
            battle.tokenB = tokenB;
            battle.asset = asset;
            battle.startTime = SafeCast.toUint48(startTime);

            // Seed the pot with everything both tokens earned for it so far and spend their one lifetime battle.
            // Done in a helper to keep scheduleBattles' stack shallow (avoids stack-too-deep without via-IR).
            _openPot(battleId, tokenA, asset);
            _openPot(battleId, tokenB, asset);

            emit BattleScheduled(battleId, tokenA, tokenB, asset, startTime, startTime + BATTLE_DURATION);
        }
    }

    /// @notice Publishes the result of a finished battle.
    /// @param scoreA Weighted share of qualified volume and unique buyers for token A, out of SCORE_SCALE.
    /// @param scoreB Same for token B.
    /// @dev Scores have to agree with a win or a draw. A disqualification this vault recorded during the battle
    ///      fixes the outcome instead, and without one no DQ outcome is accepted; the scores of DQ and void
    ///      results are only recorded.
    /// @param datasetHash Commitment to the exact off-chain dataset used to compute the scores.
    /// @param resultHash Commitment to the exact off-chain result. Both must be non-zero so the result is
    ///        publicly verifiable: anyone can recompute and compare hashes before funds move.
    function proposeBattleResult(
        uint256 battleId,
        Outcome outcome,
        uint256 scoreA,
        uint256 scoreB,
        bytes32 datasetHash,
        bytes32 resultHash
    ) external onlyOperator whenNotPaused notMigrated {
        Battle storage battle = _battles[battleId];
        if (battle.tokenA == address(0)) revert UnknownBattle();
        if (battle.outcome != Outcome.None) revert ResultAlreadyProposed();
        if (block.timestamp < uint256(battle.startTime) + BATTLE_DURATION) revert BattleNotOver();
        if (outcome == Outcome.None || scoreA > SCORE_SCALE || scoreB > SCORE_SCALE) revert InvalidResult();
        if (datasetHash == bytes32(0) || resultHash == bytes32(0)) revert MissingCommitment();

        if (outcome == Outcome.WinnerA) {
            if (scoreA < scoreB + DRAW_MARGIN) revert InvalidResult();
        } else if (outcome == Outcome.WinnerB) {
            if (scoreB < scoreA + DRAW_MARGIN) revert InvalidResult();
        } else if (outcome == Outcome.Draw) {
            if (scoreA >= scoreB + DRAW_MARGIN || scoreB >= scoreA + DRAW_MARGIN) revert InvalidResult();
        }

        // Spec §6: a token that closed below the threshold during the battle loses, the first of two to drop loses,
        // and two drops in the same second void the battle. Scores can't overturn that record, and a DQ outcome
        // needs one.
        Outcome dq = _disqualificationOutcome(battle.tokenA, battle.tokenB);
        bool dqClaimed = outcome == Outcome.DisqualifiedA || outcome == Outcome.DisqualifiedB;
        if (dq == Outcome.None ? dqClaimed : outcome != dq) revert InvalidResult();

        battle.outcome = outcome;
        battle.proposedAt = SafeCast.toUint48(block.timestamp);
        battle.datasetHash = datasetHash;
        battle.resultHash = resultHash;

        emit BattleResultProposed(battleId, outcome, scoreA, scoreB, datasetHash, resultHash);
    }

    function vetoBattleResult(uint256 battleId) external onlyGuardian {
        Battle storage battle = _battles[battleId];
        if (battle.outcome == Outcome.None || battle.finalized) revert NoPendingResult();
        if (block.timestamp >= uint256(battle.proposedAt) + BATTLE_CHALLENGE_PERIOD) revert ChallengePeriodOver();

        battle.outcome = Outcome.None;
        battle.proposedAt = 0;
        battle.datasetHash = bytes32(0);
        battle.resultHash = bytes32(0);

        emit BattleResultVetoed(battleId);
    }

    /// @notice Settles a battle after its challenge period. Anyone can call it.
    ///         It first sweeps what the hook still holds for the battle, so the pot never depends on when anyone
    ///         else swept. A win or a one-sided disqualification sends the whole pot to the buyback of the winner,
    ///         and the first buyback tranche runs in the same transaction.
    ///         A draw or a void refunds each token exactly its own contribution (buyback&burn of its own token);
    ///         when both tokens were disqualified at different times the operator settles it as the survivor's win
    ///         via DisqualifiedA/DisqualifiedB (spec §6).
    function finalizeBattle(uint256 battleId) external nonReentrant whenNotPaused notMigrated {
        Battle storage battle = _battles[battleId];
        Outcome outcome = battle.outcome;
        if (outcome == Outcome.None || battle.finalized) revert NoPendingResult();
        if (block.timestamp < uint256(battle.proposedAt) + BATTLE_CHALLENGE_PERIOD) revert ChallengePeriodActive();

        // Fees tagged to the battle (from its schedule to the end of the live window) may still be held by the
        // hook. Collecting them first completes the pot.
        IQualyraHook hook = IQualyraHook(factory.hook());
        hook.sweepFees(battle.tokenA, battleId);
        hook.sweepFees(battle.tokenB, battleId);

        battle.finalized = true;
        uint256 pot = battle.pot;
        address asset = battle.asset;

        if (outcome == Outcome.WinnerA || outcome == Outcome.DisqualifiedB) {
            // A wins — a scored win, or B disqualified (including "both gone, A survived" via DisqualifiedB):
            // the whole pot buys back and burns A.
            _fundBuyback(battleId, battle.tokenA, asset, pot);
        } else if (outcome == Outcome.WinnerB || outcome == Outcome.DisqualifiedA) {
            // B wins — a scored win, or A disqualified (including "both gone, B survived" via DisqualifiedA).
            _fundBuyback(battleId, battle.tokenB, asset, pot);
        } else {
            // Draw or Void (spec §5.4/§5.5): there is no winner, so each token is refunded exactly its own
            // contribution — buyback&burn of its own token (A->A, B->B). Never a 50/50 split, never the Trader
            // League. Every pot increment was mirrored into contributionOf, so the two contributions sum to the
            // pot; any rounding remainder is routed deterministically to tokenA so the whole pot is distributed.
            uint256 refundA = contributionOf[battleId][battle.tokenA];
            if (refundA > pot) refundA = pot;
            _fundBuyback(battleId, battle.tokenA, asset, refundA);
            _fundBuyback(battleId, battle.tokenB, asset, pot - refundA);
        }

        emit BattleFinalized(battleId, outcome, pot);
    }

    /// @notice Calls off a booked battle before it starts. Both tokens get their battle back and whatever the pot
    ///         holds returns to their pending pots, so they can be booked again with nothing lost. Guardian only;
    ///         meant for a schedule the operator got wrong.
    function cancelBattle(uint256 battleId) external onlyGuardian {
        Battle storage battle = _battles[battleId];
        if (battle.tokenA == address(0) || battle.finalized) revert UnknownBattle();
        if (block.timestamp >= battle.startTime) revert BattleStarted();

        // Fees tagged to the battle may still sit in the hook. Collect them into the pot before handing it back.
        IQualyraHook hook = IQualyraHook(factory.hook());
        hook.sweepFees(battle.tokenA, battleId);
        hook.sweepFees(battle.tokenB, battleId);

        battle.finalized = true;
        battle.outcome = Outcome.Void;
        battle.pot = 0;
        _returnBattle(battleId, battle.tokenA, battle.asset);
        _returnBattle(battleId, battle.tokenB, battle.asset);

        emit BattleCanceled(battleId);
    }

    // ---------------------------------------------------------------------------------------------
    // Trader League
    // ---------------------------------------------------------------------------------------------

    /// @notice Starts weekly payouts from next week. What was collected before this call is spread evenly
    ///         over the first BOOTSTRAP_WEEKS weeks.
    function startLeague() external onlyAdmin notMigrated {
        if (firstLeagueWeek != 0) revert LeagueAlreadyStarted();
        uint256 firstWeek = currentWeek() + 1;
        firstLeagueWeek = firstWeek;

        for (uint256 i; i < _assets.length; ++i) {
            address asset = _assets[i];
            uint256 amount = bootstrapPool[asset];
            if (amount == 0) continue;
            bootstrapPool[asset] = 0;

            uint256 perWeek = amount / BOOTSTRAP_WEEKS;
            for (uint256 w; w < BOOTSTRAP_WEEKS; ++w) {
                uint256 share = w == BOOTSTRAP_WEEKS - 1 ? amount - perWeek * w : perWeek;
                weekPool[firstWeek + w][asset] += share;
                emit LeagueFunded(firstWeek + w, asset, share);
            }
        }

        emit LeagueStarted(firstWeek);
    }

    /// @notice Publishes the top five wallets of a finished week, first place first. A place with no
    ///         qualifying wallet is left as address(0), and its share moves to the following week.
    /// @param datasetHash Commitment to the exact off-chain dataset used to rank the wallets.
    /// @param resultHash Commitment to the exact off-chain result. Both must be non-zero so the result is
    ///        publicly verifiable: anyone can recompute and compare hashes before prizes are paid.
    function proposeWeeklyWinners(uint256 week, address[5] calldata winners, bytes32 datasetHash, bytes32 resultHash)
        external
        onlyOperator
        whenNotPaused
        notMigrated
    {
        if (firstLeagueWeek == 0 || week < firstLeagueWeek) revert WeekNotInLeague();
        if (block.timestamp < weekEndsAt(week)) revert WeekNotOver();
        if (datasetHash == bytes32(0) || resultHash == bytes32(0)) revert MissingCommitment();

        WeekResult storage result = _weekResults[week];
        if (result.proposedAt != 0) revert ResultAlreadyProposed();

        bool emptyPlace;
        for (uint256 i; i < 5; ++i) {
            if (winners[i] == address(0)) {
                emptyPlace = true;
                continue;
            }
            if (emptyPlace) revert InvalidWinners();
            for (uint256 j; j < i; ++j) {
                if (winners[j] == winners[i]) revert InvalidWinners();
            }
        }

        result.winners = winners;
        result.proposedAt = SafeCast.toUint48(block.timestamp);
        result.datasetHash = datasetHash;
        result.resultHash = resultHash;

        emit WeeklyWinnersProposed(week, winners, datasetHash, resultHash);
    }

    function vetoWeeklyWinners(uint256 week) external onlyGuardian {
        WeekResult storage result = _weekResults[week];
        if (result.proposedAt == 0 || result.finalizedAt != 0) revert NoPendingResult();
        if (block.timestamp >= uint256(result.proposedAt) + LEAGUE_CHALLENGE_PERIOD) revert ChallengePeriodOver();

        delete result.winners;
        result.proposedAt = 0;
        result.datasetHash = bytes32(0);
        result.resultHash = bytes32(0);

        emit WeeklyWinnersVetoed(week);
    }

    /// @notice Opens claims for a week after its challenge period and moves the shares of empty places to the
    ///         week in progress. Anyone can call it.
    function finalizeWeek(uint256 week) external whenNotPaused notMigrated {
        WeekResult storage result = _weekResults[week];
        if (result.proposedAt == 0 || result.finalizedAt != 0) revert NoPendingResult();
        if (block.timestamp < uint256(result.proposedAt) + LEAGUE_CHALLENGE_PERIOD) revert ChallengePeriodActive();
        result.finalizedAt = SafeCast.toUint48(block.timestamp);

        address[5] memory winners = result.winners;
        // Results are only accepted once the week is over, so the week in progress is the one after it.
        uint256 nextWeek = currentWeek();

        for (uint256 i; i < _assets.length; ++i) {
            address asset = _assets[i];
            uint256 pool = weekPool[week][asset];
            if (pool == 0) continue;

            uint256 assigned;
            for (uint256 rank; rank < 5; ++rank) {
                if (winners[rank] != address(0)) assigned += _prize(pool, rank);
            }
            if (pool > assigned) {
                weekPool[nextWeek][asset] += pool - assigned;
                emit LeagueFunded(nextWeek, asset, pool - assigned);
            }
        }

        emit WeekFinalized(week);
    }

    /// @notice Pays the prize of place `rank` (0 is first place) in each of `assets`. Anyone can call it and
    ///         the prize always goes to the winning wallet. Assets already paid are skipped, and assets are
    ///         claimed separately, so an asset whose transfers are halted by its issuer does not hold up the others.
    function claim(uint256 week, uint256 rank, address[] calldata assets)
        external
        nonReentrant
        whenNotPaused
        notMigrated
    {
        WeekResult storage result = _weekResults[week];
        if (result.finalizedAt == 0 || result.closed) revert ClaimsClosed();
        if (block.timestamp >= uint256(result.finalizedAt) + CLAIM_WINDOW) revert ClaimsClosed();
        if (rank >= 5 || result.winners[rank] == address(0)) revert InvalidRank();

        address winner = result.winners[rank];

        uint256 paid;
        for (uint256 i; i < assets.length; ++i) {
            address asset = assets[i];
            uint256 amount = _prize(weekPool[week][asset], rank);
            if (amount == 0 || prizeClaimed[week][asset][rank]) continue;

            prizeClaimed[week][asset][rank] = true;
            paid += amount;
            _transferOut(asset, winner, amount);

            emit PrizeClaimed(week, rank, winner, asset, amount);
        }
        if (paid == 0) revert NothingToClaim();
    }

    /// @notice Moves prizes that were not claimed within CLAIM_WINDOW into the pool of the week in progress.
    function rolloverUnclaimed(uint256 week) external whenNotPaused notMigrated {
        WeekResult storage result = _weekResults[week];
        if (result.finalizedAt == 0 || result.closed) revert ClaimsClosed();
        if (block.timestamp < uint256(result.finalizedAt) + CLAIM_WINDOW) revert ClaimWindowOpen();
        result.closed = true;

        address[5] memory winners = result.winners;
        uint256 toWeek = currentWeek();

        for (uint256 i; i < _assets.length; ++i) {
            address asset = _assets[i];
            uint256 pool = weekPool[week][asset];
            if (pool == 0) continue;

            uint256 unclaimed;
            for (uint256 rank; rank < 5; ++rank) {
                if (winners[rank] != address(0) && !prizeClaimed[week][asset][rank]) unclaimed += _prize(pool, rank);
            }
            if (unclaimed != 0) {
                weekPool[toWeek][asset] += unclaimed;
                emit UnclaimedRolledOver(week, toWeek, asset, unclaimed);
            }
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Roles and emergency controls
    // ---------------------------------------------------------------------------------------------

    function setOperator(address newOperator) external onlyAdmin {
        if (newOperator == address(0)) revert ZeroAddress();
        operator = newOperator;
        emit OperatorSet(newOperator);
    }

    function setGuardian(address newGuardian) external onlyAdmin {
        if (newGuardian == address(0)) revert ZeroAddress();
        guardian = newGuardian;
        emit GuardianSet(newGuardian);
    }

    /// @notice Stops schedules, results, payouts and claims here and in the buyback burner.
    function pause() external {
        if (msg.sender != guardian && msg.sender != factory.owner()) revert Unauthorized();
        _pause();
    }

    function unpause() external onlyAdmin notMigrated {
        _unpause();
    }

    /// @notice Emergency exit, only while paused. Points this vault at a replacement contract, permanently.
    ///         Balances then move to it one asset at a time through `sweepToSuccessor`, and nothing can be paid
    ///         out from here again. The replacement is expected to honour the pots, pools and prizes recorded
    ///         in this contract, which stay readable.
    function migrate(address newVault) external onlyAdmin whenPaused notMigrated {
        if (newVault.code.length == 0) revert InvalidSuccessor();
        successor = newVault;
        emit Migrated(newVault);
    }

    /// @notice Sends the whole balance of `asset` to the successor. Anyone can call it after a migration.
    function sweepToSuccessor(address asset) external nonReentrant {
        address to = successor;
        if (to == address(0)) revert NotMigrated();
        uint256 amount = accounted[asset];
        if (amount == 0) revert NothingToSweep();

        _transferOut(asset, to, amount);
        emit SweptToSuccessor(asset, amount);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    /// @notice Battle `token` is live in right now, or zero. The eligibility engine reads it to spot a live DQ.
    function activeBattleOf(address token) public view returns (uint256) {
        Schedule memory schedule = _schedules[token];
        return _isLive(schedule.startTime) ? schedule.battleId : 0;
    }

    function getBattle(uint256 battleId) external view returns (Battle memory) {
        return _battles[battleId];
    }

    /// @notice Whether fees earned by `token` in `asset` still belong to the pot of `battleId`.
    function isBattlePotOpen(uint256 battleId, address token, address asset) public view returns (bool) {
        Battle storage battle = _battles[battleId];
        return !battle.finalized && battle.asset == asset && (battle.tokenA == token || battle.tokenB == token);
    }

    /// @notice Battle the fees `token` earns right now belong to, or zero. The hook tags every swap's fees with it:
    ///         from the schedule until the live window ends that is the token's battle, so fees earned before the
    ///         start join the pot too. Afterwards it is zero again and those fees route as Phase 3.
    function feeBucketOf(address token) external view returns (uint256) {
        Schedule memory schedule = _schedules[token];
        return block.timestamp < uint256(schedule.startTime) + BATTLE_DURATION ? schedule.battleId : 0;
    }

    /// @notice Whether `token` went PENDING_EXPIRY since launch without starting its eligibility timer. A token
    ///         that ever started the timer, which includes every eligible, disqualified or battled token, never
    ///         expires.
    function isPendingExpired(address token) public view returns (bool) {
        if (eligibilityOf[token].firstCloseAt != 0) return false;
        uint256 launchedAt = factory.getLaunch(token).launchedAt;
        return launchedAt != 0 && block.timestamp >= launchedAt + PENDING_EXPIRY;
    }

    function scheduleOf(address token) external view returns (Schedule memory) {
        return _schedules[token];
    }

    /// @notice Index of the current competition week. Weeks run from Monday 00:00 UTC to the next Monday.
    function currentWeek() public view returns (uint256) {
        return (block.timestamp + WEEK_SHIFT) / WEEK;
    }

    function weekEndsAt(uint256 week) public pure returns (uint256) {
        return (week + 1) * WEEK - WEEK_SHIFT;
    }

    function getWeekResult(uint256 week) external view returns (WeekResult memory) {
        return _weekResults[week];
    }

    /// @notice Amount place `rank` can claim in `asset` for `week` right now.
    function claimableOf(uint256 week, uint256 rank, address asset) external view returns (uint256) {
        WeekResult storage result = _weekResults[week];
        if (
            rank >= 5 || result.finalizedAt == 0 || result.closed || result.winners[rank] == address(0)
                || block.timestamp >= uint256(result.finalizedAt) + CLAIM_WINDOW
                || prizeClaimed[week][asset][rank]
        ) return 0;
        return _prize(weekPool[week][asset], rank);
    }

    /// @notice Share of each asset in a week's pool paid to `rank` (0 is first place), in basis points.
    function prizeShareBps(uint256 rank) public pure returns (uint256) {
        if (rank == 0) return 4_000;
        if (rank == 1) return 3_000;
        if (rank == 2) return 1_500;
        if (rank == 3) return 1_000;
        if (rank == 4) return 500;
        revert InvalidRank();
    }

    /// @notice Every asset this vault has received.
    function assetList() external view returns (address[] memory) {
        return _assets;
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _receive(address asset, uint256 amount) private {
        if (msg.sender != factory.feeVault()) revert Unauthorized();
        if (asset == address(0)) {
            if (msg.value != amount) revert InvalidValue();
        } else if (msg.value != 0 || IERC20(asset).balanceOf(address(this)) < accounted[asset] + amount) {
            revert FundsNotReceived();
        }

        accounted[asset] += amount;
        if (!_isKnownAsset[asset]) {
            _isKnownAsset[asset] = true;
            _assets.push(asset);
        }

        emit FeesReceived(asset, amount);
    }

    function _reserve(address token, uint256 battleId, uint256 startTime) private {
        _schedules[token] = Schedule(SafeCast.toUint64(battleId), SafeCast.toUint48(startTime));
    }

    /// @dev Gives `token` its battle back after a cancel: its share of the pot returns to pending, and nothing
    ///      tags its fees to the old battle any more.
    function _returnBattle(uint256 battleId, address token, address asset) private {
        pendingBattlePot[token][asset] += contributionOf[battleId][token];
        contributionOf[battleId][token] = 0;
        hasBattled[token] = false;
        delete _schedules[token];
    }

    /// @dev Outcome fixed by the disqualification record of a battle's two tokens, or None when neither dropped.
    ///      A booked token can only be disqualified while its battle is live, so any record here is from the battle.
    function _disqualificationOutcome(address tokenA, address tokenB) private view returns (Outcome) {
        Eligibility storage a = eligibilityOf[tokenA];
        Eligibility storage b = eligibilityOf[tokenB];
        if (!a.disqualified && !b.disqualified) return Outcome.None;
        if (a.disqualified && b.disqualified) {
            if (a.disqualifiedAt == b.disqualifiedAt) return Outcome.Void;
            return a.disqualifiedAt < b.disqualifiedAt ? Outcome.DisqualifiedA : Outcome.DisqualifiedB;
        }
        return a.disqualified ? Outcome.DisqualifiedA : Outcome.DisqualifiedB;
    }

    function _isLive(uint256 startTime) private view returns (bool) {
        return startTime != 0 && block.timestamp >= startTime && block.timestamp < startTime + BATTLE_DURATION;
    }

    /// @dev Enforces spec §2.1 entry rules for a token about to be scheduled into a battle: it must be
    ///      currently eligible (its market cap held ≥ $100k for the full 24h window), it must not have been
    ///      disqualified, and it must never have battled before (battles are once-per-lifetime).
    function _requireBattleReady(address token) private view {
        if (hasBattled[token]) revert AlreadyBattled(token);
        Eligibility storage e = eligibilityOf[token];
        if (e.disqualified || !e.eligible) revert NotEligible(token);
    }

    /// @dev Opens `token`'s side of a freshly scheduled pot. Fees the token earned before the schedule may still sit
    ///      in the hook's untagged bucket: sweeping it first parks their battle share as pending, so the seed covers
    ///      every fee earned so far. The token's one lifetime battle is then spent, and from here on its fees are
    ///      tagged to this battle until the live window ends (see feeBucketOf).
    function _openPot(uint256 battleId, address token, address asset) private {
        IQualyraHook(factory.hook()).sweepFees(token, 0);

        // The funds are already in the vault (accounted when received), so only the internal ledger moves.
        uint256 seeded = pendingBattlePot[token][asset];
        if (seeded != 0) {
            pendingBattlePot[token][asset] = 0;
            _battles[battleId].pot += seeded;
            // The seed is this token's own money: record it as its contribution for Draw/Void refunds (plan §2.2).
            contributionOf[battleId][token] += seeded;
            emit BattlePotSeeded(battleId, token, asset, seeded);
        }

        hasBattled[token] = true;
    }

    /// @dev Before the league starts, funds wait in the bootstrap pool. Afterwards they join the week in
    ///      progress, or the first league week if that has not begun yet.
    function _addToLeague(address asset, uint256 amount) private {
        if (amount == 0) return;

        uint256 firstWeek = firstLeagueWeek;
        if (firstWeek == 0) {
            bootstrapPool[asset] += amount;
            emit LeagueFunded(0, asset, amount);
            return;
        }

        uint256 week = currentWeek();
        if (week < firstWeek) week = firstWeek;
        weekPool[week][asset] += amount;
        emit LeagueFunded(week, asset, amount);
    }

    function _fundBuyback(uint256 battleId, address token, address asset, uint256 amount) private {
        if (amount == 0) return;

        address burner = factory.buybackBurner();
        accounted[asset] -= amount;
        if (asset == address(0)) {
            IQualyraBuybackBurner(burner).fund{value: amount}(battleId, token, asset, amount);
        } else {
            IERC20(asset).safeTransfer(burner, amount);
            IQualyraBuybackBurner(burner).fund(battleId, token, asset, amount);
        }

        // The first tranche runs right away, so the buyback starts without a separate call. Best effort: when it
        // can't run now, the keeper or anyone else runs it on the burner later.
        try IQualyraBuybackBurner(burner).executeBuyback(battleId, token) {} catch {}
    }

    /// @dev Forwards a token's pending battle pot to the fee-vault treasury, on a pre-battle disqualification
    ///      (spec §4.1) or once it passed PENDING_EXPIRY. The funds are already held here (accounted on receipt),
    ///      so we drop them from `accounted` and hand them to the fee vault, which books them as treasury.
    ///      Idempotent: a zero pending pot is a no-op.
    function _drainPendingToTreasury(address token, address asset) private {
        uint256 stuck = pendingBattlePot[token][asset];
        if (stuck == 0) return;

        pendingBattlePot[token][asset] = 0;
        accounted[asset] -= stuck;

        address feeVault = factory.feeVault();
        if (asset == address(0)) {
            IQualyraFeeVault(feeVault).creditTreasury{value: stuck}(asset, stuck);
        } else {
            IERC20(asset).safeTransfer(feeVault, stuck);
            IQualyraFeeVault(feeVault).creditTreasury(asset, stuck);
        }

        emit PendingBattlePotDrained(token, asset, stuck);
    }

    function _transferOut(address asset, address to, uint256 amount) private {
        accounted[asset] -= amount;
        if (asset == address(0)) {
            Address.sendValue(payable(to), amount);
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }

    function _prize(uint256 pool, uint256 rank) private pure returns (uint256) {
        return pool * prizeShareBps(rank) / BPS;
    }
}

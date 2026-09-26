// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraCompetitionVault} from "./interfaces/IQualyraCompetitionVault.sol";
import {IQualyraHook} from "./interfaces/IQualyraHook.sol";
import {QualyraFees} from "./libraries/QualyraFees.sol";

/// @title QualyraFeeVault
/// @notice Receives trading fees, creator tax and launch fees, and splits them between the creator,
///         the platform treasury and the competition vault using the split locked in at launch.
/// @dev Callers transfer funds first and then report them; the vault only accepts amounts it can see on
///      top of its tracked balance. Creator and treasury balances are pulled, never pushed.
contract QualyraFeeVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;
    /// @dev Share of the competition amount that always goes to the Trader League; the rest is the battle share.
    uint256 private constant LEAGUE_SHARE_OF_COMPETITION_BPS = 3_000;

    IQualyraFactory public immutable factory;
    address public treasury;

    /// @notice Balance per asset that is already assigned to someone.
    mapping(address asset => uint256) public accounted;
    mapping(address token => mapping(address asset => uint256)) public creatorBalance;
    mapping(address asset => uint256) public treasuryBalance;

    event FeesCollected(
        address indexed token,
        address indexed asset,
        uint256 indexed battleId,
        uint256 tradeFee,
        uint256 creatorTax,
        uint256 creatorAmount,
        uint256 platformAmount,
        uint256 competitionAmount
    );
    event LaunchFeeCollected(uint256 treasuryAmount, uint256 leagueAmount);
    event CreatorFeesWithdrawn(address indexed token, address indexed asset, address indexed recipient, uint256 amount);
    event TreasuryWithdrawn(address indexed asset, address indexed treasury, uint256 amount);
    event SurplusSwept(address indexed asset, uint256 amount);
    event TreasurySet(address indexed treasury);
    /// @notice The competition vault sent funds straight to the treasury (a disqualified token's drained pending pot).
    event TreasuryCredited(address indexed asset, uint256 amount);

    error Unauthorized();
    error UnknownToken();
    error FundsNotReceived();
    error ZeroAddress();
    error NothingToWithdraw();

    constructor(address factory_, address treasury_) {
        if (factory_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
        factory = IQualyraFactory(factory_);
        treasury = treasury_;
    }

    receive() external payable {}

    /// @notice Records fees for `token` that the caller has already sent to this vault.
    /// @param tradeFee Trading fee plus any snipe tax, split between creator, platform and competition.
    /// @param creatorTax Creator tax, credited to the creator in full.
    /// @param battleId Battle the fees were earned in, or zero.
    function collectFees(address token, uint256 tradeFee, uint256 creatorTax, uint256 battleId)
        external
        payable
        nonReentrant
    {
        IQualyraFactory.Launch memory launch = factory.getLaunch(token);
        if (launch.curve == address(0)) revert UnknownToken();
        if (msg.sender != launch.curve && msg.sender != factory.hook() && msg.sender != factory.graduationExecutor()) {
            revert Unauthorized();
        }

        address asset = launch.quoteAsset;
        _receive(asset, tradeFee + creatorTax);

        uint256 creatorAmount = tradeFee * launch.creatorShareBps / BPS;
        uint256 competitionAmount = tradeFee * launch.competitionShareBps / BPS;
        uint256 platformAmount = tradeFee - creatorAmount - competitionAmount;

        creatorBalance[token][asset] += creatorAmount + creatorTax;

        if (competitionAmount != 0) {
            _routeCompetition(token, asset, battleId, competitionAmount, launch.launchedAt);
        }

        treasuryBalance[asset] += platformAmount;

        emit FeesCollected(
            token, asset, battleId, tradeFee, creatorTax, creatorAmount + creatorTax, platformAmount, competitionAmount
        );
    }

    /// @notice Books funds the competition vault forwards straight to the platform treasury: the pending battle
    ///         pot of a token disqualified before it ever battles (spec §4.1), or of one past its pending expiry,
    ///         so no competition funds get stuck.
    /// @dev Only the competition vault may call this. It sends the ETH with the call (or pre-transfers the ERC20).
    ///      Not `nonReentrant`: it makes no external calls, and it has to accept the pending expiry release the
    ///      competition vault performs while this vault is still routing a fee (`_routeCompetition`).
    function creditTreasury(address asset, uint256 amount) external payable {
        if (msg.sender != factory.competitionVault()) revert Unauthorized();
        _receive(asset, amount);
        treasuryBalance[asset] += amount;
        emit TreasuryCredited(asset, amount);
    }

    /// @notice Books a launch fee paid in ETH entirely to the treasury; the Trader League gets no share.
    function collectLaunchFee() external payable nonReentrant {
        if (msg.sender != address(factory)) revert Unauthorized();
        _receive(address(0), msg.value);
        treasuryBalance[address(0)] += msg.value;
        emit LaunchFeeCollected(msg.value, 0);
    }

    /// @notice Pays the creator balance of `token` in `asset` to its current fee recipient. Anyone can trigger it.
    ///         Fees the pool hook still holds for the token are collected first, so nothing is left behind.
    function withdrawCreatorFees(address token, address asset) external returns (uint256 amount) {
        _collectParkedFees(token);
        return _payCreator(token, asset);
    }

    function _payCreator(address token, address asset) private nonReentrant returns (uint256 amount) {
        amount = creatorBalance[token][asset];
        if (amount == 0) revert NothingToWithdraw();
        address recipient = factory.feeRecipientOf(token);

        creatorBalance[token][asset] = 0;
        _send(asset, recipient, amount, true);

        emit CreatorFeesWithdrawn(token, asset, recipient, amount);
    }

    /// @notice Pays the platform balance in `asset` to the treasury. Anyone can trigger it.
    function withdrawTreasury(address asset) external nonReentrant returns (uint256 amount) {
        amount = treasuryBalance[asset];
        if (amount == 0) revert NothingToWithdraw();

        treasuryBalance[asset] = 0;
        _send(asset, treasury, amount, true);

        emit TreasuryWithdrawn(asset, treasury, amount);
    }

    /// @notice Books anything this vault holds beyond its recorded balances, for example funds sent here by
    ///         mistake, as treasury balance. Anyone can trigger it.
    function sweepSurplus(address asset) external returns (uint256 surplus) {
        uint256 balance = asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
        surplus = balance - accounted[asset];
        if (surplus == 0) revert NothingToWithdraw();

        accounted[asset] += surplus;
        treasuryBalance[asset] += surplus;

        emit SurplusSwept(asset, surplus);
    }

    function setTreasury(address newTreasury) external {
        if (msg.sender != factory.owner()) revert Unauthorized();
        if (newTreasury == address(0)) revert ZeroAddress();
        treasury = newTreasury;
        emit TreasurySet(newTreasury);
    }

    /// @dev Routes the competition share (already received into this vault) by the token's battle phase (spec §3).
    ///      All flags are read from the competition vault so the decision is made from a single source of truth:
    ///        - tagged to an open battle pot -> the whole share joins that pot (Phase 2; a mid-battle DQ still
    ///          funds it, §4.2). The hook tags fees from the schedule to the end of the live window;
    ///        - disqualified pre-battle -> the whole share is treasury (§4.1);
    ///        - battle spent (scheduled) -> battle share (70%) is treasury, league slice (30%) funds the league
    ///          (Phase 3);
    ///        - past PENDING_EXPIRY without an eligibility timer -> same split as Phase 3, and whatever the token
    ///          already parked as pending follows to the treasury;
    ///        - otherwise -> battle share waits in the token's pending pot, league slice funds it (Phase 1).
    ///      Treasury slices never leave this vault: the funds are already accounted here, so only the ledger moves.
    function _routeCompetition(address token, address asset, uint256 battleId, uint256 amount, uint256 launchedAt)
        private
    {
        IQualyraCompetitionVault competition = IQualyraCompetitionVault(factory.competitionVault());

        // Phase 2 / DQ-during-live (§4.2): fees tagged to a still-open battle pot always join it and count as this
        // token's contribution. Open means not finalized, so a late sweep still lands in the right pot.
        if (competition.isBattlePotOpen(battleId, token, asset)) {
            _send(asset, address(competition), amount, false);
            competition.depositBattleFees{value: asset == address(0) ? amount : 0}(battleId, token, asset, amount);
            return;
        }

        uint256 leagueShare = amount * LEAGUE_SHARE_OF_COMPETITION_BPS / BPS;
        uint256 battleShare = amount - leagueShare;

        (uint48 firstCloseAt,, bool disqualified,) = competition.eligibilityOf(token);
        bool battled = competition.hasBattled(token);

        if (disqualified && !battled) {
            // §4.1: disqualified before ever battling -> the whole competition share is treasury.
            treasuryBalance[asset] += amount;
            return;
        }

        if (battled) {
            // Phase 3: the one lifetime battle is spent, so the battle share becomes treasury; league slice stays.
            treasuryBalance[asset] += battleShare;
            _fundLeague(competition, asset, leagueShare);
            return;
        }

        if (
            firstCloseAt == 0 && block.timestamp >= launchedAt + QualyraFees.PENDING_EXPIRY
                && competition.isPendingExpired(token)
        ) {
            // Pending expiry, decided by the competition vault's own `isPendingExpired` so both sides always agree
            // on one definition (it also excuses a pool that is still warming up right after graduation): the token
            // let PENDING_EXPIRY pass without ever starting its eligibility timer, so it stops building a battle
            // pot. Its battle share is treasury, and whatever it parked before follows once.
            treasuryBalance[asset] += battleShare;
            _fundLeague(competition, asset, leagueShare);
            if (competition.pendingBattlePot(token, asset) != 0) {
                // Best effort: fee routing must never fail on it, and anyone can still call it directly.
                try competition.releaseExpiredPending(token, asset) {} catch {}
            }
            return;
        }

        // Phase 1: hold the battle share for the token's battle; seed the league with its fixed slice.
        if (battleShare != 0) {
            _send(asset, address(competition), battleShare, false);
            competition.depositBattleFees{value: asset == address(0) ? battleShare : 0}(
                battleId, token, asset, battleShare
            );
        }
        _fundLeague(competition, asset, leagueShare);
    }

    /// @dev Sweeps what the pool hook holds for `token`: its untagged fees and those tagged to the battle it is
    ///      booked into. Both are no-ops before graduation or when empty. Fees of a battle whose live window has
    ///      ended stay for `finalizeBattle`, which sweeps them into the pot.
    function _collectParkedFees(address token) private {
        address hook = factory.hook();
        if (hook.code.length == 0) return;
        IQualyraHook(hook).sweepFees(token, 0);
        uint256 battleId = IQualyraCompetitionVault(factory.competitionVault()).feeBucketOf(token);
        if (battleId != 0) IQualyraHook(hook).sweepFees(token, battleId);
    }

    function _fundLeague(IQualyraCompetitionVault competition, address asset, uint256 leagueShare) private {
        if (leagueShare == 0) return;
        _send(asset, address(competition), leagueShare, false);
        competition.depositLeagueFees{value: asset == address(0) ? leagueShare : 0}(asset, leagueShare);
    }

    function _receive(address asset, uint256 amount) private {
        uint256 balance = asset == address(0) ? address(this).balance : IERC20(asset).balanceOf(address(this));
        if (balance < accounted[asset] + amount) revert FundsNotReceived();
        accounted[asset] += amount;
    }

    /// @dev For ETH sent to the competition vault the value travels with the deposit call, so `transferEth` is false.
    function _send(address asset, address to, uint256 amount, bool transferEth) private {
        accounted[asset] -= amount;
        if (asset == address(0)) {
            if (transferEth) Address.sendValue(payable(to), amount);
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }
}

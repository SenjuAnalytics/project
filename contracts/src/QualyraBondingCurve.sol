// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {QualyraLaunchToken} from "./QualyraLaunchToken.sol";
import {QualyraFees} from "./libraries/QualyraFees.sol";
import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraFeeVault} from "./interfaces/IQualyraFeeVault.sol";
import {IQualyraCompetitionVault} from "./interfaces/IQualyraCompetitionVault.sol";
import {IQualyraGraduationExecutor} from "./interfaces/IQualyraGraduationExecutor.sol";

/// @title QualyraBondingCurve
/// @notice Primary market for one launch. Prices follow a constant product curve over a phantom pair
///         asset reserve, so trading starts at phantomQuote / supply. Once the curve has raised its
///         graduation threshold, the raised amount and the reserved tokens move into a Uniswap v4 pool
///         that continues from the same price with the same depth.
contract QualyraBondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Phase {
        Trading,
        Completed,
        Graduated,
        Refunding
    }

    struct Init {
        address factory;
        address token;
        address quoteAsset;
        uint256 supply;
        uint256 phantomQuote;
        uint256 graduationThreshold;
        uint256 creatorTaxBps;
        uint256 snipeStartBps;
        uint256 snipeWindow;
    }

    struct BuyQuote {
        uint256 amountIn;
        uint256 netIn;
        uint256 tokensOut;
        uint256 tradeFee;
        uint256 creatorTax;
        uint256 snipeTax;
        uint256 refund;
    }

    struct SellQuote {
        uint256 grossOut;
        uint256 amountOut;
        uint256 tradeFee;
        uint256 creatorTax;
    }

    /// @notice How long a completed curve waits for graduation before the factory owner may open refunds.
    uint256 public constant STUCK_LAUNCH_DELAY = 7 days;

    /// @notice Gas that must remain for a completing buy to graduate in the same transaction. Building the v4
    ///         pool and locking liquidity measured ~580k gas on testnet, so this sits comfortably above that and
    ///         the forwarded sub-call (this minus the reserve) always has enough. A completing buy that does not
    ///         carry this much now REVERTS rather than deferring: that is what forces `eth_estimateGas` — and so
    ///         the wallet — to provision the full pool build, so a normal completing buy graduates on its own.
    uint256 private constant GRADUATION_GAS_BUFFER = 900_000;
    /// @notice Gas held back from the auto-graduation sub-call so the buy can always finish its own bookkeeping
    ///         (emit, refund, return) even if graduation reverts. This is the "1/64th rule" cushion made explicit.
    uint256 private constant GRADUATION_GAS_RESERVE = 50_000;

    IQualyraFactory public immutable factory;
    address public immutable token;
    /// @notice Pair asset of this launch, address(0) for native ETH.
    address public immutable quoteAsset;
    uint256 public immutable supply;
    uint256 public immutable phantomQuote;
    uint256 public immutable graduationThreshold;
    /// @notice Tokens kept on the curve to seed the pool at graduation.
    uint256 public immutable reservedTokens;
    uint256 public immutable creatorTaxBps;
    uint256 public immutable snipeStartBps;
    uint256 public immutable snipeWindow;
    uint256 public immutable launchedAt;
    uint256 private immutable _invariant;

    Phase public phase;
    /// @notice Pair asset backing the curve, net of fees.
    uint256 public quoteReserve;
    /// @notice Tokens still on the curve, including the reserved share.
    uint256 public tokenReserve;
    uint256 public completedAt;
    /// @notice Sold tokens that can still be redeemed while refunds are open.
    uint256 public refundableTokens;

    event Bought(
        address indexed payer,
        address indexed recipient,
        uint256 amountIn,
        uint256 tokensOut,
        uint256 tradeFee,
        uint256 creatorTax,
        uint256 snipeTax,
        uint256 quoteReserve
    );
    event Sold(
        address indexed seller,
        address indexed recipient,
        uint256 tokensIn,
        uint256 amountOut,
        uint256 tradeFee,
        uint256 creatorTax,
        uint256 quoteReserve
    );
    event CurveCompleted(uint256 quoteRaised);
    event GraduationDeferred();
    event Graduated(uint256 quoteAmount, uint256 tokenAmount);
    event RefundsEnabled(uint256 quoteAvailable, uint256 refundableTokens);
    event Refunded(address indexed holder, uint256 tokensBurned, uint256 amountOut);

    error Expired();
    error InvalidAmount();
    error InvalidRecipient();
    error InvalidValue();
    error WrongPhase();
    error SlippageExceeded();
    error Unauthorized();
    error TooEarly();
    error InsufficientGasForGraduation();

    constructor(Init memory init) {
        uint256 k = init.phantomQuote * init.supply;

        factory = IQualyraFactory(init.factory);
        token = init.token;
        quoteAsset = init.quoteAsset;
        supply = init.supply;
        phantomQuote = init.phantomQuote;
        graduationThreshold = init.graduationThreshold;
        creatorTaxBps = init.creatorTaxBps;
        snipeStartBps = init.snipeStartBps;
        snipeWindow = init.snipeWindow;
        launchedAt = block.timestamp;
        reservedTokens = Math.ceilDiv(k, init.phantomQuote + init.graduationThreshold);
        _invariant = k;

        tokenReserve = init.supply;
    }

    // ---------------------------------------------------------------------------------------------
    // Trading
    // ---------------------------------------------------------------------------------------------

    /// @notice Buys tokens with `amountIn` of the pair asset.
    /// @dev If the buy would push the curve past its threshold, only the part that completes the curve is
    ///      used and the rest is sent back to the caller.
    function buy(uint256 amountIn, uint256 minTokensOut, address recipient, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (phase != Phase.Trading) revert WrongPhase();
        if (amountIn == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidRecipient();

        if (quoteAsset == address(0)) {
            if (msg.value != amountIn) revert InvalidValue();
        } else {
            if (msg.value != 0) revert InvalidValue();
            IERC20(quoteAsset).safeTransferFrom(msg.sender, address(this), amountIn);
        }

        BuyQuote memory q = _quoteBuy(amountIn, recipient);
        if (q.tokensOut == 0 || q.tokensOut < minTokensOut) revert SlippageExceeded();

        quoteReserve += q.netIn;
        tokenReserve -= q.tokensOut;

        IERC20(token).safeTransfer(recipient, q.tokensOut);
        _sendFees(q.tradeFee + q.snipeTax, q.creatorTax);
        _pay(msg.sender, q.refund);

        emit Bought(msg.sender, recipient, q.amountIn, q.tokensOut, q.tradeFee, q.creatorTax, q.snipeTax, quoteReserve);

        // A completing buy fills the curve exactly, but use >= so any rounding that lands the reserve a hair
        // past the threshold still flips the curve to Completed instead of silently overshooting.
        if (quoteReserve >= graduationThreshold) {
            phase = Phase.Completed;
            completedAt = block.timestamp;
            emit CurveCompleted(quoteReserve);

            // Graduation builds the v4 pool and locks liquidity, which is far heavier than the buy itself.
            // The gas it needs is REQUIRED, not optional. When a short-gas buy was allowed to defer silently,
            // eth_estimateGas settled on that cheap branch, so a wallet sent the completing buy without enough
            // gas to ever graduate — parking the curve at Completed until someone triggered graduate() by hand.
            // Reverting forces the estimate, and therefore the wallet, to fund the full pool build, so a normal
            // completing buy graduates in the same transaction with no manual step.
            if (gasleft() < GRADUATION_GAS_BUFFER) revert InsufficientGasForGraduation();

            // Still run graduation through a sub-call: a genuinely reverting executor (not a gas shortage) is
            // caught so the curve stays safely at Completed and the STUCK_LAUNCH_DELAY refund path stays reachable.
            try this.graduateOnCompletion{gas: gasleft() - GRADUATION_GAS_RESERVE}() {}
            catch {
                emit GraduationDeferred();
            }
        }

        // CLOSE hook (pre-graduation): evaluate market-cap eligibility on the settled price. Skip when
        // the curve just completed/graduated in this same buy — post-graduation closes are the pool
        // hook's responsibility and the curve reserves have moved into the pool.
        if (phase == Phase.Trading) _reportTradeClose();
        return q.tokensOut;
    }

    /// @notice Sells `tokenAmount` back to the curve for the pair asset.
    function sell(uint256 tokenAmount, uint256 minAmountOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (phase != Phase.Trading) revert WrongPhase();
        if (tokenAmount == 0) revert InvalidAmount();
        if (recipient == address(0)) revert InvalidRecipient();

        SellQuote memory q = _quoteSell(tokenAmount);
        if (q.amountOut == 0 || q.amountOut < minAmountOut) revert SlippageExceeded();

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        tokenReserve += tokenAmount;
        quoteReserve -= q.grossOut;

        _sendFees(q.tradeFee, q.creatorTax);
        _pay(recipient, q.amountOut);

        emit Sold(msg.sender, recipient, tokenAmount, q.amountOut, q.tradeFee, q.creatorTax, quoteReserve);

        // CLOSE hook (pre-graduation): evaluate market-cap eligibility on the settled price.
        _reportTradeClose();
        return q.amountOut;
    }

    // ---------------------------------------------------------------------------------------------
    // Graduation and recovery
    // ---------------------------------------------------------------------------------------------

    /// @notice Moves a completed curve into its pool. Open to anyone when graduation did not go through
    ///         during the completing buy.
    function graduate() external nonReentrant {
        _graduate();
    }

    /// @dev Called by `buy` through an external self call, so a failed graduation never reverts the buy.
    function graduateOnCompletion() external {
        if (msg.sender != address(this)) revert Unauthorized();
        _graduate();
    }

    /// @notice Opens refunds for a launch that completed but has not graduated for STUCK_LAUNCH_DELAY.
    /// @dev Called by the factory on behalf of its owner. Unsold tokens are burned.
    function enableRefunds() external {
        if (msg.sender != address(factory)) revert Unauthorized();
        if (phase != Phase.Completed) revert WrongPhase();
        if (block.timestamp < completedAt + STUCK_LAUNCH_DELAY) revert TooEarly();

        phase = Phase.Refunding;
        uint256 unsold = tokenReserve;
        // Holders may have burned tokens of their own, so the refundable amount comes from the supply that is
        // still out there rather than the amount minted.
        refundableTokens = IERC20(token).totalSupply() - unsold;
        tokenReserve = 0;
        if (unsold != 0) QualyraLaunchToken(token).burn(unsold);

        emit RefundsEnabled(quoteReserve, refundableTokens);
    }

    /// @notice Burns `tokenAmount` from the caller and returns a pro rata share of the amount raised.
    function claimRefund(uint256 tokenAmount) external nonReentrant returns (uint256 amountOut) {
        if (phase != Phase.Refunding) revert WrongPhase();
        if (tokenAmount == 0 || tokenAmount > refundableTokens) revert InvalidAmount();

        amountOut = Math.mulDiv(tokenAmount, quoteReserve, refundableTokens);
        refundableTokens -= tokenAmount;
        quoteReserve -= amountOut;

        QualyraLaunchToken(token).burnFrom(msg.sender, tokenAmount);
        _pay(msg.sender, amountOut);

        emit Refunded(msg.sender, tokenAmount, amountOut);
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    /// @notice Result of buying with `amountIn` for `recipient` at the current block.
    function quoteBuy(uint256 amountIn, address recipient) external view returns (BuyQuote memory) {
        if (phase != Phase.Trading) revert WrongPhase();
        if (amountIn == 0) revert InvalidAmount();
        return _quoteBuy(amountIn, recipient);
    }

    /// @notice Result of selling `tokenAmount` at the current block.
    function quoteSell(uint256 tokenAmount) external view returns (SellQuote memory) {
        if (phase != Phase.Trading) revert WrongPhase();
        if (tokenAmount == 0) revert InvalidAmount();
        return _quoteSell(tokenAmount);
    }

    /// @notice Marginal price of one whole token (1e18 units), in pair asset units.
    function spotPrice() external view returns (uint256) {
        return _spotPrice();
    }

    /// @dev Internal marginal price so on-chain callers avoid an external self-call. Same semantics as
    ///      `spotPrice()`: price of one whole (1e18) token expressed in pair-asset units.
    function _spotPrice() private view returns (uint256) {
        if (tokenReserve == 0) return 0;
        return Math.mulDiv(phantomQuote + quoteReserve, 1e18, tokenReserve);
    }

    /// @dev Report a settled (CLOSE) trade to the competition vault so it can evaluate market-cap
    ///      eligibility on the post-trade price. Wrapped in try/catch so eligibility can NEVER block a
    ///      trade: the engine is already internally fail-safe, this is defence in depth.
    function _reportTradeClose() private {
        address competition = factory.competitionVault();
        if (competition == address(0)) return;
        try IQualyraCompetitionVault(competition).onTradeClose(token, _spotPrice(), quoteAsset) {} catch {}
    }

    /// @notice Share of the graduation threshold raised so far, in basis points.
    function progressBps() external view returns (uint256) {
        if (phase != Phase.Trading) return QualyraFees.BPS;
        return Math.mulDiv(quoteReserve, QualyraFees.BPS, graduationThreshold);
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _quoteBuy(uint256 amountIn, address recipient) private view returns (BuyQuote memory q) {
        uint256 snipeBps = QualyraFees.snipeTaxBps(launchedAt, snipeStartBps, snipeWindow, creatorTaxBps);
        if (snipeBps != 0 && factory.isSnipeExempt(token, recipient)) snipeBps = 0;

        uint256 feeBps = QualyraFees.TRADE_FEE_BPS + creatorTaxBps + snipeBps;
        uint256 room = graduationThreshold - quoteReserve;

        q.amountIn = amountIn;
        if (amountIn - Math.mulDiv(amountIn, feeBps, QualyraFees.BPS) >= room) {
            uint256 needed = Math.mulDiv(room, QualyraFees.BPS, QualyraFees.BPS - feeBps, Math.Rounding.Ceil);
            if (needed < amountIn) {
                q.amountIn = needed;
                q.refund = amountIn - needed;
            }
        }

        q.tradeFee = Math.mulDiv(q.amountIn, QualyraFees.TRADE_FEE_BPS, QualyraFees.BPS);
        q.creatorTax = Math.mulDiv(q.amountIn, creatorTaxBps, QualyraFees.BPS);
        q.snipeTax = Math.mulDiv(q.amountIn, snipeBps, QualyraFees.BPS);
        q.netIn = q.amountIn - q.tradeFee - q.creatorTax - q.snipeTax;
        if (q.netIn > room) {
            // Rounding dust from the completing buy goes to the trading fee.
            q.tradeFee += q.netIn - room;
            q.netIn = room;
        }

        uint256 newTokenReserve = Math.ceilDiv(_invariant, phantomQuote + quoteReserve + q.netIn);
        q.tokensOut = tokenReserve - newTokenReserve;
    }

    function _quoteSell(uint256 tokenAmount) private view returns (SellQuote memory q) {
        uint256 newTokenReserve = tokenReserve + tokenAmount;
        if (newTokenReserve > supply) revert InvalidAmount();

        q.grossOut = phantomQuote + quoteReserve - Math.ceilDiv(_invariant, newTokenReserve);
        q.tradeFee = Math.mulDiv(q.grossOut, QualyraFees.TRADE_FEE_BPS, QualyraFees.BPS);
        q.creatorTax = Math.mulDiv(q.grossOut, creatorTaxBps, QualyraFees.BPS);
        q.amountOut = q.grossOut - q.tradeFee - q.creatorTax;
    }

    function _graduate() private {
        if (phase != Phase.Completed) revert WrongPhase();
        phase = Phase.Graduated;

        uint256 quoteAmount = quoteReserve;
        uint256 tokenAmount = tokenReserve;
        quoteReserve = 0;
        tokenReserve = 0;

        address executor = factory.graduationExecutor();
        IERC20(token).safeTransfer(executor, tokenAmount);
        if (quoteAsset == address(0)) {
            IQualyraGraduationExecutor(executor).graduate{value: quoteAmount}(
                token, quoteAmount, tokenAmount, phantomQuote
            );
        } else {
            IERC20(quoteAsset).safeTransfer(executor, quoteAmount);
            IQualyraGraduationExecutor(executor).graduate(token, quoteAmount, tokenAmount, phantomQuote);
        }

        emit Graduated(quoteAmount, tokenAmount);
    }

    function _sendFees(uint256 tradeFee, uint256 creatorTax) private {
        uint256 total = tradeFee + creatorTax;
        if (total == 0) return;

        address vault = factory.feeVault();
        if (quoteAsset == address(0)) {
            IQualyraFeeVault(vault).collectFees{value: total}(token, tradeFee, creatorTax, 0);
        } else {
            IERC20(quoteAsset).safeTransfer(vault, total);
            IQualyraFeeVault(vault).collectFees(token, tradeFee, creatorTax, 0);
        }
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        if (quoteAsset == address(0)) {
            Address.sendValue(payable(to), amount);
        } else {
            IERC20(quoteAsset).safeTransfer(to, amount);
        }
    }
}

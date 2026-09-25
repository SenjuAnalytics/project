// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";

import {QualyraFees} from "./libraries/QualyraFees.sol";
import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraFeeVault} from "./interfaces/IQualyraFeeVault.sol";
import {IQualyraCompetitionVault} from "./interfaces/IQualyraCompetitionVault.sol";

/// @title QualyraHook
/// @notice Uniswap v4 hook shared by every graduated Qualyra pool. Pools run with a zero LP fee and the hook
///         charges the Qualyra trading fee and creator tax on the pair asset side of each swap, whichever
///         side the swapper specified and whichever interface they used.
/// @dev Fees are minted to the hook as PoolManager claims during the swap, which never needs a token transfer,
///      and are later swept to the fee vault. Accruals are bucketed by the battle the token was booked into at
///      swap time (from its schedule to the end of the live window), so a late sweep still credits the right pot.
contract QualyraHook is IHooks, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;

    struct PoolConfig {
        address token;
        bool quoteIsCurrency0;
        uint16 creatorTaxBps;
        uint16 snipeStartBps;
        uint16 snipeWindow;
        uint64 launchedAt;
    }

    struct Accrual {
        uint128 tradeFee;
        uint128 creatorTax;
    }

    IPoolManager public immutable poolManager;
    IQualyraFactory public immutable factory;

    mapping(PoolId poolId => PoolConfig) public poolConfig;
    mapping(address token => mapping(uint256 battleId => Accrual)) public accruedFees;
    mapping(address token => PoolKey) private _poolKeys;

    /// @dev Transient slot holding the fee `beforeSwap` charged, read back by `afterSwap` of the same swap.
    bytes32 private constant CHARGED_FEE_SLOT = keccak256("qualyra.hook.chargedFee");

    event PoolRegistered(address indexed token, PoolId indexed poolId);
    event FeeAccrued(address indexed token, uint256 indexed battleId, uint256 tradeFee, uint256 creatorTax);
    event FeesSwept(address indexed token, uint256 indexed battleId, uint256 tradeFee, uint256 creatorTax);

    error NotPoolManager();
    error Unauthorized();
    error InvalidPool();
    error PartialSwap();
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(IPoolManager poolManager_, IQualyraFactory factory_) {
        poolManager = poolManager_;
        factory = factory_;
        Hooks.validateHookPermissions(IHooks(address(this)), getHookPermissions());
    }

    function getHookPermissions() public pure returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ---------------------------------------------------------------------------------------------
    // Registry and fee sweeping
    // ---------------------------------------------------------------------------------------------

    /// @notice Records the pool of a graduating launch. Called by the graduation executor before initializing it.
    function registerPool(PoolKey calldata key, address token) external {
        if (msg.sender != factory.graduationExecutor()) revert Unauthorized();

        IQualyraFactory.Launch memory launch = factory.getLaunch(token);
        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        bool quoteIsCurrency0 = currency0 == launch.quoteAsset;
        address expected0 = quoteIsCurrency0 ? launch.quoteAsset : token;
        address expected1 = quoteIsCurrency0 ? token : launch.quoteAsset;
        if (currency0 != expected0 || currency1 != expected1) revert InvalidPool();
        if (address(key.hooks) != address(this) || key.fee != 0) revert InvalidPool();

        PoolId poolId = key.toId();
        poolConfig[poolId] = PoolConfig({
            token: token,
            quoteIsCurrency0: quoteIsCurrency0,
            creatorTaxBps: launch.creatorTaxBps,
            snipeStartBps: launch.snipeStartBps,
            snipeWindow: launch.snipeWindow,
            launchedAt: launch.launchedAt
        });
        _poolKeys[token] = key;

        emit PoolRegistered(token, poolId);
    }

    function poolKeyOf(address token) external view returns (PoolKey memory) {
        return _poolKeys[token];
    }

    /// @notice Moves fees accrued for `token` during `battleId` (zero outside battles) to the fee vault.
    function sweepFees(address token, uint256 battleId) external {
        Accrual memory accrual = accruedFees[token][battleId];
        uint256 total = uint256(accrual.tradeFee) + accrual.creatorTax;
        if (total == 0) return;
        delete accruedFees[token][battleId];

        PoolKey memory key = _poolKeys[token];
        Currency quote = poolConfig[key.toId()].quoteIsCurrency0 ? key.currency0 : key.currency1;
        address vault = factory.feeVault();

        poolManager.unlock(abi.encode(quote, vault, total));
        IQualyraFeeVault(vault).collectFees(token, accrual.tradeFee, accrual.creatorTax, battleId);

        emit FeesSwept(token, battleId, accrual.tradeFee, accrual.creatorTax);
    }

    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (Currency currency, address to, uint256 amount) = abi.decode(data, (Currency, address, uint256));
        poolManager.burn(address(this), currency.toId(), amount);
        poolManager.take(currency, to, amount);
        return "";
    }

    // ---------------------------------------------------------------------------------------------
    // Hook callbacks
    // ---------------------------------------------------------------------------------------------

    /// @dev Only the graduation executor can create pools that use this hook.
    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != factory.graduationExecutor() || poolConfig[key.toId()].token == address(0)) {
            revert Unauthorized();
        }
        return IHooks.beforeInitialize.selector;
    }

    /// @dev Liquidity in Qualyra pools only comes from the locker.
    function beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != factory.liquidityLocker()) revert Unauthorized();
        return IHooks.beforeAddLiquidity.selector;
    }

    /// @dev Handles swaps where the pair asset is the specified currency: exact input buys and exact output sells.
    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolConfig memory config = poolConfig[key.toId()];
        bool exactInput = params.amountSpecified < 0;
        bool quoteSpecified = (exactInput == params.zeroForOne) == config.quoteIsCurrency0;

        if (!quoteSpecified || sender == factory.buybackBurner()) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 amount = SignedMath.abs(params.amountSpecified);
        (uint256 tradeFee, uint256 creatorTax) =
            exactInput ? _feesFromGross(config, amount, true) : _feesOnTop(config, amount, false);

        uint256 total = tradeFee + creatorTax;
        if (total != 0) _accrue(key, config, tradeFee, creatorTax);
        _rememberFee(total);

        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(total.toInt128(), 0), 0);
    }

    /// @dev Handles swaps where the pair asset is the unspecified currency: exact input sells and exact output buys.
    ///      For the other two, it checks that the swap traded the whole amount the fee was charged on.
    function afterSwap(address sender, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        PoolConfig memory config = poolConfig[key.toId()];
        bool exactInput = params.amountSpecified < 0;
        bool quoteSpecified = (exactInput == params.zeroForOne) == config.quoteIsCurrency0;

        if (sender == factory.buybackBurner()) return (IHooks.afterSwap.selector, 0);

        // CLOSE hook (post-graduation): evaluate market-cap eligibility on the realized swap price. Placed
        // before the branch that may early-return so it runs for every real (non-buyback) swap.
        _reportTradeClose(key, config, delta);

        if (quoteSpecified) {
            // The fee was taken before the swap, out of the amount the swapper asked for. A swap that stops at
            // its price limit would leave them paying for the part that never traded, so it is rejected instead.
            uint256 asked = SignedMath.abs(params.amountSpecified);
            uint256 fee = _rememberedFee();
            uint256 traded = SignedMath.abs(config.quoteIsCurrency0 ? delta.amount0() : delta.amount1());
            if (traded != (exactInput ? asked - fee : asked + fee)) revert PartialSwap();
            return (IHooks.afterSwap.selector, 0);
        }

        int128 quoteDelta = config.quoteIsCurrency0 ? delta.amount0() : delta.amount1();
        uint256 amount = SignedMath.abs(quoteDelta);
        (uint256 tradeFee, uint256 creatorTax) =
            exactInput ? _feesFromGross(config, amount, false) : _feesOnTop(config, amount, true);

        uint256 total = tradeFee + creatorTax;
        if (total != 0) _accrue(key, config, tradeFee, creatorTax);

        return (IHooks.afterSwap.selector, total.toInt128());
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    /// @dev CLOSE hook (post-graduation): report the realized swap price to the competition vault so it can
    ///      evaluate market-cap eligibility. Price is expressed as pair-asset units per one whole (1e18) token —
    ///      the SAME convention as the bonding curve's `spotPrice()` — so the vault's USD math is identical in
    ///      both phases. Wrapped in try/catch so eligibility can NEVER block a swap (the engine is already
    ///      internally fail-safe; this is defence in depth).
    function _reportTradeClose(PoolKey calldata key, PoolConfig memory config, BalanceDelta delta) private {
        if (config.token == address(0)) return;
        uint256 quoteAbs = SignedMath.abs(config.quoteIsCurrency0 ? delta.amount0() : delta.amount1());
        uint256 tokenAbs = SignedMath.abs(config.quoteIsCurrency0 ? delta.amount1() : delta.amount0());
        if (tokenAbs == 0) return; // no token moved -> nothing to price
        uint256 priceInAsset = Math.mulDiv(quoteAbs, 1e18, tokenAbs);
        address competition = factory.competitionVault();
        if (competition == address(0)) return;
        address asset = Currency.unwrap(config.quoteIsCurrency0 ? key.currency0 : key.currency1);
        try IQualyraCompetitionVault(competition).onTradeClose(config.token, priceInAsset, asset) {} catch {}
    }

    /// @dev Fees as a share of `gross`, the full pair asset amount of the trade.
    function _feesFromGross(PoolConfig memory config, uint256 gross, bool isBuy)
        private
        view
        returns (uint256 tradeFee, uint256 creatorTax)
    {
        uint256 snipeBps = isBuy ? _snipeBps(config) : 0;
        tradeFee = Math.mulDiv(gross, QualyraFees.TRADE_FEE_BPS + snipeBps, QualyraFees.BPS);
        creatorTax = Math.mulDiv(gross, config.creatorTaxBps, QualyraFees.BPS);
    }

    /// @dev Fees added on top of `net` so they make up the same share of `net + fees` as a gross based fee would.
    function _feesOnTop(PoolConfig memory config, uint256 net, bool isBuy)
        private
        view
        returns (uint256 tradeFee, uint256 creatorTax)
    {
        uint256 snipeBps = isBuy ? _snipeBps(config) : 0;
        uint256 totalBps = QualyraFees.TRADE_FEE_BPS + snipeBps + config.creatorTaxBps;
        uint256 gross = Math.mulDiv(net, QualyraFees.BPS, QualyraFees.BPS - totalBps, Math.Rounding.Ceil);
        creatorTax = Math.mulDiv(gross, config.creatorTaxBps, QualyraFees.BPS);
        tradeFee = gross - net - creatorTax;
    }

    /// @dev Graduation can land inside the snipe window. The pool only sees the router as sender, so exemptions
    ///      are checked against the transaction origin: an exempt wallet covers every buy in its own transaction,
    ///      and an exempt smart contract wallet is not covered. The check can only lower the tax, and the window
    ///      is fifteen seconds from launch by default (governance-set, max sixty).
    function _snipeBps(PoolConfig memory config) private view returns (uint256 bps) {
        bps = QualyraFees.snipeTaxBps(config.launchedAt, config.snipeStartBps, config.snipeWindow, config.creatorTaxBps);
        if (bps != 0 && factory.isSnipeExempt(config.token, tx.origin)) bps = 0;
    }

    function _rememberFee(uint256 fee) private {
        bytes32 slot = CHARGED_FEE_SLOT;
        assembly ("memory-safe") {
            tstore(slot, fee)
        }
    }

    function _rememberedFee() private view returns (uint256 fee) {
        bytes32 slot = CHARGED_FEE_SLOT;
        assembly ("memory-safe") {
            fee := tload(slot)
        }
    }

    function _accrue(PoolKey calldata key, PoolConfig memory config, uint256 tradeFee, uint256 creatorTax) private {
        uint256 battleId = IQualyraCompetitionVault(factory.competitionVault()).feeBucketOf(config.token);

        Accrual storage accrual = accruedFees[config.token][battleId];
        accrual.tradeFee += tradeFee.toUint128();
        accrual.creatorTax += creatorTax.toUint128();

        Currency quote = config.quoteIsCurrency0 ? key.currency0 : key.currency1;
        poolManager.mint(address(this), quote.toId(), tradeFee + creatorTax);

        emit FeeAccrued(config.token, battleId, tradeFee, creatorTax);
    }
}

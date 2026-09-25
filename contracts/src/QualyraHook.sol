// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SignedMath} from "@openzeppelin/contracts/utils/math/SignedMath.sol";

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
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
///      The hook also keeps a time-weighted price per pool; the competition vault's eligibility rules run on it.
contract QualyraHook is IHooks, IUnlockCallback {
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;
    using StateLibrary for IPoolManager;

    struct PoolConfig {
        address token;
        bool quoteIsCurrency0;
        uint16 creatorTaxBps;
        uint16 snipeStartBps;
        uint16 snipeWindow;
        uint64 launchedAt;
        uint8 quoteDecimals;
    }

    struct Accrual {
        uint128 tradeFee;
        uint128 creatorTax;
    }

    /// @dev Time-weighted pool price of a token: whole pair asset units per whole token, as an 18-decimal fixed
    ///      point number whatever the asset's own decimals. The pool price only moves on swaps, so the sums are
    ///      exact integrals of the price over time: `currentSum` since the current
    ///      window began, `previousSum` over the whole previous window. `readyWindow` is the first window whose
    ///      previous window was observed from its start. The first slot changes on every swap, the second only
    ///      when a new window begins.
    struct PriceObservation {
        uint96 lastPrice;
        uint40 lastTime;
        uint120 currentSum;
        uint128 previousSum;
        uint32 readyWindow;
    }

    /// @notice The pool price is averaged over windows of this length, aligned to UTC. The average covers the last
    ///         full window and the current one so far, so it always spans between 30 and 60 minutes.
    uint256 public constant TWAP_WINDOW = 30 minutes;

    IPoolManager public immutable poolManager;
    IQualyraFactory public immutable factory;

    mapping(PoolId poolId => PoolConfig) public poolConfig;
    mapping(address token => mapping(uint256 battleId => Accrual)) public accruedFees;
    mapping(address token => PoolKey) private _poolKeys;
    mapping(address token => PriceObservation) private _observations;

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
            launchedAt: launch.launchedAt,
            quoteDecimals: factory.quoteAssetConfig(launch.quoteAsset).decimals
        });
        _poolKeys[token] = key;

        emit PoolRegistered(token, poolId);
    }

    function poolKeyOf(address token) external view returns (PoolKey memory) {
        return _poolKeys[token];
    }

    /// @notice Time-weighted pool price of `token` over the last full TWAP_WINDOW and the current one so far: whole
    ///         pair asset units per whole token, 18-decimal fixed point, whatever the asset's own decimals. `ready`
    ///         stays false until the pool has a full window of history, 30 to 60 minutes after graduation.
    ///         `updatedAt` is when the pool last traded.
    function twapOf(address token) external view returns (uint256 price18, bool ready, uint256 updatedAt) {
        PriceObservation memory o = _observations[token];
        if (o.lastTime == 0) return (0, false, 0);
        (uint256 previousSum, uint256 currentSum) = _sumsAt(o, block.timestamp);
        (price18, ready) = _average(previousSum, currentSum, o.readyWindow);
        updatedAt = o.lastTime;
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

    /// @dev Only the graduation executor can create pools that use this hook. The starting price opens the token's
    ///      price average.
    function beforeInitialize(address sender, PoolKey calldata key, uint160 sqrtPriceX96)
        external
        onlyPoolManager
        returns (bytes4)
    {
        PoolConfig memory config = poolConfig[key.toId()];
        if (sender != factory.graduationExecutor() || config.token == address(0)) revert Unauthorized();

        _observations[config.token] = PriceObservation({
            lastPrice: uint96(_capped(_toPrice18(sqrtPriceX96, config), type(uint96).max)),
            lastTime: uint40(block.timestamp),
            currentSum: 0,
            previousSum: 0,
            readyWindow: uint32(block.timestamp / TWAP_WINDOW + 2)
        });
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

        // Buybacks move the pool price like any other swap, so they update the average too. They pay no fees and
        // don't report to the eligibility engine.
        (uint256 averagePrice, bool ready) = _observe(key, config);
        if (sender == factory.buybackBurner()) return (IHooks.afterSwap.selector, 0);

        // Eligibility runs on the average price, once the pool has a full window of history. Placed before the
        // branch that may return early, so every real swap reports.
        if (ready) _reportTradeClose(key, config, averagePrice);

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

    /// @dev Reports the pool's average price to the competition vault, which runs the token's eligibility on it.
    ///      The price is whole pair asset units per whole token, 18-decimal fixed point. Wrapped in try/catch so
    ///      eligibility can never block a swap; the engine is fail-safe on its own, this is defence in depth.
    function _reportTradeClose(PoolKey calldata key, PoolConfig memory config, uint256 averagePrice) private {
        address competition = factory.competitionVault();
        if (competition == address(0)) return;
        address asset = Currency.unwrap(config.quoteIsCurrency0 ? key.currency0 : key.currency1);
        try IQualyraCompetitionVault(competition).onTradeClose(config.token, averagePrice, asset) {} catch {}
    }

    /// @dev Folds the price the pool held since the last swap into the sums, then records the price this swap left
    ///      behind. Later swaps in the same block add no time, so only the price a block closes at carries forward:
    ///      a price pushed and restored within one block never enters the average. Returns the average right after
    ///      the update. Never reverts, so it can't block a swap.
    function _observe(PoolKey calldata key, PoolConfig memory config) private returns (uint256 average, bool ready) {
        if (config.token == address(0)) return (0, false);

        PriceObservation memory o = _observations[config.token];
        // Pools always start one in beforeInitialize; this only guards against a pool that somehow didn't.
        if (o.lastTime == 0) o.readyWindow = uint32(block.timestamp / TWAP_WINDOW + 2);

        (uint256 previousSum, uint256 currentSum) = _sumsAt(o, block.timestamp);
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        o.lastPrice = uint96(_capped(_toPrice18(sqrtPriceX96, config), type(uint96).max));
        o.lastTime = uint40(block.timestamp);
        o.currentSum = uint120(_capped(currentSum, type(uint120).max));
        o.previousSum = uint128(_capped(previousSum, type(uint128).max));
        _observations[config.token] = o;

        return _average(previousSum, currentSum, o.readyWindow);
    }

    /// @dev The two sums carried forward to `time`, with the last price held since the last swap.
    function _sumsAt(PriceObservation memory o, uint256 time)
        private
        pure
        returns (uint256 previousSum, uint256 currentSum)
    {
        uint256 window = time / TWAP_WINDOW;
        uint256 lastWindow = o.lastTime / TWAP_WINDOW;
        uint256 price = o.lastPrice;
        if (window == lastWindow) return (o.previousSum, o.currentSum + price * (time - o.lastTime));

        uint256 windowStart = window * TWAP_WINDOW;
        // No swap since an earlier window: the last price held through the whole previous window.
        previousSum =
            window == lastWindow + 1 ? o.currentSum + price * (windowStart - o.lastTime) : price * TWAP_WINDOW;
        currentSum = price * (time - windowStart);
    }

    function _average(uint256 previousSum, uint256 currentSum, uint32 readyWindow)
        private
        view
        returns (uint256 average, bool ready)
    {
        if (block.timestamp / TWAP_WINDOW < readyWindow) return (0, false);
        return ((previousSum + currentSum) / (TWAP_WINDOW + block.timestamp % TWAP_WINDOW), true);
    }

    /// @dev Pool price as whole pair asset units per whole token, 18-decimal fixed point, the unit the competition
    ///      vault expects. Working in whole units keeps the precision the same for every asset: a 6-decimal asset
    ///      priced in its own smallest units would only have a hundred steps left at a $100k market cap.
    function _toPrice18(uint160 sqrtPriceX96, PoolConfig memory config) private pure returns (uint256 price) {
        uint256 q96 = FixedPoint96.Q96;
        // Smallest asset units per whole token, scaled by `up` to 18 decimals of the asset. Assets with more than 18
        // decimals are divided back down at the end. The factory caps decimals at 36.
        uint8 decimals = config.quoteDecimals;
        uint256 up = decimals < 18 ? 10 ** (18 - decimals) : 1;
        // The pool's price is currency1 per unit of currency0. With the pair asset as currency0 that is tokens per
        // asset unit, so it is inverted.
        price = config.quoteIsCurrency0
            ? Math.mulDiv(Math.mulDiv(1e18 * up, q96, sqrtPriceX96), q96, sqrtPriceX96)
            : Math.mulDiv(Math.mulDiv(sqrtPriceX96, sqrtPriceX96, q96), 1e18 * up, q96);
        if (decimals > 18) price /= 10 ** (decimals - 18);
    }

    /// @dev Saturates instead of reverting, so storing a price can't block a swap. Only prices far beyond any market
    ///      cap threshold reach the limits used here.
    function _capped(uint256 value, uint256 max) private pure returns (uint256) {
        return value > max ? max : value;
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

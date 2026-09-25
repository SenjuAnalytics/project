// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

import {QualyraLaunchToken} from "./QualyraLaunchToken.sol";
import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraHook} from "./interfaces/IQualyraHook.sol";
import {IQualyraCompetitionVault} from "./interfaces/IQualyraCompetitionVault.sol";

/// @title QualyraBuybackBurner
/// @notice Spends battle pots on the winning token through its Uniswap v4 pool and burns every token it buys.
/// @dev A pot is bought in tranches with a minimum gap between them, and a single tranche cannot raise the token
///      price by more than MAX_PRICE_IMPACT_BPS. Anyone can trigger a tranche, so the limit lives here instead of
///      being a caller argument. The cap is set to 5% so buybacks visibly move the price and are felt by the
///      market. Note this is a deliberate product trade-off: 5% sits above the 2% round-trip pool fee, so a
///      tranche is large enough that an MEV bot can sandwich it profitably (front-run, ride the buyback, sell).
///      Visible price support was chosen here over the tighter MEV resistance a sub-2% cap would give.
contract QualyraBuybackBurner is IUnlockCallback, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    struct Buyback {
        address asset;
        uint256 total;
        uint256 remaining;
    }

    uint256 public constant TRANCHES = 4;
    uint256 public constant TRANCHE_INTERVAL = 30 minutes;
    uint256 public constant MAX_PRICE_IMPACT_BPS = 500;
    uint256 private constant BPS = 10_000;

    IPoolManager public immutable poolManager;
    IQualyraFactory public immutable factory;
    /// @notice Replacement contract chosen during an emergency migration. Set at most once.
    address public successor;

    mapping(uint256 battleId => mapping(address token => Buyback)) public buybacks;
    /// @notice When the last tranche of `token` ran. Tracked per token, not per pot, so a token that won
    ///         several battles cannot have its pots bought in the same block.
    mapping(address token => uint256) public lastTrancheAt;
    /// @notice Balance per asset still reserved for buybacks.
    mapping(address asset => uint256) public accounted;

    event BuybackFunded(uint256 indexed battleId, address indexed token, address indexed asset, uint256 amount);
    event BuybackExecuted(
        uint256 indexed battleId, address indexed token, uint256 spent, uint256 burned, uint256 remaining
    );
    event Migrated(address indexed successor);
    event SweptToSuccessor(address indexed asset, uint256 amount);

    error Unauthorized();
    error NotPoolManager();
    error InvalidValue();
    error InvalidAsset();
    error FundsNotReceived();
    error CompetitionPaused();
    error CompetitionNotPaused();
    error NothingToBuy();
    error TooSoon();
    error AlreadyMigrated();
    error NotMigrated();
    error InvalidSuccessor();
    error NothingToSweep();

    constructor(IPoolManager poolManager_, IQualyraFactory factory_) {
        poolManager = poolManager_;
        factory = factory_;
    }

    /// @notice Receives a battle pot from the competition vault.
    function fund(uint256 battleId, address token, address asset, uint256 amount) external payable {
        if (msg.sender != factory.competitionVault()) revert Unauthorized();
        if (factory.getLaunch(token).quoteAsset != asset) revert InvalidAsset();
        if (asset == address(0)) {
            if (msg.value != amount) revert InvalidValue();
        } else if (msg.value != 0 || IERC20(asset).balanceOf(address(this)) < accounted[asset] + amount) {
            revert FundsNotReceived();
        }
        accounted[asset] += amount;

        Buyback storage buyback = buybacks[battleId][token];
        buyback.asset = asset;
        buyback.total += amount;
        buyback.remaining += amount;

        emit BuybackFunded(battleId, token, asset, amount);
    }

    /// @notice Buys the next tranche of `token` for `battleId` and burns it. Anyone can call it once
    ///         TRANCHE_INTERVAL has passed since the previous tranche.
    /// @dev When the price limit is reached first, only part of the tranche is spent and the rest stays for later.
    function executeBuyback(uint256 battleId, address token)
        external
        nonReentrant
        returns (uint256 spent, uint256 burned)
    {
        if (successor != address(0)) revert AlreadyMigrated();
        if (IQualyraCompetitionVault(factory.competitionVault()).paused()) revert CompetitionPaused();

        Buyback storage buyback = buybacks[battleId][token];
        uint256 left = buyback.remaining;
        if (left == 0) revert NothingToBuy();
        if (block.timestamp < lastTrancheAt[token] + TRANCHE_INTERVAL) revert TooSoon();
        lastTrancheAt[token] = block.timestamp;

        address asset = buyback.asset;
        uint256 amountIn = Math.min(left, Math.ceilDiv(buyback.total, TRANCHES));
        PoolKey memory key = IQualyraHook(factory.hook()).poolKeyOf(token);

        (spent, burned) = abi.decode(poolManager.unlock(abi.encode(key, asset, amountIn)), (uint256, uint256));

        buyback.remaining = left - spent;
        accounted[asset] -= spent;
        if (burned != 0) QualyraLaunchToken(token).burn(burned);

        emit BuybackExecuted(battleId, token, spent, burned, left - spent);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, address asset, uint256 amountIn) = abi.decode(data, (PoolKey, address, uint256));

        bool quoteIsCurrency0 = Currency.unwrap(key.currency0) == asset;
        BalanceDelta delta = poolManager.swap(
            key,
            SwapParams({
                zeroForOne: quoteIsCurrency0,
                amountSpecified: -SafeCast.toInt256(amountIn),
                sqrtPriceLimitX96: _priceLimit(key, quoteIsCurrency0)
            }),
            ""
        );

        (int128 quoteDelta, int128 tokenDelta) =
            quoteIsCurrency0 ? (delta.amount0(), delta.amount1()) : (delta.amount1(), delta.amount0());
        uint256 spent = SafeCast.toUint256(-int256(quoteDelta));
        uint256 bought = SafeCast.toUint256(int256(tokenDelta));

        if (spent != 0) {
            if (asset == address(0)) {
                poolManager.settle{value: spent}();
            } else {
                poolManager.sync(Currency.wrap(asset));
                IERC20(asset).safeTransfer(address(poolManager), spent);
                poolManager.settle();
            }
        }
        if (bought != 0) poolManager.take(quoteIsCurrency0 ? key.currency1 : key.currency0, address(this), bought);

        return abi.encode(spent, bought);
    }

    /// @notice Emergency exit, only while the competition vault is paused. Points this contract at a replacement,
    ///         permanently. Balances then move to it through `sweepToSuccessor` and no more buybacks run here.
    function migrate(address newBurner) external {
        if (msg.sender != factory.owner()) revert Unauthorized();
        if (!IQualyraCompetitionVault(factory.competitionVault()).paused()) revert CompetitionNotPaused();
        if (successor != address(0)) revert AlreadyMigrated();
        if (newBurner.code.length == 0) revert InvalidSuccessor();

        successor = newBurner;
        emit Migrated(newBurner);
    }

    /// @notice Sends the whole balance of `asset` to the successor. Anyone can call it after a migration.
    function sweepToSuccessor(address asset) external nonReentrant {
        address to = successor;
        if (to == address(0)) revert NotMigrated();
        uint256 amount = accounted[asset];
        if (amount == 0) revert NothingToSweep();

        accounted[asset] = 0;
        if (asset == address(0)) {
            Address.sendValue(payable(to), amount);
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
        emit SweptToSuccessor(asset, amount);
    }

    function remaining(uint256 battleId, address token) external view returns (uint256) {
        return buybacks[battleId][token].remaining;
    }

    /// @dev Square root price at which the token has become MAX_PRICE_IMPACT_BPS more expensive than now.
    function _priceLimit(PoolKey memory key, bool quoteIsCurrency0) private view returns (uint160) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());
        uint256 factor = Math.sqrt((BPS + MAX_PRICE_IMPACT_BPS) * 1e36 / BPS);

        // With the pair asset as currency0 the pool price is tokens per pair asset, so it falls as the token
        // gets more expensive. Otherwise it is pair asset per token and rises.
        uint256 limit = quoteIsCurrency0
            ? FullMath.mulDiv(sqrtPriceX96, 1e18, factor)
            : FullMath.mulDiv(sqrtPriceX96, factor, 1e18);

        if (limit <= TickMath.MIN_SQRT_PRICE) return TickMath.MIN_SQRT_PRICE + 1;
        if (limit >= TickMath.MAX_SQRT_PRICE) return TickMath.MAX_SQRT_PRICE - 1;
        return SafeCast.toUint160(limit);
    }
}

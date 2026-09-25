// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IQualyraFactory} from "./interfaces/IQualyraFactory.sol";
import {IQualyraBondingCurve} from "./interfaces/IQualyraBondingCurve.sol";

/// @title QualyraLaunchRouter
/// @notice Launches a token and makes the creator's first buy in the same transaction, so nobody can buy
///         between the two. The creator is exempt from the snipe tax on their own launch.
contract QualyraLaunchRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IQualyraFactory public immutable factory;

    event LaunchedAndBought(address indexed token, address indexed creator, uint256 amountIn, uint256 tokensOut);

    error InvalidValue();
    error Unauthorized();

    constructor(IQualyraFactory factory_) {
        factory = factory_;
    }

    /// @dev Only accepts refunds from Qualyra curves.
    receive() external payable {
        if (factory.curveOf(IQualyraBondingCurve(msg.sender).token()) != msg.sender) revert Unauthorized();
    }

    /// @notice Creates a launch for the caller and buys with `amountIn` of its pair asset.
    /// @dev `msg.value` is the launch fee, plus `amountIn` when the pair asset is ETH. ERC-20 pair assets need an
    ///      allowance for this router. Anything the curve does not use is returned to the caller.
    function launchAndBuy(IQualyraFactory.LaunchParams calldata params, uint256 amountIn, uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (address token, address curve, uint256 tokensOut)
    {
        uint256 launchFee = factory.launchFee();
        bool payInEth = params.quoteAsset == address(0);
        if (msg.value != launchFee + (payInEth ? amountIn : 0)) revert InvalidValue();

        (token, curve) = factory.launchTokenFor{value: launchFee}(msg.sender, params);
        if (amountIn == 0) return (token, curve, 0);

        if (payInEth) {
            uint256 balanceBefore = address(this).balance - amountIn;
            tokensOut = IQualyraBondingCurve(curve).buy{value: amountIn}(amountIn, minTokensOut, msg.sender, block.timestamp);

            uint256 refund = address(this).balance - balanceBefore;
            if (refund != 0) Address.sendValue(payable(msg.sender), refund);
        } else {
            IERC20 quote = IERC20(params.quoteAsset);
            uint256 balanceBefore = quote.balanceOf(address(this));
            quote.safeTransferFrom(msg.sender, address(this), amountIn);
            quote.forceApprove(curve, amountIn);
            tokensOut = IQualyraBondingCurve(curve).buy(amountIn, minTokensOut, msg.sender, block.timestamp);

            uint256 refund = quote.balanceOf(address(this)) - balanceBefore;
            if (refund != 0) quote.safeTransfer(msg.sender, refund);
        }

        emit LaunchedAndBought(token, msg.sender, amountIn, tokensOut);
    }
}

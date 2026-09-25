'use client'

// Gas fees for write calls.
//
// Wallets estimate fees from their own heuristics, which are tuned for mainnet-style chains. On an
// Arbitrum Orbit chain like Robinhood Chain that estimate comes out below the block base fee often enough
// that the RPC rejects the transaction outright with "max fee per gas less than block base fee" — before the
// contract is ever reached. Reading the fee from the chain and passing it explicitly removes the guesswork,
// which is why the same call succeeds from forge and fails from a wallet.

import { getPublicClient } from '@wagmi/core'

import { wagmiConfig } from './wagmi'

/** EIP-1559 fields only: both Robinhood Chain networks are Arbitrum Orbit, which is 1559. */
export type FeeOverrides = { maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }

/**
 * Current fee settings for `chainId`, with room for the base fee to rise before the transaction lands.
 * Returns an empty object when the chain cannot be reached, which leaves the wallet's own estimate in place.
 */
export async function feeOverrides(chainId: number): Promise<FeeOverrides> {
  try {
    const client = getPublicClient(wagmiConfig, { chainId: chainId as 4663 | 46630 })
    if (!client) return {}

    const block = await client.getBlock()
    const baseFee = block.baseFeePerGas ?? (await client.getGasPrice())

    let priorityFee = 0n
    try {
      priorityFee = await client.estimateMaxPriorityFeePerGas()
    } catch {
      // Orbit chains often have no priority fee market at all; zero is the right answer there.
      priorityFee = 0n
    }

    // Double the base fee: it can rise between this read and inclusion, and any excess is refunded.
    return { maxFeePerGas: baseFee * 2n + priorityFee, maxPriorityFeePerGas: priorityFee }
  } catch {
    return {}
  }
}

/** Turns a wallet or RPC failure into something worth showing a person. */
export function describeTxError(err: unknown): { title: string; detail: string } {
  const message = err instanceof Error ? err.message : String(err)

  if (/user rejected|denied transaction|user denied/i.test(message)) {
    return { title: 'Transaction cancelled', detail: 'You dismissed the wallet prompt.' }
  }
  if (/max fee per gas less than block base fee|fee cap less than block base fee/i.test(message)) {
    return {
      title: 'Gas price too low',
      detail:
        'The wallet offered less than the current block base fee. Try again — the fee is now read from the chain rather than estimated by the wallet.',
    }
  }
  if (/insufficient funds/i.test(message)) {
    return { title: 'Not enough ETH', detail: 'The wallet cannot cover the amount plus gas on this chain.' }
  }
  if (/nonce too low|already known|replacement transaction underpriced/i.test(message)) {
    return {
      title: 'Transaction already pending',
      detail: 'One is still in flight from this wallet. Wait for it, or reset the account in the wallet settings.',
    }
  }
  if (/chain mismatch|does not match the target chain/i.test(message)) {
    return { title: 'Wrong network', detail: 'Switch the wallet to the network Qualyra is deployed on.' }
  }

  // Keep a revert readable: the first line carries the reason, the rest is a stack.
  return { title: 'Transaction failed', detail: message.split('\n')[0].slice(0, 200) }
}

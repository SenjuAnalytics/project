'use client'

// Launching a token on chain.
//
// Two paths, picked by whether the creator wants a first buy. Without one the factory is called directly.
// With one the router does both in a single transaction, so nobody can buy between the launch and the
// creator's own purchase.

import { useCallback } from 'react'
import { useAccount, useChainId, useReadContract, useWriteContract } from 'wagmi'
import { readContract, waitForTransactionReceipt } from '@wagmi/core'
import { decodeEventLog, erc20Abi, formatEther, maxUint256, parseUnits, type Address, type Hash } from 'viem'

import { wagmiConfig } from './wagmi'
import { feeOverrides } from './gas'
import {
  qualyraFactoryAbi,
  qualyraLaunchRouterAbi,
  qualyraDeployment,
  isDeployed,
  resolveTargetChainId,
  NATIVE_PAIR_ASSET,
} from './contracts'

export type LaunchRequest = {
  name: string
  symbol: string
  /** Anything the interface wants to keep with the token: image, description, links. */
  metadataURI: string
  quoteAsset: Address
  quoteDecimals: number
  /** Creator tax in percent, 0 to 5. Converted to basis points here. */
  creatorTaxPercent: number
  /** Empty to receive fees in the creator's own wallet. */
  creatorFeeRecipient?: string
  snipeExempt: Address[]
  /** Creator's first buy, in whole units of the pair asset. Empty or zero to skip it. */
  firstBuy?: string
}

export type LaunchResult = {
  hash: Hash
  /** The launched token, read out of the TokenLaunched event. */
  token?: Address
  curve?: Address
}

export type LaunchActions = {
  launch: (request: LaunchRequest) => Promise<LaunchResult>
  /** False when the platform has no factory on this chain. */
  available: boolean
  isPending: boolean
}

/** The factory's launch fee as shown to the creator, e.g. "0.0005 ETH". Null until read. */
export function useLaunchFee(): string | null {
  const chainId = resolveTargetChainId(useChainId())
  const factory = qualyraDeployment(chainId)?.factory
  const { data } = useReadContract({
    address: factory,
    chainId,
    abi: qualyraFactoryAbi,
    functionName: 'launchFee',
    query: { enabled: isDeployed(factory) },
  })
  // Paid in ETH whatever the pair asset is.
  return data === undefined ? null : `${formatEther(data as bigint)} ETH`
}

export function useQualyraLaunch(): LaunchActions {
  const chainId = useChainId()
  const { address } = useAccount()
  const { writeContractAsync, isPending } = useWriteContract()

  const deployment = qualyraDeployment(chainId)
  const factory = deployment?.factory
  const router = deployment?.launchRouter

  const launch = useCallback(
    async (request: LaunchRequest): Promise<LaunchResult> => {
      if (!address) throw new Error('Connect a wallet first.')
      if (!isDeployed(factory)) throw new Error('Qualyra is not deployed on this network.')

      const recipient = request.creatorFeeRecipient?.trim()
      if (recipient && !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
        throw new Error('The fee recipient is not a valid address.')
      }

      const params = {
        name: request.name,
        symbol: request.symbol,
        metadataURI: request.metadataURI,
        quoteAsset: request.quoteAsset,
        creatorTaxBps: Math.round(request.creatorTaxPercent * 100),
        creatorFeeRecipient: (recipient || NATIVE_PAIR_ASSET) as Address,
        snipeExempt: request.snipeExempt,
      } as const

      // The launch fee is always paid in ETH, whatever the pair asset is.
      const fee = (await readContract(wagmiConfig, {
        address: factory!,
        abi: qualyraFactoryAbi,
        functionName: 'launchFee',
      })) as bigint

      // Read the fee from the chain rather than trusting the wallet's estimate.
      const fees = await feeOverrides(chainId)

      const firstBuy = request.firstBuy ? Number(request.firstBuy) : 0
      const wantsFirstBuy = firstBuy > 0 && isDeployed(router)
      const amountIn = wantsFirstBuy ? parseUnits(request.firstBuy!, request.quoteDecimals) : 0n
      const nativeQuote = request.quoteAsset === NATIVE_PAIR_ASSET

      let hash: Hash

      if (wantsFirstBuy) {
        // An ERC-20 pair asset has to be approved to the router before it can pull the first buy.
        if (!nativeQuote) {
          const hashApprove = await writeContractAsync({
            address: request.quoteAsset,
            abi: erc20Abi,
            functionName: 'approve',
            args: [router!, maxUint256],
            ...fees,
          })
          await waitForTransactionReceipt(wagmiConfig, { hash: hashApprove })
        }

        hash = await writeContractAsync({
          address: router!,
          abi: qualyraLaunchRouterAbi,
          functionName: 'launchAndBuy',
          // The curve opens empty, so the amount out is deterministic and needs no slippage bound.
          args: [params, amountIn, 0n],
          value: nativeQuote ? fee + amountIn : fee,
          ...fees,
        })
      } else {
        hash = await writeContractAsync({
          address: factory!,
          abi: qualyraFactoryAbi,
          functionName: 'launchToken',
          args: [params],
          value: fee,
          ...fees,
        })
      }

      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })

      // The token address is only knowable from the receipt, since it is deployed with CREATE2 in this tx.
      let token: Address | undefined
      let curve: Address | undefined
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: qualyraFactoryAbi, data: log.data, topics: log.topics })
          if (decoded.eventName === 'TokenLaunched') {
            const args = decoded.args as unknown as { token: Address; curve: Address }
            token = args.token
            curve = args.curve
            break
          }
        } catch {
          // Logs from the other contracts in this transaction do not decode against the factory ABI.
        }
      }

      return { hash, token, curve }
    },
    [address, chainId, factory, router, writeContractAsync],
  )

  return { launch, available: isDeployed(factory), isPending }
}

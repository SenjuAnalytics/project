#!/usr/bin/env node
// Copies the ABI of every contract the frontend talks to out of the Foundry build and into
// frontend/lib/abis (TypeScript, for wagmi's type inference) and contracts/abi (plain JSON).
//
//   cd contracts && forge build
//   node scripts/sync-abi.mjs
//
// Both outputs are generated. Edit the contracts and re-run this instead of editing either.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = join(root, 'contracts', 'out')
const tsDir = join(root, 'frontend', 'lib', 'abis')
const jsonDir = join(root, 'contracts', 'abi')

const CONTRACTS = [
  ['QualyraFactory', 'qualyraFactoryAbi', 'Launches, pair asset list and the per-token registry.'],
  ['QualyraLaunchRouter', 'qualyraLaunchRouterAbi', "Launch plus the creator's first buy in one transaction."],
  ['QualyraBondingCurve', 'qualyraBondingCurveAbi', 'Primary market of one launch, before graduation.'],
  ['QualyraLaunchToken', 'qualyraLaunchTokenAbi', 'ERC-20 of a launched token.'],
  ['QualyraHook', 'qualyraHookAbi', 'Pool fees and pool key of a graduated token.'],
  ['QualyraFeeVault', 'qualyraFeeVaultAbi', 'Creator and treasury balances, and withdrawals.'],
  ['QualyraCompetitionVault', 'qualyraCompetitionVaultAbi', 'Battles, weekly league, results and claims.'],
  ['QualyraBuybackBurner', 'qualyraBuybackBurnerAbi', 'Battle pots being spent and burned.'],
  ['QualyraSwapRouter', 'qualyraSwapRouterAbi', 'Exact-input swaps against a graduated pool.'],
]

if (!existsSync(buildDir)) {
  console.error(`No build found at ${buildDir}. Run "forge build" in contracts/ first.`)
  process.exit(1)
}

mkdirSync(tsDir, { recursive: true })
mkdirSync(jsonDir, { recursive: true })

const header = '// Generated from contracts/out by scripts/sync-abi.mjs — do not edit by hand.'
const camel = (name) => name[0].toLowerCase() + name.slice(1)
const exports = []

for (const [contract, exportName, doc] of CONTRACTS) {
  const artifact = join(buildDir, `${contract}.sol`, `${contract}.json`)
  if (!existsSync(artifact)) {
    console.error(`Missing artifact for ${contract}. Run "forge build" in contracts/ first.`)
    process.exit(1)
  }

  const { abi } = JSON.parse(readFileSync(artifact, 'utf8'))
  abi.sort((a, b) => (a.type ?? '').localeCompare(b.type ?? '') || (a.name ?? '').localeCompare(b.name ?? ''))

  const body = JSON.stringify(abi, null, 2)
  writeFileSync(join(jsonDir, `${contract}.json`), `${body}\n`)

  const file = camel(contract)
  writeFileSync(
    join(tsDir, `${file}.ts`),
    `// ${contract} ABI. ${header.slice(3)}\n// ${doc}\nexport const ${exportName} = ${body} as const\n`,
  )
  exports.push(`export { ${exportName} } from './${file}'`)
  console.log(`${contract}: ${abi.length} entries`)
}

writeFileSync(join(tsDir, 'index.ts'), `${header}\n${exports.join('\n')}\n`)
console.log(`\nWrote ${CONTRACTS.length} ABIs to frontend/lib/abis and contracts/abi.`)

# Dependency lock — reproducible build (Qualyra)

Pinned for audit reproducibility. Every dependency is locked to an **exact commit**.

## Toolchain
- **solc** `0.8.26`, **EVM** `cancun`, optimizer **on** (`200` runs), `bytecode_hash = "none"` (see `foundry.toml`)
- **Foundry**: `forge 1.8.3` (recommended)

## Pinned dependencies
| Package | Version | Commit (authoritative) | Source |
|---|---|---|---|
| forge-std | dev | `0d006dafa09d0b3722575acd29338b79c23e7c2f` | https://github.com/foundry-rs/forge-std |
| openzeppelin-contracts | `5.7.0` (package.json) | `dab7110e71f28d236d8bee4315aeadaa634bc54f` | https://github.com/OpenZeppelin/openzeppelin-contracts |
| v4-periphery | `1.0.4` | `a7af5b345b479b05fde9182d7e40913a73b3e18f` | https://github.com/Uniswap/v4-periphery |
| v4-core | `1.0.2` | `59d3ecf53afa9264a16bba0e38f4c5d2231f80bc` | https://github.com/Uniswap/v4-core (submodule of v4-periphery) |
| permit2 | dev | `cc56ad0f3439c502c246fc5cfcc3db92bb8b7219` | https://github.com/Uniswap/permit2 (submodule of v4-periphery) |

> The **commit** is authoritative. Version labels come from each repo's `package.json` and are informational.

## Restore the exact tree
- macOS/Linux: `bash script/install-deps.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File script/install-deps.ps1`

Then: `forge build && forge test`.

## Reproducibility gap (action required)
`lib/` is currently **not committed** to git and **not** a submodule, so a fresh `git clone` will **not** include dependencies. Pick one:
1. Run the restore script above (fastest), **or**
2. Commit `lib/` into the repo (vendored — friend/auditor gets an exact copy on clone), **or**
3. Convert to git submodules pinned to the commits above (`git submodule add … && git checkout <commit>`).

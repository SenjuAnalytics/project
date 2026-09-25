# Reproducible dependency restore for Qualyra (Windows). Pins each lib to its exact audited commit.
# See DEPENDENCIES.md for the lock table.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Clone-At($url, $dir, $commit) {
  if (-not (Test-Path (Join-Path $dir '.git'))) {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    git clone $url $dir
  }
  git -C $dir fetch --all --tags --quiet
  git -C $dir checkout --quiet $commit
  Write-Output "pinned $dir -> $commit"
}

Clone-At 'https://github.com/foundry-rs/forge-std'                'lib/forge-std'              '0d006dafa09d0b3722575acd29338b79c23e7c2f'
Clone-At 'https://github.com/OpenZeppelin/openzeppelin-contracts' 'lib/openzeppelin-contracts' 'dab7110e71f28d236d8bee4315aeadaa634bc54f'
Clone-At 'https://github.com/Uniswap/v4-periphery'               'lib/v4-periphery'           'a7af5b345b479b05fde9182d7e40913a73b3e18f'
git -C lib/v4-periphery submodule update --init --recursive
Clone-At 'https://github.com/Uniswap/v4-core' 'lib/v4-periphery/lib/v4-core' '59d3ecf53afa9264a16bba0e38f4c5d2231f80bc'
Clone-At 'https://github.com/Uniswap/permit2' 'lib/v4-periphery/lib/permit2' 'cc56ad0f3439c502c246fc5cfcc3db92bb8b7219'

Write-Output 'All dependencies pinned. Next: forge build && forge test'

/**
 * _fixtureEnv.mjs — offline-test environment pin.
 * -----------------------------------------------------------------------------
 * PIN deployment-derived config to STABLE literals so the offline determinism /
 * verify tests are INDEPENDENT of any (re)deploy.
 *
 * config.ts now reads PAIR_ASSETS.USDG.address from deployments/<chainId>.json
 * (single source of truth). Without this pin, deploying a new testnet USDG would
 * change that address and silently drift the hard-coded snapshot hashes in
 * determinism.test.mjs — the exact "a redeploy breaks it unnoticed" trap we are
 * removing from the live pipeline. Fixture hashes must depend only on the fixture.
 *
 * MUST be imported FIRST (before ../src/config.ts) in every test so the env is
 * already set when config.ts is evaluated. `??=` lets a caller override it.
 */
process.env.INDEXER_USDG_ADDRESS ??= "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";

# Qualyra — Catatan Verifikasi Pra-Mainnet

> Tanggal verifikasi: **2026-09-17**
> Jaringan target: **Robinhood Chain** (chain id `4663` / `0x1237`, RPC `https://rpc.mainnet.chain.robinhood.com`)
> Metode: pemanggilan JSON-RPC langsung (`eth_chainId`, `eth_getCode`, `eth_call`) + telaah kode `script/DeployQualyra.s.sol`.

Dokumen ini menjawab kritik kesiapan deploy dengan **bukti on-chain**, bukan asumsi. Legenda status:

- ✅ **Terverifikasi benar** — sudah dicek langsung, aman dipakai.
- ⚠️ **Masih terbuka** — perlu data / langkah tambahan.
- ⛔ **Blocker** — wajib beres sebelum mainnet.

---

## ⭐ Ringkasan Eksekutif Lengkap v2 (2026-09-18)

> Ringkasan menyeluruh seluruh review (on-chain + kode + snipe + build/test). Isi lama (§1–§9 di bawah) tetap dipertahankan.

### §0. Konteks proyek
**Qualyra** = token launchpad di **Robinhood Chain** (chain id 4663), dimodelkan langsung dari **Pons V2**. 9 kontrak inti + 2 per-launch (token & curve). Alur: launch → trade di bonding curve → graduation ke pool **Uniswap v4** (liquidity terkunci permanen) → kompetisi (Token League battle + Trader League mingguan) → buyback-burn. **Non-upgradeable** → setiap kesalahan permanen.

### §1. Verifikasi on-chain (`rpc.mainnet.chain.robinhood.com`) — semua ✅
| Item | Hasil | Status |
|---|---|---|
| Chain ID | `4663` (`0x1237`) via `eth_chainId` | ✅ |
| Uniswap v4 **PoolManager** `0x8366…40951` | `eth_getCode` = bytecode v4 asli (selektor `unlock/swap/modifyLiquidity/take/settle` cocok) | ✅ |
| PoolManager dipakai **Pons V2** | `poolManager()` factory Pons → alamat sama persis | ✅ konfirmasi ganda |
| **CREATE2 deployer** `0x4e59b448…4956C` | = proxy Arachnid deterministic-deployment kanonik | ✅ |
| **USDG** `0x5fc5…d168` | `name()`="Global Dollar", `symbol()`="USDG" | ✅ |
| **USDG desimal** | `decimals()` = **6** (bukan 18) | ✅ |
| USDG bentuk | proxy EIP-1967 (upgradeable) | ✅ (catat: bisa berubah) |
| Pons V2 factory `0x7eD5…EC7e` | Ada, Ownable2Step, wired ke PoolManager v4 | ✅ |
| Pons V1 factory `0xA5aA…1feB` | Ada, tapi `poolManager()` **revert** → legacy | ⚠️ legacy |

#### §1b. Token saham Robinhood — verifikasi on-chain + economics Pons (2026-09-18) ✅
Dibaca langsung via `eth_call`: `decimals()`, `symbol()`, `name()` tiap token, dan `pairTokenEconomics(address)` di factory Pons `0x7eD5…EC7e`. **Semua 7 token 18 desimal**; rasio `phantomQuote/graduationThreshold` = **0.40** (sama seperti basis ETH `1.68/4.2`). UI Pons cocok persis (NVDA 41.6, SPCX 72.2).

| Token | Alamat | `decimals()` | `phantomQuote` (wei) | `graduationThreshold` (wei) | Graduate (unit) |
|---|---|---|---|---|---|
| **NVDA** | `0xd0601CE1…20D9EEC` | 18 | `16640000000000000000` | `41600000000000000000` | 41.6 |
| **AAPL** | `0xaF3D76f1…f8a93f9` | 18 | `9680000000000000000` | `24200000000000000000` | 24.2 |
| **SPY** | `0x117cc213…2B3B4C0C` | 18 | `4360000000000000000` | `10900000000000000000` | 10.9 |
| **GOOGL** | `0x2e0847E8…ADAD4FE3` | 18 | `9680000000000000000` | `24200000000000000000` | 24.2 |
| **GME** | `0x1b0E319c…11c153E` | 18 | `147600000000000000000` | `369000000000000000000` | 369 |
| **SPCX** | `0x4a0E65A3…Fae35eEa` | 18 | `28880000000000000000` | `72200000000000000000` | 72.2 |
| **SGOV** | `0x92FD6652…DE86F9B5` | 18 | `41126623402476410529` | `102816558506191026323` | 102.816558506191026323 |

> **SGOV non-bulat**: nilai on-chain `102816558506191026323` ÷ 1e18 = `102.816558506191026323`; UI Pons menampilkan `102.816559` (pembulatan 6-desimal). Disimpan dalam unit SGOV (18 desimal), **bukan** dalam USDG/"Global". Disalin sebagai integer utuh.

### §2. Verifikasi kode (`DeployQualyra.s.sol` + `QualyraFactory`) ✅
| Item | Nilai | Status |
|---|---|---|
| CREATE2 constant | `0x4e59b448…4956C` | ✅ cocok on-chain |
| Graduation target ETH | `ETH_THRESHOLD = 4.2 ether` (phantom `1.68`) | ✅ konstanta Qualyra sendiri |
| Graduation target USDG | `USDG_THRESHOLD = 8_090e6` (phantom `3_236e6`) | ✅ 6-desimal benar |
| Launch fee | `0.0005 ether`, maks `0.05`, dipaksa `msg.value==launchFee` | ✅ |
| Trade fee | `TRADE_FEE_BPS = 100` (1%) | ✅ |
| Hook | CREATE2 + HookMiner + guard `HookAddressMismatch` | ✅ |
| Ownership | `transferOwnership(timelock)` 2-langkah | ✅ |

### §3. Snipe tax — Pons V2 vs Qualyra (source & kode kedua sisi) ✅
| Aspek | Pons V2 | Qualyra | Verdict |
|---|---|---|---|
| Snipe start | global, `onlyOwner`, snapshot per-launch | sama | ✅ identik |
| Ceiling start / window / exempt | 99% / 60s / 32 | `9_900` / `60` / `32` | ✅ identik |
| **Default window** | **15 detik** | **15 detik** | ✅ **identik (disamakan 5→15)** |
| Default start | 99% | `snipeStartBps=9_900` | ✅ identik |
| Selalu aktif di window? | ya, tak digantung dev-buy | ya | ✅ sama |
| Auto-exempt | deployer + feeRecipient (+≤32) | `creator` + `recipient` (+ loop `snipeExempt` ≤32) | ✅ identik |
| Rumus peluruhan | `startBps >> (elapsed*14/window)` | `QualyraFees.snipeTaxBps` (persis + cap `MIN_BUYER_SHARE`) | ✅ identik |
| Alokasi token creator | 0, semua ke curve | `_mint(holder,supply)`→`safeTransfer(curve,supply)` = 100% ke curve | ✅ identik |
| Routing fee | snipe → bucket base-fee, ~70% creator | `_sendFees(tradeFee+snipeTax, creatorTax)` | ✅ terkonfirmasi **70/15/15** dari kode (§ Fee-Split Routing) |

**Verdict:** snipe tax Qualyra **setia ke Pons**, bukan divergensi berbahaya.

### §4. Perubahan yang sudah dikerjakan
| File | Perubahan |
|---|---|
| `src/QualyraFactory.sol` | `snipeWindow` **5 → 15** (paritas Pons) |
| `test/utils/LaunchTestBase.sol` | pin `setSnipeParams(9_900, 5)` (determinisme tes lama) |
| `test/utils/SystemTestBase.sol` | pin `setSnipeParams(9_900, 5)` |
| `test/QualyraLaunch.t.sol` | + `test_defaultSnipeParamsMatchPons()` (assert window==15) |
| `src/QualyraBuybackBurner.sol` | `MAX_PRICE_IMPACT_BPS` **100 → 500** (cap buyback 1% → 5%, biar pergerakan terasa) |
| `src/QualyraBuybackBurner.sol` | `TRANCHES` **10 → 4** (tiap tranche = 25% pot → lebih sering mentok cap 5%) |
| `test/QualyraBuyback.t.sol` | cap test → `1.05e18` (5%); tranche test → `spent 0.0375 ETH`, 4 putaran |
| `test/QualyraEndToEnd.t.sol` | loop buyback `10 → 4` (pot 0.045 ETH habis dalam 4 tranche) |
| `test/QualyraAttacks.t.sol` | `testFuzz_sandwichingABuybackLosesMoney` → `test_sandwichingABuybackCanProfitAtFivePercentCap` (pin & dokumentasi trade-off MEV, lihat §7) |
| `src/QualyraFactory.sol` + `src/interfaces/IQualyraFactory.sol` | **Guard desimal quote asset (paritas Pons)** — `setQuoteAsset` wajib arg `expectedDecimals`; `QuoteAssetConfig` menyimpan `decimals`; floor **≥ 6** (`MIN_QUOTE_ASSET_DECIMALS`); ERC-20 divalidasi `.decimals()` on-chain (`QuoteAssetDecimalsMismatch`/`QuoteAssetDecimalsUnavailable`), ETH wajib `18` (lihat §7) |
| 7 call-site `setQuoteAsset` (deploy script + test bases + pool test) | + arg desimal: ETH `18`, USDG/mock `6` |
| `test/QualyraQuoteAsset.t.sol` | **baru** — 6 test guard desimal (mismatch, floor <6, `decimals()` tak terbaca, ETH≠18, happy-path simpan `decimals`) |
| `script/DeployQualyra.s.sol` | **Daftar 7 token saham Robinhood (paritas Pons, 2026-09-18)** — konstanta alamat NVDA/AAPL/SPY/GOOGL/GME/SPCX/SGOV + `setQuoteAsset(...)` tiap token dengan `phantomQuote`/`graduationThreshold` **persis dari `pairTokenEconomics` on-chain Pons** (18 desimal). Di-gate `if (block.chainid == 4663)` (alamat hanya ber-code di Robinhood Chain; test EVM aman dilewati) |
| `test/QualyraStockQuoteAsset.t.sol` | **baru** — 2 test: `checkEconomics` **NYATA** (executor asli via `SystemTestBase`) menerima ke-7 nilai Pons + invariant rasio `0.40` |
| `script/DeployQualyra.s.sol` | **Pre-flight checks + pencocokan `env` byte-for-byte (2026-09-18)** — `_preflight(config)` di awal `deploy()`: alamat wajib ≠ `0`, `POOL_MANAGER.code>0`, USDG (bila diisi) ber-code & `decimals()==6`; pada `chainid==4663` cocokkan `POOL_MANAGER`/`USDG` **byte-for-byte** ke konstanta kanonik (`RBH_POOL_MANAGER 0x8366…40951`, `RBH_USDG 0x5fc5…d168`) + pastikan CREATE2 deployer & 7 token saham ber-code; post-condition `pendingOwner()==timelock`. Tambah interface `IERC20Decimals` + konstanta `RBH_*`/`USDG_DECIMALS` |
| `test/DeployQualyraFork.t.sol` | **baru** — dry-run `deploy()` penuh di **fork Robinhood Chain (4663)**; di-skip kecuali `ROBINHOOD_RPC_URL` diset (offline-safe). Melatih semua pre-flight + byte-for-byte + `setQuoteAsset` (7 saham 18-des, ETH, USDG 6-des) terhadap state on-chain nyata |
| `postman/collections/Robinhood Chain - Pre-Deploy Verification (chain 4663)/` | **baru** — collection lokal (tersimpan di repo git, portabel antar akun): 9 request JSON-RPC (`eth_chainId`, `eth_getCode`, `pairTokenEconomics` ×7) + 56 assertion; membuktikan chain 4663, Pons factory ber-code, economics 7 token (18 des, wei persis, rasio 0.40) |

### §5. Build & Test (sesi 2026-09-18) — ✅
| Item | Hasil |
|---|---|
| Foundry | `forge 1.8.3` terpasang (foundryup) |
| Dependencies | `lib/` diisi: forge-std, OpenZeppelin, v4-periphery (+v4-core, permit2) — sebelumnya kosong, tanpa `.gitmodules` |
| `forge build` | **0 error** (hanya warning lint `block.timestamp`) |
| `forge test` | **108 pass / 0 fail / 0 skip** (11 suite + invariant), termasuk `test_defaultSnipeParamsMatchPons`, `test_buy_snipeTaxDecays`, `test_buy_snipeTaxCappedWithCreatorTax` |
| `forge test` (sesi buyback 5%, 2026-09-18) | **105 pass / 0 fail / 0 skip** setelah `MAX_PRICE_IMPACT_BPS 5%` + `TRANCHES 4` + test sandwich didokumentasikan ulang (lihat §7) |
| `forge test` (sesi guard desimal, 2026-09-18) | **111 pass / 0 fail / 0 skip** (12 suite) setelah guard desimal quote asset + `QualyraQuoteAsset.t.sol` (6 test baru) |
| `forge test` (sesi token saham, 2026-09-18) | **113 pass / 0 fail / 0 skip** (13 suite) setelah daftar 7 token saham + `QualyraStockQuoteAsset.t.sol` (2 test baru); compile bersih tanpa warning; `checkEconomics` asli menerima semua nilai Pons |
| `forge test` (sesi pre-flight + dry-run fork, 2026-09-18) | **114 pass / 0 fail / 0 skip** (14 suite) setelah pre-flight/byte-for-byte di deploy script + `DeployQualyraFork.t.sol` (di-skip offline). Compile bersih |
| `forge test --match-contract DeployQualyraForkTest` (fork 4663 **nyata**) | **1 pass / 0 fail** — deploy penuh (9 kontrak + mining hook) tersimulasi di atas Robinhood Chain nyata; semua pre-flight + byte-for-byte lolos terhadap state on-chain (`DRY-RUN OK`) |

### §6. Koreksi jujur sepanjang review
- ❗ Riset web awal keliru ("Pons pakai *structural caps*, tanpa pajak, tanpa whitelist"). **Source asli Pons membantahnya**: pajak snipe 99%, exemption dideklarasikan creator, creator auto-exempt.
- ❗ Sempat bilang "Qualyra mungkin tidak auto-exempt creator" — **salah**, kodenya sudah melakukannya (`_launch` 342–345).
- ❗ Sempat menandai item paritas B "belum dipastikan" — **salah**, ternyata sudah terbukti di kode (§3).
- **Pelajaran: verifikasi ke kontrak > tebakan web.**

### §7. Catatan penting (risiko/perilaku)
- ✅ **Model fee creator = MANUAL CLAIM (pull), paritas Pons — TERBUKTI ON-CHAIN (2026-09-18).** Pons pakai modul escrow terpisah `PonsV2FeeEscrow` (`0xd3aFeb2a57f70EF218aA82451C51B2fb0416AC9e`): decode bytecode dispatcher-nya menemukan `claim()` (`0x4e71d92d`), `claim(uint256)` (`0x379607f5`), `claimToken(address)` (`0x32f289cf`), `claimToken(address,uint256)`, getter `balanceOf(address)` (`0x70a08231`) & `claimable(address,address)`. Fee **menumpuk di escrow lalu ditarik** — tak auto-distribusi tiap trade. `QualyraFeeVault` identik: `collectFees` hanya mencatat `creatorBalance[token][asset]` (komentar kode: *"pulled, never pushed"*), `withdrawCreatorFees(token, asset)` membayar ke `factory.feeRecipientOf(token)`. Saat dicek, escrow Pons memegang **±1.153,23 ETH** (`1.153.232.085.953.078.625.458` wei) fee tak-terklaim → pull-model nyata. **Keamanan:** withdraw permissionless-trigger tapi dana selalu ke recipient (tak bisa dicuri), `nonReentrant` + saldo di-nol-kan sebelum transfer; `setCreatorFeeRecipient` hanya recipient saat ini yang boleh ganti (owner/timelock tak bisa merampas), tolak `address(0)`. Artefak: folder Postman "2 - fee model parity (Pons FeeEscrow)" (§10).
- ⚠️ **PoolManager & USDG dari `env`, immutable.** Salah ketik `POOL_MANAGER` = graduation mati permanen. Nilai benar: `0x8366…40951`.
- ⚠️ **Timelock wajib `acceptOwnership()`** pasca-deploy, kalau tidak factory tetap milik EOA deployer.
- ⚠️ **USDG 6 desimal & proxy upgradeable** — jangan hardcode asumsi 18; pantau `decimals()`.
- ⚠️ **Pons V1 = Uniswap V3, Pons V2 = v4.** Qualyra graduation ke v4 → pastikan integrasi mengacu ke generasi **v4** (V2).
- ⚠️ **USDG hanya terdaftar bila `env USDG` diisi**; kalau kosong hanya pair ETH aktif.
- ⚠️ **MEV sandwich buyback — TRADE-OFF YANG DITERIMA (2026-09-18).** `MAX_PRICE_IMPACT_BPS` dinaikkan **1% → 5%** (`TRANCHES 10 → 4`) supaya buyback-burn benar-benar menggerakkan harga dan terasa oleh pasar. Konsekuensi jujur: **5% > titik impas fee bolak-balik 2%**, jadi satu tranche cukup besar untuk **di-sandwich bot MEV** (front-run → ikut naik ≤5% → jual). Buyback swap fee-exempt, tapi penyerang tidak → break-even ~2%. Ini keputusan produk **sengaja** (price support terlihat > resistensi MEV), **bukan bug**. Di-pin & didokumentasikan oleh `test_sandwichingABuybackCanProfitAtFivePercentCap` (QualyraAttacks). Turunkan cap ke <2% (mis. 200 bps) untuk menutup celah ini lagi. Per-swap tetap dibatasi 5% dan pot tetap habis lewat carryover, jadi tak ada dana hangus.

- ✅ **Guard desimal quote/pair asset — paritas Pons (2026-09-18).** `setQuoteAsset(asset, phantomQuote, graduationThreshold, expectedDecimals)`: tolak desimal **< 6** (`MIN_QUOTE_ASSET_DECIMALS`, sama seperti Pons `MIN_PAIR_TOKEN_DECIMALS` — di bawah 6 fee basis-point membulat ke nol); ERC-20 wajib `IERC20Metadata(asset).decimals() == expectedDecimals` (tak terbaca → `QuoteAssetDecimalsUnavailable`, beda → `QuoteAssetDecimalsMismatch`); ETH (`address(0)`) wajib `18`. `QuoteAssetConfig` kini menyimpan `decimals`. Ini menutup risiko **misprice ~12 orde besaran** (mengira token 18-desimal padahal 6) saat menambah pair asset baru seperti **token saham**. `phantomQuote` & `graduationThreshold` tetap didenominasi dalam desimal aset itu sendiri (USDG 6 → `8_090e6`). **Batas graduate saham** = jumlah unit saham TETAP; Pons **tanpa oracle** — rate dipilih sekali off-chain (target native × rate), dan hanya rasio `threshold/(threshold+phantomQuote)` yang menentukan bentuk kurva, jadi launch saham identik dengan launch native berukuran sama. Konsekuensi: "nilai USD" saat graduate ikut bergerak dengan harga saham (jumlah unitnya tetap) — by-design. Menambah token saham = konfigurasi/governance (`setQuoteAsset`), bukan ubah logika inti.

- ✅ **7 token saham Robinhood terdaftar — nilai persis Pons (2026-09-18).** NVDA/AAPL/SPY/GOOGL/GME/SPCX/SGOV didaftarkan di deploy script dengan `phantomQuote`/`graduationThreshold` disalin **verbatim** dari `pairTokenEconomics` on-chain Pons (semua **18 desimal**, rasio `phantom/threshold = 0.40`). Beda dari USDG (6 desimal): **saham 18 desimal** → `expectedDecimals = 18` (salah isi `6` = revert guard). **Batas graduate = jumlah lembar TETAP** (mis. 41.6 NVDA), **tanpa oracle** (paritas Pons) — nilai USD-nya ikut harga saham, jumlah unitnya tetap. Pendaftaran di-gate `block.chainid == 4663` (alamat hanya ber-code di Robinhood Chain, dan `setQuoteAsset` revert pada aset tanpa code); token saham baru bisa ditambah kapan saja pasca-deploy oleh **timelock** via `setQuoteAsset`. Dibuktikan oleh `QualyraStockQuoteAsset.t.sol` — `checkEconomics` **NYATA** menerima ke-7 nilai (bukan mock).

- ✅ **Pre-flight deploy + pencocokan alamat byte-for-byte + dry-run fork (2026-09-18).** `deploy()` kini memanggil `_preflight()`: tolak alamat `0`, `POOL_MANAGER` wajib ber-code, USDG (bila diisi) wajib `decimals()==6`; pada `chainid==4663` cocokkan `POOL_MANAGER`/`USDG` **byte-for-byte** ke alamat kanonik terverifikasi + pastikan CREATE2 deployer & 7 token saham ber-code; lalu assert `pendingOwner()==timelock` (Ownable2Step — `owner()` baru menjadi timelock setelah timelock memanggil `acceptOwnership()`). Ini menutup risiko salah-ketik `env` yang tadinya baru ketahuan **pasca**-broadcast. Divalidasi terhadap **state Robinhood Chain nyata** via `DeployQualyraFork.t.sol` (dry-run fork; di-skip kecuali `ROBINHOOD_RPC_URL` diset) — deploy penuh lolos semua cek.

### §8. Item yang SUDAH ditutup ✅
- [x] Samakan default snipe window Pons (5 → **15**) + suite hijau
- [x] Auto-exempt creator + feeRecipient + daftar ≤32 (dari kode)
- [x] Rumus peluruhan snipe identik Pons (dari kode)
- [x] Alokasi creator = 0, semua beli di market (dari kode)
- [x] Ekonomi 4,2 ETH / 8.090 USDG / fee 0,0005 = konstanta Qualyra, USDG 6-desimal benar
- [x] Semua alamat eksternal inti terverifikasi on-chain
- [x] Toolchain + deps terpasang, `forge build` bersih, **108 tes hijau**

### §9. Blocker / masih terbuka ⛔⚠️
**A — Audit & logika** ⛔
- [ ] Audit eksternal manusia (blocker #1)
- [ ] Isi **3 temuan internal** belum dilihat (1 "merugikan trader") — telaah kode langsung (2026-09-18) hanya menemukan **snipe-tax + exemption insider** sebagai mekanik trader-adverse (by-design, paritas Pons; §3/§7); isi asli 3 temuan belum diberikan → **masih open**.
- [x] **Routing fee-split pasti** — **70/15/15** terkonfirmasi dari kode (§ Fee-Split Routing)
- [x] **Model fee creator = MANUAL CLAIM (pull), paritas Pons — TERBUKTI ON-CHAIN (2026-09-18).** `PonsV2FeeEscrow` (`0xd3aFeb…6AC9e`) hidup & bytecode-nya mengekspos `claim()`/`claim(uint256)`/`claimToken(address)` + getter `balanceOf(address)`/`claimable(address,address)` → fee **menumpuk lalu ditarik**, bukan auto-push. Identik `QualyraFeeVault`: `collectFees` hanya mencatat `creatorBalance[token][asset]`, `withdrawCreatorFees(token, asset)` bayar ke `feeRecipientOf(token)`. Escrow Pons live memegang ±1.153 ETH fee tak-terklaim. Lihat §7 & §10.
- [x] **Review `withdrawCreatorFees` & `setCreatorFeeRecipient` — AMAN (2026-09-18).** withdraw permissionless-trigger tapi dana **selalu** ke `feeRecipientOf` (tak bisa dicuri), `nonReentrant` + saldo di-nol-kan sebelum transfer (aman reentrancy); `setCreatorFeeRecipient` hanya boleh diubah recipient saat ini (owner/timelock tak bisa merampas), tolak `address(0)`. Bukti: `test_withdrawCreatorFees_paysCurrentRecipient`, `test_collectFees_rejectsUnknownCallers`.
- [x] Telaah `GraduationExecutor`, `Hook`, `LiquidityLocker`, `BuybackBurner`, `BondingCurve`, `CompetitionVault` — selesai (§8, ~2.700 baris)
- [x] Akses `setLaunchFee` / `setQuoteAsset` — `onlyOwner` (Ownable2Step) + ber-bound (§ Fee-Split Routing)

**C — Alamat eksternal** ⚠️
- [x] **Alamat stock token — SELESAI (2026-09-18).** 7 token Robinhood (NVDA/AAPL/SPY/GOOGL/GME/SPCX/SGOV) diverifikasi on-chain (`decimals`/`symbol`/`name`, semua 18) + economics disalin **persis** dari `pairTokenEconomics` Pons (rasio 0.40) → didaftarkan di deploy script (gate `chainid == 4663`) + `checkEconomics` asli menerima semua (§1b/§4/§5/§7). Token saham lain menyusul: tambah via `setQuoteAsset` (timelock) dengan pola sama.
- [x] **Cocokkan alamat `env` byte-for-byte — SELESAI (2026-09-18).** `_preflight()` di deploy script mencocokkan `POOL_MANAGER`/`USDG` ke konstanta kanonik (`0x8366…40951` / `0x5fc5…d168`) saat `chainid==4663`, jadi salah-ketik `env` langsung revert **sebelum** broadcast (bukan ketahuan setelah). Lihat §4/§7.
- [ ] Status "resmi" Robinhood Chain di registry Uniswap v4 (dok resmi)

**D — Chain nyata** ⛔
- [ ] Full-flow testnet: launch → graduation → pool → battle → buyback → klaim
- [ ] Uji jalur USDG (6-des) & ETH di testnet (⚠️ dry-run **deploy** sudah lolos di fork 4663 nyata — lihat E; namun **full-flow launch** belum)
- [ ] **Pin versi dependency** (reproducibility audit)

**E — Higiene deploy** ⚠️
- [x] **Pre-flight checks di script — SELESAI (2026-09-18).** `_preflight()`: `POOL_MANAGER.code>0`, USDG `decimals()==6`, alamat wajib ≠0, + post-condition `pendingOwner()==timelock` (Ownable2Step; `owner()` jadi timelock setelah `acceptOwnership`). Lihat §4/§7.
- [x] **Dry-run deploy di fork — SELESAI (2026-09-18).** `DeployQualyraFork.t.sol` menjalankan deploy penuh di fork Robinhood Chain (4663) nyata; semua pre-flight + byte-for-byte lolos (di-skip kecuali `ROBINHOOD_RPC_URL` diset).
- [ ] Safe + timelock 48 jam + keeper/indexer/matchmaking off-chain
- [ ] Verify kontrak di explorer pasca-deploy

### §10. Artefak
- Collection Postman **"Robinhood Chain — Pre-Deploy Verification (chain 4663)"** — **DIBUAT sebagai file lokal (2026-09-18)** di `postman/collections/…`, portabel via git (bisa dipakai di akun lain setelah `git clone`). Awalnya 9 request JSON-RPC (`eth_chainId`, `eth_getCode`, `pairTokenEconomics` ×7) + 56 assertion → Collection Runner **9/9 request, 56/56 assertion hijau**. **Ditambah folder "2 - fee model parity (Pons FeeEscrow)" (2026-09-18):** 2 request baru — `eth_getCode` (decode dispatcher `PonsV2FeeEscrow` → buktikan `claim()`/`claimToken()`/`balanceOf()` = pull/manual-claim) + `eth_getBalance` (escrow custody ±1.153 ETH fee tak-terklaim) + variabel `pons_fee_escrow`. Total **11 request, 3 folder**; lint bersih (11 file, 0 error); kedua request baru diverifikasi live **200 OK + test hijau**.
- `test/DeployQualyraFork.t.sol` — dry-run deploy penuh di fork Robinhood Chain 4663 (di-skip kecuali `ROBINHOOD_RPC_URL` diset).
- Dokumen ini (`docs/PRE-MAINNET-VERIFICATION.md`), §1–§9 di bawah.

**Inti:** verdict awal tetap valid (**jangan mainnet dulu**), tapi bahaya turun drastis — alamat inti terbukti benar, snipe/exemption/alokasi/ekonomi & **model fee creator manual-claim** paritas Pons & terbukti di kode/on-chain, **suite 114 tes hijau** + pre-flight/byte-for-byte `env` + dry-run fork nyata. Sisa murni: **audit manusia, testnet full-flow (launch→klaim), pin deps, Safe+timelock, verify explorer.**

---

## 1. Ringkasan Eksekutif

Kesimpulan tetap: **jangan ke mainnet dulu.** Tetapi setelah verifikasi, blocker yang semula disebut "paling fatal" (alamat eksternal) **sudah teratasi**. Urutan blocker nyata sekarang:

1. ⛔ **Audit manusia** (kontrak non-upgradeable → kesalahan permanen).
2. ⛔ **Full-flow di testnet** dengan PoolManager v4 asli.
3. ⛔ **Setup Safe + timelock 48 jam + keeper/indexer off-chain**.
4. ⚠️ Saat deploy: isi env dengan alamat terverifikasi + cek 1 alamat **stock token** yang belum ada.

---

## 2. Temuan yang SUDAH BENAR (terverifikasi on-chain)

| # | Item | Nilai | Cara verifikasi | Status |
|---|------|-------|-----------------|--------|
| 1 | Chain ID | `4663` (`0x1237`) | `eth_chainId` | ✅ |
| 2 | Uniswap v4 **PoolManager** | `0x8366a39cc670b4001a1121b8f6a443a643e40951` | `eth_getCode` → bytecode ada; selektor cocok v4 (`unlock 0x48c89491`, `swap 0xf3cd914c`, `modifyLiquidity 0x5a6bcfda`, `take 0x0b0d9c09`, `settle 0x11da60b4`) | ✅ |
| 3 | PoolManager dipakai **Pons V2** | sama → `0x8366…40951` | `eth_call` `poolManager()` (`0xdc4c90d3`) pada factory Pons V2 mengembalikan alamat yang sama persis | ✅ **konfirmasi ganda** |
| 4 | **CREATE2 deployer** | `0x4e59b44847b379578588920cA78FbF26c0B4956C` | `eth_getCode` == bytecode proxy Arachnid deterministic-deployment kanonik | ✅ |
| 5 | **USDG** identitas | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | `name()`="Global Dollar", `symbol()`="USDG" | ✅ |
| 6 | **USDG desimal** | `6` | `decimals()` → `6` (bukan 18) | ✅ |
| 7 | USDG bentuk kontrak | proxy (EIP-1967, upgradeable) | pola bytecode `delegatecall` + slot implementasi EIP-1967 | ✅ (catat: bisa berubah lewat upgrade) |
| 8 | Pons V2 factory | `0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e` | `eth_getCode` ada, Ownable2Step, ter-wire ke PoolManager di atas | ✅ |
| 9 | Pons V1 factory | `0xA5aAb3F0c6EeadF30Ef1D3Eb997108E976351feB` | `eth_getCode` ada; `poolManager()` **revert** → factory legacy | ⚠️ legacy |

### Temuan yang SUDAH BENAR di kode (`DeployQualyra.s.sol`)

- ✅ `CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C` — cocok proxy kanonik on-chain.
- ✅ `ETH_THRESHOLD = 4.2 ether`, `ETH_PHANTOM = 1.68 ether` — angka "4,2 ETH" adalah **konstanta Qualyra sendiri**, bukan yang "belum terbaca dari Pons".
- ✅ `USDG_THRESHOLD = 8_090e6`, `USDG_PHANTOM = 3_236e6` — memakai **6 desimal** dengan benar, konsisten dengan USDG on-chain. Semua mock test juga `MockERC20("Global Dollar","USDG",6)`.
- ✅ Hook di-deploy via CREATE2 + `HookMiner`, dengan guard `HookAddressMismatch` bila alamat mined ≠ hasil deploy.
- ✅ Kepemilikan factory diserahkan ke timelock (`transferOwnership(config.timelock)`) — pola 2 langkah.
- ✅ `launchFee = 0.0005 ether` (default) di `QualyraFactory`, dibatasi `MAX_LAUNCH_FEE = 0.05 ether`, dan dipaksa `msg.value == launchFee` saat launch. Angka 0,0005 ETH di review **benar**.
- ✅ `TRADE_FEE_BPS = 100` (1%) di `QualyraFees` — cocok dengan "pool fee 1%". Test juga menegaskan `graduationThreshold == 4.2 ether`.

---

## 3. Jawaban Poin-per-Poin atas Kritik

| Kritik | Verdict setelah verifikasi |
|--------|----------------------------|
| **Belum diaudit** (3 temuan internal, 1 bisa merugikan trader) | ⛔ **VALID — blocker #1.** Verifikasi alamat + telaah kode **bukan** audit keamanan. Non-upgradeable = permanen. Wajib audit manusia + perbaiki 3 temuan. |
| **Belum jalan di chain sungguhan** | ⛔ **VALID.** Semua test pakai PoolManager lokal (`deployCode("PoolManager.sol:PoolManager", …)`). Full-flow testnet wajib. |
| **Alamat eksternal belum diverifikasi ("paling fatal")** | ✅ **SUDAH TERATASI.** Chain id, PoolManager (asli v4 + dipakai Pons V2 live), CREATE2 deployer, USDG semua terbukti benar. Sisa: alamat **stock token** (belum diberikan). Klaim "Robinhood Chain tidak di daftar resmi Uniswap v4" ternyata lemah — bytecode membuktikan PoolManager v4 asli. |
| **Angka Pons belum dibaca dari kontraknya** | ⚠️ **Sebagian keliru.** 4,2 ETH & 8.090 USDG adalah konstanta Qualyra di `DeployQualyra.s.sol`, sudah eksplisit & benar desimalnya. Yang valid: pastikan ekonomi ini memang sesuai niat (keputusan produk). Launch fee 0,0005 ETH **terkonfirmasi** sebagai default `launchFee` di `QualyraFactory` (maks `0.05 ether`). |
| **Safe & timelock belum ada** | ⚠️ **VALID (operasional).** Deploy butuh env `QUALYRA_TIMELOCK/TREASURY/OPERATOR/GUARDIAN`; setelah deploy **timelock wajib `acceptOwnership()`**. Kontrak siap, infrastrukturnya belum. |
| **Infrastruktur off-chain belum ada** | ⚠️ **VALID (operasional).** Indexer, matchmaking, keeper (sweep fee/finalize/buyback). Tahap 1 (launch/trade/graduation) jalan; tahap 2–3 mati tanpa keeper. |

---

## 4. Risiko Deployment yang Perlu Diperhatikan

1. **PoolManager itu immutable & disuntik saat deploy.** `GraduationExecutor`, `LiquidityLocker`, `BuybackBurner`, `Hook` menerima `config.poolManager` di constructor. **Satu salah ketik di env `POOL_MANAGER` = graduation mati permanen.** Gunakan nilai terverifikasi di bawah.
2. **Ownership 2 langkah** — jangan lupa timelock memanggil `acceptOwnership()`, kalau tidak factory tetap dimiliki EOA deployer.
3. **USDG hanya terdaftar bila env `USDG` diisi** (`setQuoteAsset` dipanggil hanya jika `!= address(0)`). Kalau kosong, hanya pair ETH aktif.
4. **HookMiner** harus jalan dengan `create2Deployer` & bytecode + setting compiler yang sama dengan broadcast; guard `HookAddressMismatch` menangkap ketidakcocokan.

---

## 5. Env Deploy Terverifikasi

```dotenv
# Sudah diverifikasi on-chain 2026-09-17 — JANGAN diubah tanpa cek ulang.
# Salah alamat = graduation mati permanen (kontrak non-upgradeable).
POOL_MANAGER=0x8366a39cc670b4001a1121b8f6a443a643e40951   # Uniswap v4 PoolManager (dipakai juga oleh Pons V2 live)
USDG=0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168            # Global Dollar, 6 desimal

# Belum diisi — wajib disiapkan (Safe / timelock 48 jam):
QUALYRA_TIMELOCK=
QUALYRA_TREASURY=
QUALYRA_OPERATOR=
QUALYRA_GUARDIAN=
```

Setelah broadcast, ingat: **timelock harus memanggil `acceptOwnership()` di factory.**

---

## 6. Checklist Pra-Mainnet

**Alamat eksternal**
- [x] Chain id `4663`
- [x] PoolManager `0x8366…40951` (v4 asli + dipakai Pons V2)
- [x] CREATE2 deployer `0x4e59b448…4956C`
- [x] USDG `0x5fc5…d168` (Global Dollar, 6 desimal)
- [ ] Cocokkan alamat env byte-for-byte saat deploy
- [ ] Verifikasi 1 alamat **stock token** (`getCode` + `symbol` + `decimals`)
- [x] Launch fee `0.0005 ether` (default) terkonfirmasi di `QualyraFactory` (maks `0.05 ether`)

**Testnet**
- [ ] Deploy penuh ke testnet dgn PoolManager v4 asli
- [ ] Full-flow: launch → graduation → pool → battle → buyback → klaim mingguan
- [ ] Pastikan graduation membuat pool v4 + liquidity lock jalan
- [ ] Uji jalur USDG (6-desimal) dan ETH

**Audit & governance**
- [ ] Audit eksternal
- [ ] Perbaiki 3 temuan internal (utamakan yang merugikan trader) + regression test
- [ ] Deploy Safe + timelock 48 jam; timelock `acceptOwnership()`
- [ ] Siapkan keeper + indexer + matchmaking off-chain

**Verifikasi berulang**
- [ ] Jalankan collection Postman *"Robinhood Chain — Pre-Deploy Verification (chain 4663)"* sebelum tiap deploy

---

## 7. Referensi

- Collection verifikasi (Postman): **Robinhood Chain — Pre-Deploy Verification (chain 4663)** — 8 request JSON-RPC ber-test otomatis.
- Explorer Robinhood Chain: `https://robinhoodchain.blockscout.com` / `https://robinscan.io`
- Script deploy: `script/DeployQualyra.s.sol`

> Catatan: dokumen ini mencatat verifikasi alamat & konfigurasi. Ia **tidak** menggantikan audit keamanan penuh atas logika kontrak.

---

## 8. Verifikasi Build & Test (sesi 2026-09-18)

Blocker "semua uji hanya diklaim, belum dijalankan dari sini" kini **teratasi**: Foundry dipasang dan suite dijalankan langsung di mesin.

| Item | Hasil | Status |
|------|-------|--------|
| Foundry | `forge 1.8.3` terpasang via `foundryup` | ✅ |
| Dependencies | `lib/` diisi fresh: `forge-std`, `openzeppelin-contracts`, `v4-periphery` (+ `v4-core`, `permit2`). Sebelumnya `lib/` kosong & tidak ada `.gitmodules` | ✅ |
| `forge build` | Sukses, **0 error** (hanya warning lint `block.timestamp`) | ✅ |
| `forge test` | **108 pass / 0 fail / 0 skip** di 11 suite + invariant, exit 0 | ✅ |

**Perubahan snipe window 5 → 15 detik (paritas Pons) — TERKONFIRMASI aman:**

- `QualyraFactory.sol`: `snipeWindow = 15`, `snipeStartBps = 9_900` (99%), `MAX_SNIPE_WINDOW = 60`, `MAX_SNIPE_START_BPS = 9_900`, `setSnipeParams(...)` **onlyOwner** (governance).
- `test_defaultSnipeParamsMatchPons()` → **PASS** (assert `snipeWindow() == 15`).
- `test_buy_snipeTaxDecays()`, `test_buy_snipeTaxCappedWithCreatorTax()` → **PASS**.
- Harness tes di-pin ke `window = 5` demi determinisme; **default produksi tetap 15** (yang dipakai saat deploy).

⚠️ **Catatan reproducibility (untuk audit):** versi dependency **belum dipin** — yang terpasang adalah rilis terbaru. Untuk audit kontrak non-upgradeable, **kunci commit/tag persis** (mis. `.gitmodules` / lockfile). Saat ini `lib/` **untracked** dan belum ada di `.gitignore` → putuskan: commit sebagai submodule terpin **atau** ignore + andalkan `forge install`.

---

## 9. Yang MASIH Perlu Ditelusuri Kebenarannya

> Legenda: ⛔ blocker sebelum mainnet · ⚠️ penting, belum tuntas · 🔎 perlu dibaca/dikonfirmasi dari sumber.

### A. Logika keamanan (ranah audit)
- ⛔ **3 temuan review internal** — isi ketiganya belum pernah kita lihat. Minta/temukan detailnya; salah satu disebut "bisa merugikan trader". (Review independen menduga item "merugikan trader" = snipe-economics gaya Pons — by-design, bukan bug. Lihat § Review Logika & Keamanan.)
- ✅ **Telaah mendalam kontrak inti — SELESAI.** ~2.700 baris dibaca penuh: `QualyraGraduationExecutor`, `QualyraHook`, `QualyraBondingCurve`, `QualyraLiquidityLocker`, `QualyraBuybackBurner`, `QualyraCompetitionVault`, `QualyraFeeVault`. Jalur uang aman, **tidak ada vektor rug**. Detail di § Review Logika & Keamanan. (Audit manusia eksternal tetap wajib — bukan pengganti.)
- ✅ **Routing fee-split PASTI — TERKONFIRMASI dari kode (sesi 2026-09-18).** Snipe tax digabung ke bucket trade-fee (`_sendFees(q.tradeFee + q.snipeTax, ...)`) lalu di-split **70% creator / 15% platform / 15% competition**; creator-tax 100% ke creator; tak ada snipe tax saat sell. Detail lengkap di § Fee-Split Routing & Kontrol Akses Setter.
- ✅ **Kontrol akses setter — TERKONFIRMASI dari kode.** `QualyraFactory` = `Ownable2Step`; `setLaunchFee`, `setQuoteAsset`, `setFeeSplit`, `setSnipeParams`, `setMaxCreatorTaxBps`, `disableQuoteAsset`, `recoverStuckLaunch` semua `onlyOwner` + ber-bound, dan hanya berlaku untuk launch **berikutnya** (non-retroaktif). Detail di § Fee-Split Routing & Kontrol Akses Setter.

### B. Paritas dengan Pons — ✅ TERKONFIRMASI dari kode (sesi 2026-09-18)
- ✅ **Rumus peluruhan snipe identik Pons.** `QualyraFees.snipeTaxBps` (baris 23–26): `bps = startBps >> (((block.timestamp - launchedAt) * 14) / window)`, lalu di-cap `BPS - TRADE_FEE_BPS - creatorTaxBps - MIN_BUYER_SHARE_BPS` (pembeli selalu dapat minimal share). Persis rumus Pons `startBps >> ((elapsed*14)/window)`. `snipeStartBps`/`snipeWindow` di-snapshot **immutable** per-launch (`QualyraBondingCurve` 73–74, 131–132).
- ✅ **Auto-exempt creator + `creatorFeeRecipient` + daftar ≤32.** `QualyraFactory._launch` (340–346): `isSnipeExempt[token][creator]=true`, `isSnipeExempt[token][recipient]=true`, lalu loop `params.snipeExempt[]`, dengan guard `length > MAX_SNIPE_EXEMPT (32) → revert` (305). Identik Pons.
- ✅ **Alokasi token creator = 0 — semua dibeli di market.** `QualyraLaunchToken` men-`_mint(holder, supply)` **seluruh** supply ke satu holder; `QualyraLaunchDeployer.deploy` menetapkan holder = deployer lalu `safeTransfer(curve, params.supply)` → **100% supply pindah ke bonding curve**. Creator tidak menerima token sama sekali; "first buy" creator (via `QualyraLaunchRouter`) adalah pembelian pasar biasa. Persis konsep Pons (0 alokasi, semua ke curve).
- ✅ **Ekonomi 4,2 ETH / 8.090 USDG / phantom** = konstanta Qualyra sendiri (lihat §2), USDG 6-desimal benar. Opsional (bukan blocker): baca angka Pons literal sebagai pembanding. **➡️ Kategori B praktis SELESAI — snipe, exemption, alokasi, dan ekonomi sudah paritas Pons & terbukti di kode.**

### C. Alamat eksternal
- ⚠️ **Alamat stock token** yang diintegrasikan — belum diberikan → belum dicek `getCode` + `symbol()` + `decimals()`.
- ⚠️ **Cocokkan alamat `env` deploy byte-for-byte** (checksum) saat broadcast.
- 🔎 **Status "resmi" Robinhood Chain di registry Uniswap v4** — bytecode sudah membuktikan PoolManager v4 asli, tapi status resmi belum dicek di dokumentasi Uniswap.
- ⚠️ **USDG adalah proxy upgradeable** — pantau `decimals()` (bisa berubah via upgrade issuer).

### D. Belum pernah jalan di chain nyata
- ⛔ **Full-flow testnet:** launch → graduation → pool → battle → buyback → klaim mingguan (semua tes saat ini lokal dengan PoolManager lokal).
- ⚠️ **Reproducibility build** untuk audit: pin versi dependency (lihat §8).

### E. Higiene deploy (dry-run)
- ⚠️ **Pre-flight checks di `DeployQualyra.s.sol`:** revert bila `POOL_MANAGER.code.length == 0`, bila `USDG != 0 && USDG.decimals() != 6`; assert pasca-deploy `factory.owner() == timelock` (`pendingOwner == 0`).
- ⚠️ **Verifikasi arg constructor/immutable** (PoolManager, USDG, salt CREATE2) di tx deploy yang sebenarnya.

---

## 🛡️ Review Logika & Keamanan (2026-09-18)

> Review manual menyeluruh atas kontrak inti (~2.700 baris: Factory, BondingCurve, Fees, FeeVault, Hook, GraduationExecutor, LiquidityLocker, BuybackBurner, CompetitionVault, LaunchToken, LaunchDeployer, LaunchRouter). **Ini BUKAN pengganti audit manusia eksternal** — audit tetap wajib sebelum mainnet.

### A. Proteksi trader (terbukti di kode) ✅
| # | Proteksi | Bukti |
|---|---|---|
| 1 | **Likuiditas terkunci permanen (anti-rug)** | `QualyraLiquidityLocker` **tidak punya fungsi remove/collect/burn** — hanya `lockLiquidity` (add, 1× per token). Mustahil ditarik. |
| 2 | Slippage + deadline | `buy`/`sell` cek `minTokensOut`/`minAmountOut` + `deadline` |
| 3 | **Full-fill only** | Curve refund kelebihan; Hook `revert PartialSwap` → trader tak pernah bayar fee atas bagian yang tak ter-trade |
| 4 | **Pembeli selalu dapat ≥1%** | `MIN_BUYER_SHARE_BPS=100` jadi cap snipe → juga cegah overflow/div-by-zero di math pool (`_feesOnTop`) |
| 5 | Tidak ada snipe tax saat **sell** | `_quoteSell` & Hook `_feesFromGross(..., isBuy=false)` |
| 6 | Pull-based + `nonReentrant` | Fee/prize ditarik (tak di-push); semua fungsi bergerak-dana ber-guard |
| 7 | **Buyback = price support (trade-off MEV, keputusan tim 2026-09-18)** | Impact ≤ `MAX_PRICE_IMPACT_BPS=500` (**5%**, diubah dari 1%) + swap buyback fee-exempt; beli **4 tranche** (`TRANCHES=4`) @30 menit lalu burn. **5% > fee bolak-balik 2% → bisa di-sandwich** (sengaja, lihat §7 + test `test_sandwichingABuybackCanProfitAtFivePercentCap`) |
| 8 | Graduation aman | Hanya bisa dipanggil curve; pool dibuka di harga akhir curve (tanpa gap); sisa token **di-burn**, dust quote → fee |
| 9 | Rounding aman | `ceilDiv` konsisten memihak curve/pool sebesar debu (tak bisa dieksploitasi trader) |
| 10 | Governance berlapis | operator/guardian/timelock terpisah + veto + challenge period; `migrate` hanya saat paused |

### B. Temuan (severity)
| Severity | Temuan | Catatan |
|---|---|---|
| **INFO / by-design** | **Snipe tax s/d 98% di window awal, ~70%-nya ke creator, creator auto-exempt** | **Kandidat "merugikan trader"** — tapi **identik Pons V2**, global & governance-set (bukan per-creator), meluruh, di-cap agar pembeli ≥1%. Bukan bug. Saran: pertimbangkan default start + tampilkan kurva ke pembeli di UI. |
| **LOW / doc** | Komentar usang di `QualyraHook._snipeBps` ("five seconds") | ✅ **SUDAH DIPERBAIKI** → "fifteen seconds from launch by default (governance-set, max sixty)". |
| **LOW / note auditor** | `_snipeBps` pakai `tx.origin` untuk exempt di pool | Hanya bisa **menurunkan** tax (tak ada eksploit over-charge). Terdokumentasi; tandai untuk auditor. |
| **INFO / trust** | Operator jadwalkan battle & propose hasil; guardian veto | Peran tepercaya (dimitigasi timelock + veto + challenge + eligibility off-chain). Ungkap ke user. |

### C. Perbaikan yang dilakukan sesi ini
- ✅ **Komentar usang diperbaiki** di `src/QualyraHook.sol` (baris 327): "five seconds" → **"fifteen seconds from launch by default (governance-set, max sixty)"**. Perubahan komentar saja → tidak mengubah perilaku, suite **108 tes** tetap valid.
- ✅ **Snipe tax dibiarkan setia ke Pons** (`snipeStartBps=9_900` / `snipeWindow=15` / ceiling `60`), tidak diubah — sesuai keputusan.

### D. Kesimpulan
- **Logika inti setia ke Pons**; jalur uang (curve, pool, fee, graduation, locker, buyback) rapi, aman, **tanpa vektor rug**.
- Satu-satunya mekanisme "merugikan trader" = **snipe tax gaya Pons** (by-design, di-cap) → sesuai keyakinan: *kalau ikut Pons, tak merugikan trader melebihi Pons.*
- **"3 temuan internal" tidak pernah dibagikan** ke reviewer ini → tidak bisa dicek satu-per-satu. Review independen menemukan: snipe-economics (paritas Pons), komentar usang (sudah fix), catatan `tx.origin`.
- ⛔ **Audit manusia eksternal tetap WAJIB** sebelum mainnet — review ini tidak menggantikannya.

---

## 💸 Fee-Split Routing & Kontrol Akses Setter (2026-09-18)

> Dibaca langsung dari kode (`QualyraBondingCurve`, `QualyraFeeVault`, `QualyraFactory`, `QualyraFees`). Menutup item §9.A "routing fee-split pasti" + "kontrol akses setter".

### A. Aliran fee — dari mana ke mana (TERKONFIRMASI dari kode)
- **Trade fee = 1%** (`QualyraFees.TRADE_FEE_BPS = 100`), dipungut di sisi quote asset (ETH/USDG).
- **Buy:** `QualyraBondingCurve._sendFees(q.tradeFee + q.snipeTax, q.creatorTax)` → **snipe tax digabung ke bucket trade-fee**.
- **Sell:** `_sendFees(q.tradeFee, q.creatorTax)` → **tidak ada snipe tax saat sell**.
- Di `QualyraFeeVault.collectFees(token, bucket, creatorTax, battleId)`, bucket (= tradeFee + snipeTax) di-split:

| Penerima | Rumus | Default | Catatan |
|---|---|---|---|
| **Creator** | `bucket * creatorShareBps / BPS` | **70%** | + `creatorTax` **100%** (terpisah) |
| **Competition** | `bucket * competitionShareBps / BPS` | **15%** | ke battle pot aktif, atau ½ Trader League + ½ treasury |
| **Platform (treasury)** | sisa (`bucket − creator − competition`) | **15%** | menerima debu pembulatan |
| **Creator-tax** | `creatorTax` penuh | ≤ 5% (ceiling 10%) | 100% ke creator, di luar split 70/15/15 |
| **Launch fee** | `collectLaunchFee` | **50% treasury / 50% Trader League** | fee 0,0005 ETH |

➡️ **"Snipe tax ~70% ke creator" kini TERBUKTI dari kode** (bukan lagi simpulan test): snipe → bucket base-fee → split 70/15/15. Paritas Pons (`_accrueFees(fee + snipeTax, tax)`).

- **Pull-based + `nonReentrant`:** `withdrawCreatorFees` (bayar `feeRecipientOf(token)`), `withdrawTreasury` (bayar `treasury`), `sweepSurplus` (dana nyasar → treasury). Bisa dipicu siapa saja, tapi hanya membayar ke tujuan yang benar.
- **Guard `collectFees`:** hanya `curve` / `hook` / `graduationExecutor` milik launch tsb yang boleh melapor fee.

### B. Kontrol akses setter — TERKONFIRMASI (`Ownable2Step`, owner = timelock)
| Setter | Guard | Bound / validasi |
|---|---|---|
| `setLaunchFee` | `onlyOwner` | ≤ `MAX_LAUNCH_FEE` (0.05 ETH) |
| `setQuoteAsset` | `onlyOwner` | phantom & threshold ≠ 0; asset harus punya code; `checkEconomics(...)` |
| `disableQuoteAsset` | `onlyOwner` | harus sedang enabled |
| `setSnipeParams` | `onlyOwner` | start ≤ 9_900 (99%), window ≤ 60 s |
| `setMaxCreatorTaxBps` | `onlyOwner` | ≤ `MAX_CREATOR_TAX_BPS` (1_000 = 10%) |
| `setFeeSplit` | `onlyOwner` | jumlah = 10_000; creator ≥ 5_000 (50%); platform ≤ 3_000; competition ≤ 3_000 |
| `recoverStuckLaunch` | `onlyOwner` | — |
| `FeeVault.setTreasury` | `factory.owner()` | ≠ address(0) |

**Properti kunci (proteksi governance & trader):**
1. **Ownable2Step** → transfer kepemilikan butuh `acceptOwnership()` (cegah owner nyasar ke alamat mati).
2. **Non-retroaktif** — semua parameter di-*snapshot* per-launch; perubahan owner hanya berlaku untuk token yang diluncurkan **setelahnya**. Token lama kebal perubahan.
3. **Ber-bound keras** — owner (bahkan bila timelock disusupi) **tidak bisa** menaikkan launch fee > 0.05 ETH, creator tax > 10%, memberi creator < 50% split, atau snipe > 99% / window > 60 s.

### C. Verdict item §9.A
- ✅ Routing fee-split pasti → **70/15/15, snipe bundled saat buy, sell bebas snipe** (dari kode).
- ✅ Akses setter → **semua `onlyOwner` + `Ownable2Step` + ber-bound + non-retroaktif**.
- ✅ Telaah kontrak inti → selesai (§ Review Logika & Keamanan), tanpa vektor rug.
- ⛔ Sisa blocker sebenarnya: **audit manusia eksternal**, **full-flow testnet**, **alamat stock token (C)**, **pre-flight & infra governance (E)**.

### D. Pons vs Qualyra — cara mengatur fee split (dari source Pons V2 terverifikasi, Sourcify chain 4663 `0x7eD5…EC7e`)
**Temuan penting: Pons TIDAK punya satu fungsi `setFeeSplit`.** Pons mengatur split lewat beberapa setter `onlyOwner` terpisah; creator mendapat sisanya. Qualyra membungkus ide yang sama ke dalam satu `setFeeSplit`.

| Knob Pons V2 (`onlyOwner`) | Default | Cap | Padanan di Qualyra |
|---|---|---|---|
| `hookFeeBps` (base trade fee) | **100 (1%)** | `MAX_HOOK_FEE_BPS = 1_000` | `TRADE_FEE_BPS = 100` (1%) |
| `protocolFeeShareBps` (bagian protokol dari base fee) | **3_000 (30%)** | `MAX_PROTOCOL_FEE_SHARE_BPS = 5_000` (50%) | `platformShareBps + competitionShareBps` = 30% |
| `buybackBurnBps` (dikarve dari **share CREATOR**, → buyback-and-**lock** 5thn) | **5_000 (50%)** | — | Qualyra beda: buyback = **burn**, didanai dari sisi **competition** (non-creator) |
| `maxCreatorTaxBps` (ceiling creator tax) | **1_000 (10%)** | `MAX_CREATOR_TAX_CEILING_BPS = 1_000` | `MAX_CREATOR_TAX_BPS = 1_000` |
| Creator | **sisa ≈ 70%** | — | `creatorShareBps = 7_000` (70%) |
| **`setFeeSplit` tunggal?** | **TIDAK ADA** | — | ADA (bungkus creator/platform/competition jadi satu) |

**Kesimpulan atas kebingungan 50/30/30 vs 70/15/15:**
1. **Default-nya justru selaras:** Pons = creator ~70% / non-creator 30% (`protocolFeeShareBps = 3_000`). Qualyra = creator 70% / platform 15% + competition 15% = 30%. **Angka 70/30 identik** — Qualyra hanya **memecah 30% itu** jadi platform + competition (fitur league-nya), sementara Pons memecahnya jadi protocol treasury + buyback-burn.
2. **Bound 50% itu meniru Pons:** Qualyra `MIN_CREATOR_SHARE_BPS = 5_000` (creator ≥ 50%) = cerminan Pons `MAX_PROTOCOL_FEE_SHARE_BPS = 5_000` (protokol ≤ 50%). Keduanya menjamin **creator tak pernah dapat < 50%**.
3. **Prinsip yang sama persis:** snipe tax gabung ke bucket base-fee (`_accrueFees(fee + snipeTax, tax)`), creator-tax **bypass** split (100% ke creator), semua `onlyOwner`/governance, dan di-snapshot per-launch.

➡️ Jadi 50/30/30 (bound) dan 70/15/15 (default) itu **konsisten dengan Pons** — cuma dikemas beda: Pons pakai beberapa knob terpisah, Qualyra pakai satu `setFeeSplit` yang totalnya harus 100%.

### E. Aritmetika split Pons yang PERSIS (dari `PonsV2BondingCurve` terverifikasi)
`_accrueFees` (baris 4148) — akumulasi fee tiap swap:
```solidity
function _accrueFees(uint256 fee, uint256 tax) private {
    quoteFeeBalance += fee;                 // base fee (+ snipe tax, karena caller kirim fee+snipeTax)
    creatorTaxBalance += tax;               // creator tax, terpisah
    if (buybackEnabled && fee != 0) {
        uint256 creatorSlice = fee - (fee * protocolFeeShareBps) / BASIS_POINTS;  // = 70% dari fee
        buybackQuoteBalance += (creatorSlice * buybackBurnBps) / BASIS_POINTS;    // = 70% × 50% = 35% dari fee
    }
}
```
`_distribute` (baris 5469) — bagi saat sweep:
```solidity
uint256 protocolAmount  = (totalQuote * info.protocolFeeShareBps) / BASIS_POINTS; // 30%
uint256 creatorBucket   = totalQuote - protocolAmount;                            // 70%
uint256 requestedBuyback= buybackQuote < creatorBucket ? buybackQuote : creatorBucket;
uint256 creatorAmount   = creatorBucket - requestedBuyback + taxQuote;            // 70% − buyback + creatorTax
```

**Jawaban pasti: `buybackBurnBps` dihitung dari SHARE CREATOR (70%), BUKAN dari 30% protokol dan BUKAN dari total.** Komentar kontrak Pons (baris 4327–4333) menegaskannya: *"Both the curve and the hook carve the buyback slice out of the creator's share of the fees alone … Enabling a buyback therefore moves value from the creator to the protocol."*

Hasil split base-fee bucket Pons:
| | buyback OFF (default) | buyback ON (creator opt-in) |
|---|---|---|
| Protocol | **30%** | **30%** |
| Buyback (swap→lock 5thn) | 0% | **35%** (= 70% × 50%) |
| Creator | **70%** | **35%** |
| + Creator tax | 100% ke creator (bypass split) | sama |

**Beda struktural vs Qualyra:** di Pons, buyback **dikarve dari jatah creator** (opsional per-launch, di-**lock** 5thn). Di Qualyra, buyback = **burn** dan didanai dari sisi **competition** (bagian non-creator 30%), bukan dari jatah creator. Protocol/base-split 30/70 dan snipe/creator-tax tetap identik.

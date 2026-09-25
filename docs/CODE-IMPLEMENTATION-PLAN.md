# QUALYRA — Rencana Implementasi Kode (Anti-Bug Plan)

> **Status:** RENCANA (belum ada baris `.sol` yang diubah — dokumen ini hanya peta kerja).
> **Acuan tunggal (source of truth):** [`docs/FEE-AND-BATTLE-SPEC.md`](./FEE-AND-BATTLE-SPEC.md) — desain **TERKUNCI** (§8 semua item selesai).
> **Tujuan:** Memetakan simbol kontrak yang ADA saat ini ke aturan spec, lalu merinci perubahan state / fee-routing / eligibility / finalize + checklist anti-bug + test plan + urutan implementasi.

---

## 1. Scope & Source-of-Truth

- **Acuan mutlak:** `docs/FEE-AND-BATTLE-SPEC.md`. Jika dokumen ini pernah berbenturan dengan spec, **spec yang menang**.
- **Prinsip "no behavior beyond the spec":** Rencana ini **tidak menambah perilaku baru** di luar yang tertulis di spec. Tidak ada mekanisme baru (durasi mingguan, holder-count, split pemenang selain 100% buyback&burn, dsb.) — semua item terbuka sudah dicoret di spec §8.
- **Batasan tugas:** Hanya READ kode + WRITE satu dokumen ini. **Tidak ada `.sol` / source lain yang diubah pada tahap ini.**
- **Jaringan:** testnet chainId **46630** (`robinhood-chain-testnet`), mainnet chainId **4663** (`ROBINHOOD_CHAIN_ID`). Alamat feed berbeda per-jaringan.

### 1.1 Simbol nyata yang menjadi dasar rencana (hasil baca kode)

| Kontrak | Simbol kunci yang ditemukan |
|---|---|
| `QualyraFeeVault.sol` | `collectFees(token, tradeFee, creatorTax, battleId)`, konstanta `LEAGUE_SHARE_OF_COMPETITION_BPS = 3_000`, `treasuryBalance`, `creatorBalance`, `accounted`, `_receive`, `_send`, `collectLaunchFee()` |
| `QualyraCompetitionVault.sol` | `enum Outcome {None,WinnerA,WinnerB,Draw,DisqualifiedA,DisqualifiedB,Void}`, `struct Battle{tokenA,startTime,tokenB,proposedAt,outcome,finalized,asset,pot,datasetHash,resultHash}`, `struct Schedule`, `pendingBattlePot[token][asset]`, `depositBattleFees`, `depositLeagueFees`, `scheduleBattles`, `_seedFromPending`, `proposeBattleResult`, `vetoBattleResult`, `finalizeBattle`, `_fundBuyback`, `_addToLeague`, `activeBattleOf`, `isBattlePotOpen`, `BATTLE_DURATION=24h`, `BATTLE_CHALLENGE_PERIOD=24h`, `SCORE_SCALE=1e18`, `DRAW_MARGIN=1e16` |
| `QualyraBondingCurve.sol` | `buy()`, `sell()`, `_sendFees(tradeFee, creatorTax)` (memanggil `collectFees(..., battleId=0)`), `spotPrice()`, `quoteReserve`, `tokenReserve`, `phantomQuote`, `Phase{Trading,Completed,Graduated,Refunding}` |
| `QualyraHook.sol` | `beforeSwap`/`afterSwap`, `_accrue(key,config,tradeFee,creatorTax)` yang membaca `activeBattleOf`, `accruedFees[token][battleId]`, `sweepFees(token, battleId)`, `poolConfig` (`token`,`quoteIsCurrency0`), `poolKeyOf`, `registerPool` |
| `QualyraFactory.sol` | `Modules`, `initialize`, `setQuoteAsset`, `setFeeSplit`, `getLaunch` → `struct Launch{curve,creator,quoteAsset,launchedAt,creatorTaxBps,creatorShareBps,platformShareBps,competitionShareBps,snipeStartBps,snipeWindow,graduated}`, `isGraduated`, `markGraduated`, `owner()` (timelock), `hook()`, `feeVault()`, `competitionVault()`, `buybackBurner()` |
| `QualyraBuybackBurner.sol` | `fund(battleId, token, asset, amount)`, `executeBuyback(battleId, token)`, `Buyback{asset,total,remaining}`, `TRANCHES=4`, `TRANCHE_INTERVAL=30m`, `MAX_PRICE_IMPACT_BPS=500`, `QualyraLaunchToken(token).burn(...)` |
| `QualyraLaunchToken.sol` | `ERC20Burnable`, fixed supply, `totalSupply()`, `burn`/`burnFrom` (burned supply = `TOKEN_SUPPLY − totalSupply()`) |
| deploy | `deployments/46630.json`, `contracts/script/DeployQualyra.s.sol` (konstanta `ROBINHOOD_TESTNET_CHAIN_ID`, `ROBINHOOD_CHAIN_ID`, `NVDA/AAPL/SPY`, `setQuoteAsset` per-jaringan) |

---

## 2. Desain State / Storage Baru

Semua state baru diusulkan di **`QualyraCompetitionVault.sol`** (pusat logika battle + pot), kecuali disebut lain. Alasan: `activeBattleOf` sudah dibaca hook tiap swap dan `pendingBattlePot`/`_seedFromPending` sudah tinggal di sini.

### 2.1 `hasBattled[token]` — batas 1× seumur hidup + pembeda Fase 1 vs Fase 3
```solidity
mapping(address token => bool) public hasBattled;   // di QualyraCompetitionVault
```
- Diset `true` saat battle token pertama kali menjadi LIVE (bukan saat schedule; token bisa gugur sebelum start). **Rekomendasi:** set di titik pertama fee LIVE masuk pot **atau** saat `finalizeBattle` — lihat §3 & §6 untuk konsistensi.
- Dipakai `depositBattleFees`/routing untuk membedakan **Fase 1** (`false` → pendingBattlePot) vs **Fase 3** (`true` → treasury).
- Dipakai `scheduleBattles` untuk menolak menjadwalkan token yang sudah `hasBattled == true` (spec §2.1 "maksimal 1× seumur hidup") → tambah error `AlreadyBattled(token)`.

### 2.2 `contributionOf[battleId][token]` — kontribusi tiap token ke pot (untuk Draw/Void)
```solidity
mapping(uint256 battleId => mapping(address token => uint256)) public contributionOf;
```
- Diisi saat: (a) **seed** dari `pendingBattlePot` di `_seedFromPending`, dan (b) **fee LIVE** token itu masuk pot di `depositBattleFees`.
- Invarian: `contributionOf[battleId][tokenA] + contributionOf[battleId][tokenB] == battle.pot` (untuk pot ETH/aset yang sama).
- Dipakai **hanya** untuk Draw & pure-Void: tiap token di-refund **kontribusinya sendiri** → buyback&burn token itu (A→A, B→B). BUKAN 50/50, BUKAN ke Trader League (spec §5.4/§5.5). Menggantikan cabang `Draw`/`Void` lama (`pot/2` dan `_addToLeague`).

### 2.3 Eligibility state per token
```solidity
struct Eligibility {
    uint48  firstCloseAt;   // timestamp CLOSE pertama MC >= $100k (0 = belum pernah)
    bool    eligible;       // true setelah bertahan >=100k melewati 24 jam
    bool    disqualified;   // permanen; sekali true tidak bisa eligible lagi
    uint48  disqualifiedAt; // untuk kasus "keduanya gugur": yang lebih awal = KALAH
}
mapping(address token => Eligibility) public eligibilityOf;
uint256 public constant MC_THRESHOLD_USD = 100_000e18;     // $100k dinormalisasi ke 18 desimal
uint256 public constant ELIGIBILITY_WINDOW = 24 hours;
```
- `firstCloseAt`: diset pada CLOSE pertama MC ≥ threshold (§4). Timer 24 jam berjalan dari sini.
- `eligible`: syarat schedule battle (selain `!hasBattled` & `graduated`).
- `disqualified`: DQ permanen (di luar battle). Sekali `true`, token tak bisa eligible lagi.
- `disqualifiedAt`: dipakai matriks finalize "keduanya gugur" — bandingkan timestamp.
- "currently-live-battle flag" **tidak perlu variabel baru**: sudah diturunkan dari `activeBattleOf(token) != 0`. Ini yang mem-branch DQ §4.1 (di luar battle) vs §4.2 (saat LIVE).

### 2.4 Konfigurasi Chainlink feed (CONFIGURABLE, per-network, via timelock)
Diusulkan di **`QualyraFactory.sol`** (registry yang sudah dibaca semua modul; owner = timelock), diusulkan modul baru `QualyraOracle` (library/contract) untuk logika baca harga.
```solidity
// di QualyraFactory
mapping(address asset => address) public priceFeedOf;   // ETH(address(0))->ETH/USD, NVDA->NVDA feed, dst
mapping(address feed  => uint256) public heartbeatOf;   // staleness threshold per feed
address public sequencerUptimeFeed;                     // L2 sequencer uptime feed
uint256 public sequencerGracePeriod;                    // mis. 3600 (1 jam)

function setPriceFeed(address asset, address feed, uint256 heartbeat) external onlyOwner;   // timelock
function setSequencerFeed(address feed, uint256 gracePeriod) external onlyOwner;            // timelock
```
- **TIDAK di-hardcode.** Alamat diisi saat deploy per-jaringan (spec §2.2.1) — simpan di `deployments/<chainId>.json` + di-set lewat `DeployQualyra.s.sol` yang memanggil `setPriceFeed`/`setSequencerFeed` melalui timelock.
- USDG (`config.usdg`) diperlakukan ≈ $1 bila tidak ada feed (konstanta `USDG_PRICE_USD = 1e18` atau feed jika tersedia).
- Stock feed (NVDA/AAPL/SPY) **sudah multiplier-adjusted** → jangan dikali manual (spec §2.2).

---

## 3. Perubahan Fee-Routing (titik hook persis)

**Sumber fee tidak berubah:** tetap dari `QualyraBondingCurve._sendFees` (pra-graduation) dan `QualyraHook.sweepFees` (post-graduation), keduanya berujung ke `QualyraFeeVault.collectFees(token, tradeFee, creatorTax, battleId)`. Split 1% = 70% creator / 15% platform / 15% competition tetap dihitung di `collectFees` via `launch.competitionShareBps`. **Yang berubah = cabang di dalam `collectFees` untuk 15% competition, dan cabang di `depositBattleFees`.**

Titik keputusan routing tunggal yang diusulkan: pindahkan logika sub-split (`leagueShare`/`battleShare`) sepenuhnya ke **`QualyraCompetitionVault`**, atau tetap di `collectFees` tapi tanya status ke competition vault. **Rekomendasi:** `collectFees` tetap mengirim `competitionAmount` utuh ke competition vault lewat satu entry `depositCompetitionFees(battleId, token, asset, amount)` (baru), dan competition vault yang memutuskan cabang — agar semua flag (`hasBattled`, `activeBattleOf`) dibaca di satu tempat, menghindari inkonsistensi antar modul.

| Fase | Kondisi | Routing 15% competition | Delta kode |
|---|---|---|---|
| **Fase 1** | `!hasBattled[token]` & `activeBattleOf==0` | **70% → `pendingBattlePot[token]`**, 30% → Trader League (`_addToLeague`) | Sesuai perilaku sekarang (`LEAGUE_SHARE_OF_COMPETITION_BPS`). Tetap. |
| **Fase 2 (LIVE)** | `activeBattleOf(token)==battleId` (pot open) | **100% (70%+30%) → pot** + **seed** `pendingBattlePot` saat start | **BERUBAH:** sekarang tetap kirim 30% ke league. Harus: seluruh `competitionAmount` → `battle.pot` **dan** `contributionOf[battleId][token] += competitionAmount`. Seed pending sudah lewat `_seedFromPending`; tambahkan `contributionOf += seeded` di sana. |
| **Fase 3** | `hasBattled[token]==true` & `activeBattleOf==0` | **70% → treasury**, 30% → Trader League | **BERUBAH:** 70% tidak lagi ke pending; ke `treasuryBalance[asset]` (di FeeVault) — bila logika pindah ke competition vault, teruskan 70% balik ke treasury via jalur baru. |
| **DQ §4.1 (pre-battle)** | `disqualified && !hasBattled` | **100% (fee 15% + SELURUH `pendingBattlePot[token]`) → treasury** | **BARU:** saat DQ diset, `pendingBattlePot[token][asset]` di-drain ke treasury sekali, dan fee competition berikutnya ikut treasury. Mencegah dana pending nyangkut. |
| **DQ §4.2 (during LIVE)** | `disqualified` sewaktu `activeBattleOf!=0` | **tetap 100% ke pot** hingga finalize | **BARU (perilaku):** DQ **tidak** mengubah routing selama LIVE; fee token gugur tetap ke pot + `contributionOf`. Battle tetap jalan penuh 24 jam. |

**Catatan seed:** `_seedFromPending(battleId, token, asset)` harus juga menambah `contributionOf[battleId][token] += seeded` supaya refund Draw/Void mengembalikan seed ke pemiliknya.

**Kapan `hasBattled[token]=true`:** paling aman diset saat token **pertama** menjadi LIVE (mis. pada `depositBattleFees` ketika `isBattlePotOpen==true` untuk pertama kali, atau via satu-shot flag di `activeBattleOf` path). Ini memastikan Fase 3 aktif segera setelah window LIVE, dan token gugur pre-battle **tidak** ikut menyetel `hasBattled` (biar cabang DQ §4.1 benar).

---

## 4. Engine Eligibility On-Chain (MC ≥ $100k, CLOSE-based, 24h)

**Rumus (spec §2.2):** `MC = usdPrice × (totalSupply − burnedSupply)`.
- `totalSupply()` dibaca dari `QualyraLaunchToken`. **burnedSupply = `TOKEN_SUPPLY (1e9 * 1e18) − totalSupply()`** karena token fixed-supply `ERC20Burnable` tanpa mint — sehingga `totalSupply − burnedSupply == totalSupply()` **hanya jika** definisi "supply" awal = TOKEN_SUPPLY. **Klarifikasi:** spec ingin *circulating* = supply beredar = `totalSupply()` setelah burn. Maka MC = `usdPrice × totalSupply()` (karena burn sudah mengurangi `totalSupply()`). Simpan `TOKEN_SUPPLY` acuan bila diperlukan supply awal.

**Titik pengecekan (CLOSE / post-trade settled), spec §2.3:**
- **Pra-graduation:** di akhir `QualyraBondingCurve.buy()` & `sell()` — setelah `quoteReserve`/`tokenReserve` diupdate (state CLOSE). Harga token dalam aset = `spotPrice()`; lalu ubah ke USD via feed aset (ETH/USD / USDG≈$1 / stock feed).
- **Post-graduation:** di `QualyraHook.afterSwap` — setelah swap selesai (CLOSE). Harga token dari pool (`getSlot0`/sqrtPrice) × harga USD aset.
- Karena kedua titik memanggil fungsi bersama, usulkan hook eligibility tunggal di competition vault: `onTradeClose(token, tokenPriceInAssetX, asset)` yang: baca sequencer+feed → hitung MC USD → update timer/eligible/DQ. Dipanggil dari curve & hook.

**Logika timer (spec §2.1):**
1. Jika `disqualified` → tidak ada aksi (permanen).
2. Hitung `mcUsd`. Jika **tidak dapat dievaluasi** (sequencer down / harga stale / oracle paused) → **RETURN tanpa aksi** (fail-safe §5), tidak menyetel timer, tidak DQ.
3. Jika `firstCloseAt==0` & `mcUsd >= MC_THRESHOLD_USD` → set `firstCloseAt = now` (timer mulai).
4. Jika `firstCloseAt!=0` & `!eligible`:
   - Jika `mcUsd < MC_THRESHOLD_USD`:
     - **di luar LIVE** → `disqualified=true; disqualifiedAt=now` + drain pending ke treasury (§4.1).
     - **saat LIVE** → tandai `disqualified=true; disqualifiedAt=now` **tanpa** mengakhiri battle / tanpa memindah fee ke treasury (§4.2). Battle jalan penuh.
   - Jika `now >= firstCloseAt + ELIGIBILITY_WINDOW` & `mcUsd >= threshold` → `eligible=true`.
- **Spike sesaat TIDAK memicu timer** karena hanya dievaluasi pada CLOSE (post-trade), bukan intraday.

---

## 5. Robustness Chainlink / Anti-Bug Oracle

Implementasi di modul `QualyraOracle` (dipakai eligibility engine). Pola diverifikasi standar Chainlink.

1. **Baca harga:** `AggregatorV3Interface(feed).latestRoundData()` → `(roundId, answer, startedAt, updatedAt, answeredInRound)`.
2. **Sanity:** `require(answer > 0)`, `require(updatedAt != 0)`, `require(updatedAt <= block.timestamp)`.
3. **Staleness:** `if (block.timestamp - updatedAt > heartbeatOf[feed]) → NOT-EVALUABLE` (jangan revert saat trade; kembalikan flag agar eligibility engine skip — trade tetap jalan).
4. **Desimal:** baca `feed.decimals()` (umumnya 8) → **normalisasi ke 18 desimal** (scale-up `10**(18-dec)`). Bandingkan MC ke `MC_THRESHOLD_USD = 100_000e18` dalam skala 18. Jangan truncate.
5. **Stock feed multiplier-adjusted:** JANGAN kali `uiMultiplier` manual (spec §2.2).
6. **Oracle pause (stock 24/5):** tangani `oraclePaused()` bila tersedia → NOT-EVALUABLE (bukan DQ).
7. **L2 Sequencer Uptime (WAJIB, Arbitrum Orbit):** baca `sequencerUptimeFeed`:
   - `answer == 0` = UP, `answer == 1` = DOWN.
   - Jika DOWN → NOT-EVALUABLE.
   - Jika baru pulih: `block.timestamp - startedAt <= sequencerGracePeriod` → NOT-EVALUABLE (grace period).
8. **FAIL-SAFE UTAMA:** setiap kondisi NOT-EVALUABLE → **jangan evaluasi MC, jangan DQ, jangan set timer** pada trade itu. Trade normal tetap sukses (eligibility tidak boleh memblokir trading). "Never punish on stale data."

---

## 6. Matriks Finalize (battle SELALU jalan penuh 24 jam — TIDAK ada finalize dini)

Semua pada `finalizeBattle(battleId)` setelah `BATTLE_CHALLENGE_PERIOD`. `hook.sweepFees` untuk kedua token dipanggil dulu (sudah ada) agar pot lengkap.

| Hasil | Kondisi | Aksi pot |
|---|---|---|
| **Winner normal / lawan DQ** | `WinnerA`/`WinnerB`, atau `DisqualifiedB`(A menang)/`DisqualifiedA`(B menang) | **100% pot → `_fundBuyback` token pemenang** (perilaku SEKARANG untuk WinnerX/DisqualifiedX — tetap). |
| **Keduanya gugur** | dua-duanya `disqualified`, `disqualifiedAt` BERBEDA | Yang `disqualifiedAt` **lebih kecil = KALAH**; survivor = **MENANG** → **100% pot → buyback&burn survivor**. **Selalu ada pemenang.** (BARU: butuh cabang membandingkan `eligibilityOf[A].disqualifiedAt` vs `[B]`.) |
| **Pure Void** | dua-duanya gugur di **blok/trade sama persis** (`disqualifiedAt` sama) | **Refund per kontribusi:** `_fundBuyback(battleId, A, asset, contributionOf[battleId][A])` + `... B ...`. **BUKAN** `_addToLeague`. |
| **Draw** | skor akhir seri (`lead < DRAW_MARGIN`) | **Refund per kontribusi** (sama seperti pure-Void): A→buyback&burn A, B→buyback&burn B. **BUKAN 50/50** (`pot/2`), **BUKAN** Trader League. |

**Delta pada `finalizeBattle` (kode sekarang):**
- Cabang `Draw` sekarang `pot/2` → **ganti** ke `_fundBuyback(...contributionOf[A])` + `_fundBuyback(...contributionOf[B])`.
- Cabang `else` (Void) sekarang `_addToLeague(asset, pot)` → **ganti** ke refund per kontribusi (sama seperti Draw).
- Cabang `DisqualifiedA/B` tetap → 100% ke lawan.
- **Tambah** cabang "keduanya gugur": jika A & B keduanya `disqualified` → survivor menang (bandingkan `disqualifiedAt`); jika `disqualifiedAt` sama → Void refund. Perlu diputuskan bagaimana operator mengekspresikan ini di `proposeBattleResult` (lihat §7) — kemungkinan **flag/outcome baru** atau operator mengirim `DisqualifiedA`/`DisqualifiedB` untuk "yang gugur duluan".

**Pemetaan ke `enum Outcome` yang ADA (None,WinnerA,WinnerB,Draw,DisqualifiedA,DisqualifiedB,Void):**
- `WinnerA/WinnerB` → menang normal.
- `DisqualifiedA` = A gugur → **B menang** (sudah benar di kode).
- `DisqualifiedB` = B gugur → **A menang**.
- `Draw` → refund per kontribusi (semantik BERUBAH dari 50/50).
- `Void` → refund per kontribusi (semantik BERUBAH dari league).
- **"Keduanya gugur, ada survivor"** dapat dipetakan ke `DisqualifiedA`/`DisqualifiedB` **berdasarkan yang gugur DULUAN** (yang duluan = kalah → outcome menunjuk survivor sebagai pemenang). **Tidak wajib enum baru**, tapi disarankan menambah flag on-chain `bothDisqualified` atau validasi silang dengan `disqualifiedAt` agar operator tidak bisa keliru. Ini **satu-satunya** area yang mungkin butuh field baru; putuskan saat implementasi.

---

## 7. Checklist Anti-Bug / Invariant

1. **Reentrancy:** `finalizeBattle` sudah `nonReentrant`; `_fundBuyback`→`IQualyraBuybackBurner.fund` (push ETH) harus tetap di dalam guard. Draw/Void kini memanggil `_fundBuyback` **dua kali** → pastikan efek state (`accounted -= amount`, set `finalized=true`) dilakukan **sebelum** call eksternal (checks-effects-interactions). `executeBuyback` sudah `nonReentrant`.
2. **Invarian pot (Draw/Void):** `contributionOf[b][A] + contributionOf[b][B] == battle.pot`. Uji properti. Tangani **dust/rounding**: bila jumlah kontribusi < pot karena pembulatan, tambahkan sisa ke salah satu (deterministik, mis. tokenA) agar tidak ada dana nyangkut.
3. **No double-count seed vs live fee:** `contributionOf` ditambah **tepat sekali** di `_seedFromPending` (seed) dan di `depositBattleFees` (live). Pastikan seed tidak juga terhitung sebagai live.
4. **One-battle-lifetime:** `scheduleBattles` menolak token dengan `hasBattled==true` (error `AlreadyBattled`). `_reserve` sudah cegah overlap/pending ganda — jangan sampai `hasBattled` diset terlalu dini (schedule) sehingga token gugur-pre-battle terkunci padahal belum pernah LIVE.
5. **Interaksi guardian veto / challenge window:** DQ-during-LIVE hanya **menandai**; pemenang tetap ditetapkan lewat `proposeBattleResult` → `vetoBattleResult` → `finalizeBattle` (alur sekarang). DQ **tidak** boleh memicu finalize dini maupun mem-bypass challenge period.
6. **DQ during LIVE ≠ akhiri battle / ≠ divert ke treasury:** fee token gugur tetap 100% ke pot sampai finalize; `activeBattleOf` tetap mengembalikan battleId selama window.
7. **Refund tidak meninggalkan dana nyangkut:** untuk Draw/Void, seluruh `pot` habis ke dua `_fundBuyback` (jumlah kontribusi = pot, dust ditangani poin 2).
8. **Token kontribusi nol:** bila `contributionOf[b][X]==0`, `_fundBuyback` sudah `if (amount==0) return;` — aman, tidak revert.
9. **Presisi integer MC:** bandingkan dalam skala 18 desimal seragam; hindari overflow (`usdPrice`(18) × `totalSupply`(≤1e9·1e18=1e27) muat di uint256; gunakan `Math.mulDiv`).
10. **DQ §4.1 drain pending sekali:** setelah `pendingBattlePot[token][asset]` dipindah ke treasury, set 0 agar tidak dobel-drain; fee competition berikutnya rute treasury karena `disqualified`.
11. **Eligibility tidak boleh mem-block trading:** semua path oracle NOT-EVALUABLE = no-op; trade tetap sukses.
12. **`hasBattled` vs `graduated`:** hanya token graduated & eligible yang bisa dijadwalkan (kondisi `scheduleBattles` sekarang cek `isGraduated`; tambah cek `eligibilityOf[token].eligible`).

---

## 8. Daftar Perubahan Per-File

- **`QualyraCompetitionVault.sol`** (pusat perubahan):
  - Tambah `hasBattled`, `contributionOf`, `eligibilityOf`, konstanta MC/window, error `AlreadyBattled`/`NotEligible`.
  - Ubah `depositBattleFees` (routing Fase 2/3 + DQ branch + isi `contributionOf`).
  - Ubah `_seedFromPending` (isi `contributionOf`).
  - Ubah `scheduleBattles` (tolak `hasBattled`/`!eligible`).
  - Ubah `finalizeBattle` (Draw & Void → refund per-kontribusi; tambah cabang keduanya-gugur/survivor).
  - Tambah entry eligibility engine `onTradeClose(...)` + integrasi oracle; set `hasBattled` di titik LIVE.
- **`QualyraFeeVault.sol`:** ubah `collectFees` — 15% competition tidak lagi selalu 30% league saat LIVE; teruskan status/keputusan ke competition vault (atau tambah `depositCompetitionFees`). Fase 3 70% → `treasuryBalance`.
- **`QualyraBondingCurve.sol`:** panggil `onTradeClose(...)` di akhir `buy()`/`sell()` (CLOSE). Sumber harga: `spotPrice()`.
- **`QualyraHook.sol`:** panggil `onTradeClose(...)` di akhir `afterSwap` (CLOSE). Sumber harga: `getSlot0`/sqrtPrice.
- **`QualyraFactory.sol`:** tambah `priceFeedOf`, `heartbeatOf`, `sequencerUptimeFeed`, `sequencerGracePeriod` + setter `setPriceFeed`/`setSequencerFeed` (`onlyOwner`=timelock). (Alternatif: modul `QualyraOracle` terpisah yang dirujuk factory.)
- **Interfaces:** `IQualyraCompetitionVault` (tambah `onTradeClose`, view `eligibilityOf`, `hasBattled`, `contributionOf`), `IQualyraFactory` (getter feed), mungkin `IQualyraFeeVault` (`depositCompetitionFees`).
- **Modul baru (opsional tapi disarankan):** `QualyraOracle.sol` (library/contract) — enkapsulasi latestRoundData + staleness + sequencer + normalisasi desimal.
- **Deploy config:** `deployments/46630.json` (tambah blok `feeds`: ETH/USD, USDG, NVDA, AAPL, SPY, sequencerUptimeFeed + heartbeat + gracePeriod, per-jaringan) dan `DeployQualyra.s.sol` (panggil `setPriceFeed`/`setSequencerFeed` per chainId 46630/4663, alamat dari registry — TODO isi alamat aktual).

---

## 9. Test Plan (Foundry)

Basis: `contracts/test/utils/CompetitionTestBase.sol` (`_scheduleBattle`, `_proposeBattle`, `_settledBattle`, `_graduatedEthLaunch`), `MockERC20`. **Tambah** `MockV3Aggregator` (feed harga) + `MockSequencerFeed`.

**Fee routing per fase** (perluas `QualyraPendingPot.t.sol`, `QualyraFeeVault.t.sol`, `QualyraTraderLeague.t.sol`):
- Fase 1: 70% pending / 30% league (regresi — sudah ada `test_depositBattleFees_withNoOpenBattle_holdsPending`).
- Fase 2 LIVE: 100% ke pot (BARU — sekarang `test_depositBattleFees_withOpenBattle_fillsThePot` tidak menguji bahwa 30% league juga masuk pot).
- Fase 3: `hasBattled==true` → 70% treasury / 30% league (BARU).
- Seed pending saat start mengisi `contributionOf` (perluas `test_scheduleBattles_seedsThePotFromPending`).

**Eligibility timer / DQ** (file baru `QualyraEligibility.t.sol`):
- CLOSE pertama ≥100k memulai timer; spike intraday tidak.
- MC turun <100k dalam window (di luar battle) → DQ permanen + pending → treasury (§4.1).
- Bertahan >24h → `eligible=true`; schedule butuh eligible.
- Berlaku di dua fase (curve + pool/hook).

**Oracle fail-safe** (file baru `QualyraOracle.t.sol`):
- `updatedAt` stale > heartbeat → NOT-EVALUABLE, trade tetap sukses, tidak DQ.
- Sequencer DOWN (`answer==1`) → NOT-EVALUABLE.
- Sequencer baru pulih dalam grace period → NOT-EVALUABLE.
- Normalisasi desimal (8→18) benar; MC threshold tepat.
- Oracle paused (stock) → NOT-EVALUABLE.

**Finalize outcomes** (perluas `QualyraTokenLeague.t.sol` — ada `Draw`, `Void`, `DisqualifiedA` tests):
- Winner normal / lawan DQ → 100% pot buyback&burn (regresi + `test_finalize_winnerPotGoesToBuybackIncludingUnsweptFees`).
- **Draw → refund per kontribusi** (UBAH `test_...Draw...` dari 50/50; verifikasi A→A, B→B).
- **Void → refund per kontribusi** (UBAH `test_voidBattle_sendsThePotToTheLeague` — semantik berubah, tidak lagi ke league).
- Keduanya gugur beda waktu → survivor menang (BARU).
- Keduanya gugur blok sama → pure Void refund (BARU).
- DQ during LIVE tidak akhiri battle dini; fee gugur tetap ke pot (BARU).

**One-battle-lifetime:** schedule token `hasBattled==true` revert `AlreadyBattled` (BARU). Regresi `QualyraAttacks.t.sol`.

**Invariant** (perluas `contracts/test/invariant/QualyraFeeFlow.invariant.t.sol`): tambah `invariant_contributionSumEqualsPot`.

---

## 10. Urutan Implementasi (dependency-aware) — INI RENCANA, belum ada kode diubah

1. **`QualyraOracle`** (baca feed + staleness + sequencer + normalisasi desimal) + `MockV3Aggregator`/`MockSequencerFeed` + unit test fail-safe. (Fondasi; tidak menyentuh flow fee.)
2. **Config feed di Factory** (`priceFeedOf`/`heartbeatOf`/`sequencerUptimeFeed`/gracePeriod + setter timelock) + update `DeployQualyra.s.sol` & `deployments/46630.json`.
3. **State eligibility** di CompetitionVault (`eligibilityOf`, konstanta) + fungsi `onTradeClose` (logika timer/DQ), pakai (1)+(2).
4. **Integrasi CLOSE** di `QualyraBondingCurve` & `QualyraHook` (panggil `onTradeClose`). Test dua-fase.
5. **`hasBattled`** + guard `scheduleBattles` (one-battle-lifetime + eligible).
6. **`contributionOf`** + isi di `_seedFromPending` & `depositBattleFees`.
7. **Fee routing** Fase 2/3 + DQ §4.1/§4.2 di `collectFees`/`depositBattleFees`.
8. **`finalizeBattle`** Draw/Void refund per-kontribusi + cabang keduanya-gugur/survivor.
9. **Test** menyeluruh (per §9) + invariant kontribusi=pot.
10. **Sinkronisasi dokumen** (`README.md`, `Concept-documents.md`, `indexer/README.md`) sesuai spec §9 — dilakukan setelah kode stabil.

> **Penegasan:** Dokumen ini adalah RENCANA. **Tidak ada file `.sol` atau source lain yang dimodifikasi** pada tahap code-mapping ini.

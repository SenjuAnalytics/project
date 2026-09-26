# Qualyra — Daftar Masalah & Saran Perbaikan

> Dasar: pembacaan utuh `contracts/src` + test suite + `indexer/` + `frontend/` pada commit `b135a53`.
> Sudah dikoreksi setelah membaca test: **dua** hal yang tadinya terlihat seperti bug ternyata
> **sengaja** dikunci oleh test (ditandai **[by design]** di bawah). Tidak ada kode yang diubah.
> Belum ada `forge test` yang dijalankan dari sini (forge & node_modules tidak terpasang di sandbox;
> RPC Robinhood diblokir), jadi semua ini hasil pembacaan, bukan hasil eksekusi.

**Ringkasan: tidak ada celah yang bisa mencuri dana.** Yang ada: (a) satu jalur di mana uang bisa
**beku** kalau operator mati, (b) dua kebijakan yang perlu Anda putuskan, (c) beberapa kekakuan
robustness, (d) 3 masalah frontend/indexer yang jadi penghalang rencana custom pair.

---

## Status implementasi (diperbarui setelah Batch 1+2)

Batch **1 (liveness)** dan **2 (pending & routing)** sudah dikerjakan di working tree (belum
di-commit, belum `forge test` di mesin Anda):

| ID | Status | Di mana |
|---|---|---|
| **Q-1** | **Selesai** | `expireBattle` (Void permissionless, 72 jam) + `skipWeek` (14 hari) di vault; keeper mengirim keduanya. Test: `QualyraTokenLeague.t.sol` (liveness battle), `QualyraTraderLeague.t.sol` (skipWeek). |
| **Q-2** | **Selesai (lebih dari default)** | Keeper: `TokenState.firstCloseAt` + kondisi *limbo* di `tokensToPoke`. **Plus** tier kontrak `UNRESOLVED_PENDING_GRACE = 90 hari` di `isPendingExpired` — diambil karena keputusan Q-3 (harga basi = NOT-EVALUABLE) membuat poke tidak bisa lagi menyelesaikan token ber-pool mati; ISSUE-LIST §Q-3 sendiri menyebut jalur tier ini. Test lama `test_aTokenThatStartedItsTimer_neverExpires` diganti nama + ditambah `test_aTimerThatNeverResolves_expiresAfterTheUnresolvedGrace`. |
| **Q-3** | **Selesai** | `MAX_PRICE_AGE = 7 hari` di `QualyraHook.twapOf` (sama dengan `QualyraFees.PRICE_STALENESS_LIMIT`); pool basi = not-ready = not-evaluable. Test TWAP ditambah (`test_averageGoesNotReadyWhenThePoolGoesQuiet`). |
| **Q-6** | **Selesai** | `_settle` men-drain pending kedua token ke treasury saat battle selesai. Test `test_settle_drainsPendingLeftBehindForABattledToken`. |
| **Q-7** | **Selesai (ternyata tidak reachable)** | `rolloverUnclaimed` sekarang melompati minggu target yang sudah final; saat implementasi terbukti skenario aslinya tidak bisa terjadi (target `currentWeek()` tidak pernah punya `finalizedAt`). Guard tetap dipasang sebagai pertahanan. |
| **Q-8** | **Selesai** | `QualyraFeeVault` memakai `competition.isPendingExpired(token)` — satu definisi. |
| **Q-4** | **Diputuskan: tetap Fase 3** | Spec §3.2/§3.3/§3.4 diperjelas ("battle selesai" = window LIVE berakhir, bukan finalize). Kode tidak berubah. |
| **Q-12/13/14** | **Selesai** | Tabel hadiah league 40/30/15/10/5 (§5.2) + pool-only & harga basi (§2.2) di spec; §6 TWAP-HARDENING ditandai selesai. |

> **Wajib dijalankan di mesin Anda setelah ini:** `forge build`, lalu `node scripts/sync-abi.mjs`
> (ABI baru: `expireBattle`, `skipWeek`, `isPendingExpired` — tanpa ini keeper tidak bisa mengirim
> fungsi baru), lalu `forge test`. Indexer: `npm test` (66 test, lulus di sandbox).

---

## 0. Tabel ringkas (urut prioritas)

| ID | Tingkat | Area | Masalah singkat | Butuh keputusan? | Ukuran perbaikan |
|---|---|---|---|---|---|
| **Q-1** | **Tinggi** | Vault / liveness | Kalau operator mati atau kuncinya hilang, **semua pot battle & pool hadiah mingguan beku**. Tidak ada jalur fallback: hanya operator yang boleh mengajukan hasil. | Ya (pilih bentuk fallback) | Sedang (±120 baris + test) |
| **Q-2** | Sedang | Vault + indexer | Token yang **timer 24 jam-nya sudah mulai** lalu pool-nya sepi: tidak pernah eligible, tidak pernah DQ, pending-nya menumpuk tanpa jalur otomatis (keeper tidak mem-poke, `releaseExpiredPending` menolak). **[by design]**, tapi lubangnya nyata. | Ya (perlu tier kedua?) | Kecil (indexer saja) |
| **Q-3** | Sedang | Hook / oracle | TWAP **tanpa batas umur**: pool sepi 3 minggu tetap melaporkan harga terakhir sebagai rata-rata sah → sebuah poke bisa membuat token **eligible** (dapat akses uang battle) dari harga basi. | Ya | Kecil (±5 baris + test) |
| **Q-4** | Sedang | Routing fee | Fee yang terjadi **setelah window live 24 jam** (masa sanggah + jeda finalize) masuk Fase 3: 70% treasury / 30% league, bukan ke pot. **[by design, ada test]** — spec ambigu. | Ya | Sangat kecil (1 baris) atau 0 (update spec) |
| **Q-5** | Sedang | Factory / custom pair | Belum ada **probe transfer** saat mendaftarkan quote asset → token fee-on-transfer / rebasing bisa merusak akuntansi curve & vault. Tidak berbahaya sekarang (listing manual), jadi penghalang begitu pintu permissionless dibuka. | Ya (ikut custom pair) | Kecil |
| **Q-6** | Rendah | Vault | `pendingBattlePot` milik token yang **sudah bertanding** tidak punya pintu keluar sama sekali (tidak bisa DQ lagi, tidak bisa expired). Dana parkir permanen. | Tidak | Sangat kecil |
| **Q-7** | Rendah | Trader League | `rolloverUnclaimed` bisa menggulirkan dana ke **minggu yang klaimnya sudah tutup** → dana tersangkut (tidak bisa diklaim lagi). | Tidak | Sangat kecil |
| **Q-8** | Rendah | Vault + FeeVault | Ada **dua definisi** "pending expiry" yang tidak identik (FeeVault tanpa pengecualian grace graduasi) → perilaku bisa berbeda di jendela sempit. | Tidak | Kecil |
| **Q-9** | Rendah* | Frontend | `getQuoteAssetPriceUsd` fallback ke **$1** untuk simbol tak dikenal → harga palsu untuk pair baru. | Tidak | Sangat kecil |
| **Q-10** | Rendah | Frontend | Pengukuran reserve pool memakai `balanceOf(pool)` — **tidak berlaku untuk v4** (token ada di PoolManager), lalu jatuh ke angka hardcoded yang tampil seolah reserve nyata. | Tidak | Kecil |
| **Q-11** | Rendah* | Indexer | `PAIR_ASSETS` hardcoded → token pair baru **tak terlihat** oleh leaderboard/scoring. | Tidak | Kecil |
| **Q-12** | Dokumen | Spec | `FEE-AND-BATTLE-SPEC.md` **belum punya tabel hadiah Trader League**; kode & README sudah 40/30/15/10/5 (top 5). | Tidak | Sangat kecil |
| **Q-13** | Dokumen | Spec | Spec §2.2 bilang eligibility berlaku **di curve & pool**; kenyataannya **pool-only** (MC maksimum di curve ≈ 20,58 ETH ≈ $54,7k). | Tidak | Sangat kecil |
| **Q-14** | Dokumen | Design note | `TWAP-HARDENING-DESIGN.md §6` masih mencantumkan "sticky eligibility" sebagai open decision, padahal sudah diselesaikan (aturan continuous-maintenance). | Tidak | Sangat kecil |

\* Rendah hari ini, tapi **penghalang** begitu fitur custom pair dibuka.

---

## 1. Detail masalah & perbaikan

### Q-1 — Operator adalah titik tunggal kegagalan untuk semua hadiah **[Tinggi]**

**Apa yang terjadi.** Hanya `operator` yang boleh memanggil `proposeBattleResult`
(`QualyraCompetitionVault.sol:499`) dan `proposeWeeklyWinners` (`:650`). Guardian hanya bisa
**memveto** hasil yang sudah diajukan (`:537`, `:683`) dan membatalkan battle **sebelum** mulai
(`:598`, `revert BattleStarted` setelah mulai). Tidak ada satu pun fungsi yang bisa menutup battle
atau minggu tanpa operator.

**Dampak.**
- Operator kehilangan kunci / server mati → pot battle dan seluruh pool hadiah mingguan **beku
  tanpa batas waktu**. Semakin lama, semakin besar dana yang terkunci di dalam kontrak.
- Battle yang sudah mulai tidak bisa dibatalkan; satu-satunya pengaman hasil palsu adalah veto
  guardian dalam 24 jam.
- Satu-satunya jalan keluar adalah prosedur darurat berat: `pause()` → `migrate(newVault)` →
  `sweepToSuccessor` (`:800-828`), dan kontrak penggantinya harus menghormati ledger lama secara
  manual. Ini bukan jalur operasional yang sehat.

**Saran perbaikan (2 fungsi kecil, prinsipnya "tidak ada yang boleh memilih pemenang").**

1. Tambahkan jalur **Void permissionless** untuk battle yang telat:
```solidity
uint256 public constant BATTLE_RESULT_GRACE = 72 hours;

/// @notice Menutup battle yang tidak pernah dilaporkan. Setelah masa tenggang, pot dikembalikan ke
///         kontribusi masing-masing token (Void) — tidak ada yang boleh menobatkan pemenang di sini.
function expireBattle(uint256 battleId) external nonReentrant whenNotPaused notMigrated {
    Battle storage battle = _battles[battleId];
    if (battle.tokenA == address(0) || battle.finalized) revert UnknownBattle();
    if (battle.outcome != Outcome.None) revert NoPendingResult(); // ada hasil → jalur normal
    if (block.timestamp < uint256(battle.startTime) + BATTLE_DURATION + BATTLE_RESULT_GRACE) revert TooEarly();
    _settle(battleId, Outcome.Void); // faktor keluar dari finalizeBattle agar tidak duplikasi
}
```
2. Tambahkan jalur sama untuk Trader League: `skipWeek(week)` permissionless setelah, mis.
   14 hari tanpa proposal → `weekPool[week]` digulirkan ke minggu berjalan dan minggu itu ditutup
   (tidak ada yang bisa mengklaim untuk dirinya sendiri).

**Test yang perlu ditambah** (`QualyraTokenLeague.t.sol`, `QualyraTraderLeague.t.sol`):
sebelum tenggang masih revert; sesudah tenggang Void berjalan dan pot kembali ke dua token;
`expireBattle` tidak bisa dipakai kalau operator sudah mengajukan hasil; `skipWeek` menggerakkan dana.

**Keputusan Anda:** (a) pakai `Void` (paling aman, tanpa pilihan pemenang) atau (b) beri guardian
hak mengajukan hasil setelah tenggang (lebih cepat, tapi menambah kekuatan guardian)? Saya sarankan (a).

---

### Q-2 — Pending pot "limbo": timer jalan, pool sepi, tidak ada jalur otomatis **[Sedang] [by design]**

**Apa yang terjadi.** `isPendingExpired` (`:885`) langsung `return false` bila `firstCloseAt != 0`,
dan keeper hanya mem-poke token yang: sedang di battle, sedang di drop, atau sedang *bookable*
(`indexer/src/operator/plan.ts:163-186`). Jadi keadaan ini tidak tersentuh siapa pun:

```
firstCloseAt != 0   (timer 24 jam pernah mulai)
eligible   = false  (belum genap 24 jam, lalu tidak ada laporan lagi)
disqualified = false
belowSince = 0      (tidak sedang drop)
hasBattled = false
```
→ keeper tidak mem-poke, `releaseExpiredPending` menolak, dan bagian battle (70% dari 15%
competition) menumpuk terus di `pendingBattlePot` tanpa ujung.

**Status:** perilaku ini **sengaja** dikunci test
(`test_aTokenThatStartedItsTimer_neverExpires` di `QualyraPendingExpiry.t.sol`) dengan alasan token
masih dianggap kandidat. Tapi lubangnya nyata: kandidat yang pool-nya mati tidak pernah
diselesaikan oleh sistem.

**Dampak.** Dana menunggu manusia. Tidak hilang (siapa pun boleh memanggil `pokeEligibility` yang
permissionless, `:333`), tapi tanpa intervensi manual tidak ada yang menyelesaikannya.

**Saran perbaikan (pilih satu atau keduanya).**

1. **Perbaikan keeper saja, tanpa ubah kontrak (saya sarankan ini dulu).** Bawa `firstCloseAt` ke
   `TokenState` (saat ini dibaca lalu dibuang: `indexer/src/operator/chain.ts:207`, `eligibility[0]`),
   lalu tambahkan kondisi limbo ke `tokensToPoke`:
```ts
const limbo = t.firstCloseAt !== 0 && !t.eligible && !t.disqualified && !t.hasBattled;
const matters = inBattle.has(key) || limbo || (t.belowThresholdSince !== 0 && !t.hasBattled) || (opts.bookingOpen && isBookable(t));
```
   Efeknya bagus dan **menyelesaikan sendiri**: poke → kalau harga masih ≥ $100k rata-rata, token
   jadi **eligible** (lalu bisa di-booking); kalau di bawah, **DQ** → pending dibersihkan ke treasury.
2. **Tier kedua di kontrak (opsional, mengubah test di atas).** Perluas `isPendingExpired`: bila
   timer pernah mulai tapi token tetap tidak eligible & tidak DQ setelah, mis. 90 hari, pending
   boleh dilepas ke treasury. Ini menjaga invariant "tidak ada dana menunggu manusia".

**Test:** satu test keeper (limbo → poke terpanggil), dan bila memilih (2), test tier 90 hari.

**Keputusan Anda:** cukup (1), atau (1)+(2)?

---

### Q-3 — TWAP tanpa batas umur harga terakhir **[Sedang]**

**Apa yang terjadi.** `twapOf` (`QualyraHook.sol:164-171`) menentukan `ready` hanya dari
`readyWindow`; `updatedAt` (= waktu swap terakhir) **dilaporkan tapi tidak pernah jadi syarat**.
Rata-rata memang dirancang "menahan harga terakhir" (pool sepi diisi harga terakhir).

**Dampak.** Pool yang tidak trading lama tetap melaporkan harga terakhirnya sebagai rata-rata yang
sah. Karena sisi USD (Chainlink) selalu segar, MC bisa naik/turun hanya karena **aset pair**
bergerak. Akibatnya sebuah `pokeEligibility` bisa:
- menjadikan token **eligible** (membuka akses ke uang battle) padahal tokennya sendiri tidak
  diperdagangkan sejak lama, atau
- men-DQ token berdasarkan harga yang sudah basi.

Untuk keputusan yang memindahkan uang nyata, "harga terakhir yang tak diketahui umurnya" sebaiknya
tidak dipakai.

**Saran perbaikan.** Tambahkan batas umur, dan perlakukan yang basi sebagai NOT-EVALUABLE (no-op,
konsisten dengan fail-safe yang sudah ada):
```solidity
uint256 public constant MAX_PRICE_AGE = 7 days;

function twapOf(address token) external view returns (uint256 price18, bool ready, uint256 updatedAt) {
    PriceObservation memory o = _observations[token];
    if (o.lastTime == 0) return (0, false, 0);
    updatedAt = o.lastTime;
    (uint256 previousSum, uint256 currentSum) = _sumsAt(o, block.timestamp);
    (price18, ready) = _average(previousSum, currentSum, o.readyWindow);
    // Harga yang tidak dipercaya umurnya tidak boleh memulai timer, men-DQ, atau menobatkan apa pun.
    if (ready && block.timestamp > uint256(o.lastTime) + MAX_PRICE_AGE) ready = false;
}
```
Catatan interaksi: dengan ini, token yang pool-nya mati tidak bisa lagi DQ dari pergerakan aset.
Karena itu **Q-2 perlu dikerjakan bersamaan** supaya token seperti itu tetap punya jalur
penyelesaian dana (poke tidak akan mengubah state kalau harga basi → jalur tier-90-hari memegang
peran itu).

**Keputusan Anda:** setuju "basi = NOT-EVALUABLE untuk kedua arah" (saran saya), atau basi hanya
dilarang untuk *masuk* eligible tapi tetap boleh untuk DQ?

---

### Q-4 — Fee setelah window live tidak masuk pot **[Sedang] [by design, ada test]**

**Apa yang terjadi.** `feeBucketOf` (`:853-856`) mengembalikan `battleId` hanya selama
`block.timestamp < startTime + BATTLE_DURATION`. Fee setelah 24 jam live (yaitu selama **masa
sanggah 24 jam + jeda sebelum finalize**) ditandai bucket 0 → `_routeCompetition`
(`QualyraFeeVault.sol:182-236`) melihat `hasBattled == true` → **Fase 3**: 70% treasury +
30% Trader League.

**Status:** ini **disengaja dan dikunci test** — `test_lateBattleFeesGoToTreasuryAndLeague`
(`QualyraAttacks.t.sol`) secara eksplisit menyatakan token "sudah memakai battle seumur hidupnya
(Phase 3)". Jadi bukan bug. Yang kurang: `FEE-AND-BATTLE-SPEC.md §3.2/§3.3` tidak menjelaskan
bahwa "battle selesai" = window live berakhir, **bukan** battle di-finalize.

**Dampak.** Pot pemenang kehilangan aliran fee selama minimal 24 jam (masa sanggah) di **setiap**
battle. Kalau pot adalah daya tarik utama platform, ini perlu diputuskan secara sadar, bukan
dibiarkan ambigu.

**Saran perbaikan (pilih satu).**
- **(a) Ikuti spec §3.2** (fee selama pot masih terbuka → pot): ubah satu baris —
```solidity
function feeBucketOf(address token) external view returns (uint256) {
    Schedule memory schedule = _schedules[token];
    if (schedule.startTime == 0) return 0;
    return _battles[schedule.battleId].finalized ? 0 : schedule.battleId;
}
```
  lalu perbarui `test_lateBattleFeesGoToTreasuryAndLeague`. **Peringatan:** ini mengikat aliran fee
  ke liveness operator → **Q-1 wajib lebih dulu**, kalau tidak fee akan terus mengalir ke pot yang
  tidak bisa ditutup.
- **(b) Ikuti kode** (Fase 3): cukup perjelas spec §3.2/§3.3 + README bahwa "selesai" = window live
  berakhir (bukan finalize), plus alasan singkatnya. Nol risiko, nol kode.

**Keputusan Anda:** (a) pot dapat fee masa sanggah, atau (b) tetap Fase 3 dan spec yang menyesuaikan?

---

### Q-5 — Belum ada probe transfer untuk quote asset baru **[Sedang — penghalang custom pair]**

**Apa yang terjadi.** `setQuoteAsset` memverifikasi `decimals()` (6–36) dan menjalankan
`checkEconomics`, tapi tidak pernah menguji **perilaku transfer**. Token fee-on-transfer,
rebasing, atau yang memblokir transfer bisa lolos.

**Dampak.** Aman selama listing manual (tim memverifikasi off-chain). Begitu pendaftaran dibuka
untuk umum, token seperti itu bisa merusak akuntansi curve (`quoteReserve`) dan pola
"kirim dulu, baru lapor" di vault (`_receive` membandingkan saldo nyata → revert terus-menerus,
atau lebih buruk: selisih senyap untuk token yang memotong saat keluar).

**Saran perbaikan.** Probe di dalam transaksi pendaftaran (lihat `CUSTOM-PAIR-DESIGN.md §5.3`):
```solidity
function _probeTransfer(address asset, address from, uint256 amount) private {
    uint256 before = IERC20(asset).balanceOf(address(this));
    IERC20(asset).safeTransferFrom(from, address(this), amount);
    if (IERC20(asset).balanceOf(address(this)) != before + amount) revert InvalidAssetTransfer();
    IERC20(asset).safeTransfer(from, amount);
    if (IERC20(asset).balanceOf(address(this)) != before) revert InvalidAssetTransfer();
}
```
Ditambah tombol mati yang sudah ada (`disableQuoteAsset`) sebagai jaring terakhir.

---

### Q-6 — `pendingBattlePot` token pasca-battle tidak punya pintu keluar **[Rendah]**

**Bukti.** Setelah battle berakhir, `_evaluate` langsung `return` untuk token yang sudah di-booking
(`:352-354`) → tidak bisa DQ → `_drainPendingToTreasury` (`:1073`) tidak akan pernah terpanggil.
`isPendingExpired` juga `false` karena `firstCloseAt != 0`.

**Dampak.** Kalau ada dana yang masuk ke `pendingBattlePot[token]` setelah battle (jalur tidak
normal, tapi mungkin), dana itu parkir permanen — tidak ada fungsi yang bisa mengeluarkannya.

**Saran perbaikan.** Saat `finalizeBattle`, bersihkan sisanya (idempoten, murah):
```solidity
// setelah pot disalurkan
if (pendingBattlePot[battle.tokenA][asset] != 0) _drainPendingToTreasury(battle.tokenA, asset);
if (pendingBattlePot[battle.tokenB][asset] != 0) _drainPendingToTreasury(battle.tokenB, asset);
```
Token yang sudah bertanding tidak akan pernah battle lagi, jadi tujuan treasury selalu benar.

---

### Q-7 — `rolloverUnclaimed` bisa masuk ke minggu yang sudah tutup **[Rendah]**

**Bukti.** `rolloverUnclaimed` (`:758-782`) memakai `toWeek = currentWeek()`. Fungsi ini baru bisa
dipanggil `finalizedAt + 60 hari`, jadi minggu tujuan sudah ~8 minggu lebih maju — dan bisa saja
sudah difinalisasi **dan** semua hadiahnya sudah diklaim.

**Koreksi saat implementasi (penting).** Setelah menulis guard-nya, saya periksa ulang: **skenario ini
tidak reachable.** Baik `proposeWeeklyWinners`/`finalizeWeek` maupun `skipWeek` baru bisa menyentuh
sebuah minggu *setelah minggu itu berakhir* (`block.timestamp >= weekEndsAt(week)`). Artinya setiap
minggu yang punya `finalizedAt != 0` selalu **lebih kecil** dari `currentWeek()`, sehingga target
`toWeek = currentWeek()` tidak mungkin sudah final. Jadi ini bukan bug nyata — temuan saya yang terlalu
cepat. Guard `while (_weekResults[toWeek].finalizedAt != 0) ++toWeek;` tetap dipasang sebagai pertahanan
untuk perubahan aturan di masa depan (murah, tidak mengubah perilaku sekarang).

---

### Q-8 — Dua definisi "pending expiry" yang tidak identik **[Rendah]**

**Bukti.** `FeeVault._routeCompetition` (`:214`) memakai
`firstCloseAt == 0 && block.timestamp >= launchedAt + PENDING_EXPIRY`, sedangkan
`isPendingExpired` (`:885-893`) menambahkan pengecualian **grace** untuk token yang baru graduate
(menunggu TWAP siap 30–60 menit).

**Dampak.** Di jendela sempit (graduate < 1 jam sebelum ulang tahun ke-30), satu kali routing bisa
mengirim bagian battle ke treasury lebih cepat daripada yang dimaksud; sisanya baru dilepas
best-effort oleh fee berikutnya. Tidak ada dana hilang, tapi dua tempat yang seharusnya satu aturan
bisa berbeda.

**Saran perbaikan.** Satu predikat saja: tambahkan `isPendingExpired` ke `IQualyraCompetitionVault`
dan panggil dari `FeeVault` (hapus perhitungan `launchedAt` lokal).

---

### Q-9 — Frontend: fallback $1 untuk simbol tak dikenal **[Rendah, penghalang custom pair]**

**Bukti.** `frontend/lib/pricing.ts:40` → `return STOCK_FALLBACK_PRICES[sym] ?? 1`.

**Dampak.** Begitu pair baru di-list, UI menampilkan **$1/unit** untuk aset itu — angka palsu yang
terlihat seperti data nyata. Semua MC, volume, dan hadiah yang ditampilkan ikut salah.

**Saran perbaikan.** Balikkan menjadi *fail-closed*: `?? 0`, dan `quoteToUsd` mengembalikan
`undefined` saat rate tidak diketahui → UI menampilkan "—" (atau menyembunyikan angka USD), bukan
angka karangan.

---

### Q-10 — Frontend: reserve pool diukur dengan cara yang tidak berlaku untuk v4 **[Rendah]**

**Bukti.** `fetchOnchainPoolReserves` (`frontend/app/api/prices/route.ts:195`) memakai
`balanceOf(pool)` lewat `eth_call`. Di Uniswap v4 semua token setiap pool disimpan di
**PoolManager singleton**, jadi saldo di alamat pool = 0 → fungsi mengembalikan `null` → kode jatuh
ke angka **hardcoded** (`pooledBase = 4118060` untuk PONS, `8345598` untuk AI, `pooledQuote =
1121.21 / 890.39`) yang ditampilkan seolah reserve nyata.

**Dampak.** Data kedalaman pool di UI tidak dapat dipercaya (angka tetap dari kode). Ini juga
parameter yang akan dipakai untuk gate kedalaman di rencana custom pair, jadi ukurannya harus benar.

**Saran perbaikan.** Untuk v4, ukuran yang benar adalah likuiditas posisi:
`StateLibrary.getSlot0(poolId)` + `getLiquidity(poolId)` → nilai ≈ `2 × L × √P` (atau pakai
`reserve_in_usd` GeckoTerminal). Minimal: hapus jalur `balanceOf` + angka hardcoded supaya UI tidak
menampilkan reserve palsu.

---

### Q-11 — Indexer: `PAIR_ASSETS` hardcoded **[Rendah, penghalang custom pair]**

**Bukti.** `indexer/src/config.ts:177` mendaftar ETH/USDG/NVDA/AAPL/SPY beserta harga USD-nya.
Token dengan aset pair di luar daftar itu tidak dapat basis USD → tidak bisa dihitung Qualified
Volume-nya.

**Dampak.** Token pair baru tidak muncul di leaderboard/scoring; kalau nanti dibuat fallback $1,
hadiah akan salah hitung (lihat Q-9).

**Saran perbaikan.** Baca daftar pair dari factory (`quoteAssetCount`/`quoteAssetAt`/
`quoteAssetConfig`) + registry basis USD eksplisit per aset (Chainlink untuk yang punya feed,
harga anchored untuk yang tidak). **Fail-closed**: aset tanpa basis USD diberi tanda "dikecualikan",
bukan diberi harga 1 dolar.

---

### Q-12 / Q-13 / Q-14 — Tiga koreksi dokumen **[Sangat kecil]**

| ID | Dokumen | Yang perlu diubah |
|---|---|---|
| Q-12 | `docs/FEE-AND-BATTLE-SPEC.md` | Tambahkan tabel hadiah Trader League **40/30/15/10/5 (top 5)** — kode sudah begitu (`prizeShareBps`, `:925-931`) dan README + `Concept-documents.md` sudah setuju; hanya spec yang belum punya. |
| Q-13 | `docs/FEE-AND-BATTLE-SPEC.md §2.2` | Perjelas bahwa eligibility **hanya berjalan di pool**, bukan di curve: MC maksimum di curve ≈ 20,58 ETH (≈ $54,7k @ ETH $2.660; USDG ≈ $8k; NVDA ≈ $9,3k), jadi timer $100k memang mustahil sebelum graduasi. |
| Q-14 | `contracts/docs/TWAP-HARDENING-DESIGN.md §6` | Baris "sticky eligibility — masih open decision" sudah **usang**: aturan continuous-maintenance sudah diterapkan dan diuji. Tandai selesai agar tidak jadi asumsi salah di audit berikutnya. |

---

## 2. Status temuan lama (agar tidak tercampur)

| Temuan lama | Status sekarang |
|---|---|
| #1 Pending token non-eligible terkunci selamanya | **Sebagian.** `releaseExpiredPending` + `PENDING_EXPIRY` 30 hari sudah ada, tapi menyisakan kasus Q-2 (timer sudah mulai). |
| #2 Fee nyangkut di bucket 0 saat sweep | **Selesai** untuk penjadwalan (`_openPot` sweep bucket 0 lebih dulu, `:1018`). Sisa nuansanya Q-4 (kebijakan, bukan kebocoran). |
| #3 & #6 Manipulasi DQ kilat & harga rata-rata swap | **Selesai.** TWAP 30 menit + `DQ_DWELL` 30 menit + `recoveredAt`; ada test `test_oneDump_isNotEnough_butAHeldDropDisqualifies`, `test_aPriceMovedAndRestoredInOneBlock_leavesTheAverageAlone`. |
| #4 Token bisa dijadwalkan battle dua kali | **Selesai.** `hasBattled` di-set saat `_openPot`; ada test `test_schedule_booksATokenOnlyOnceInItsLifetime`. |
| #5 Urutan cek jendela 24 jam | **Digantikan** keputusan Anda: MC ≥ $100k harus dijaga terus sampai battle selesai (aturan continuous-maintenance). |
| #7 Hasil operator tidak dicek terhadap DQ on-chain | **Selesai.** `_disqualificationOutcome` + `forcedOutcomeOf`; test `test_propose_mustFollowTheDisqualificationRecord`. |
| Guardian cancel battle | **Selesai** (sebelum start); ada test `test_cancel_givesBothTokensTheirBattleBackBeforeTheStart`. |
| Fee creator perlu sweep manual | **Selesai.** `withdrawCreatorFees` men-sweep hook lebih dulu (`QualyraFeeVault.sol:124-126`). |
| Feed testnet kosong → battle belum bisa dites | **Masih.** Operasional: isi `FEED_*` atau pakai mock feed di 46630. |
| Kontrak testnet masih versi lama | **Masih.** Perlu redeploy + `npm run gen-deployments`. |

---

## 3. Yang sudah dipastikan benar (ringkas)

Pembagian fee 70/15/15 + creator tax; pola "kirim dulu, baru lapor" (tidak bisa memalsukan jumlah
fee); urutan reentrancy `creditTreasury` (sengaja tanpa guard, alasannya tepat); urutan `_openPot`
(sweep bucket 0 sebelum `hasBattled` di-set — gampang salah, tapi benar); matematika fee hook untuk
keempat bentuk swap + penolakan partial fill; **matematika TWAP saya uji aljabar** (jendela sejajar
UTC, denominator `WINDOW + t % WINDOW` → tepat `price` saat pool sepi); hysteresis DQ dua arah;
rute dana DQ (committed vs belum) melalui `isBattlePotOpen`; `_requireBattleReady` menolak token
yang sedang drop; graduasi (revert saat gas kurang → memaksa `eth_estimateGas` membiayai pembuatan
pool); locker tanpa jalur penarikan (dan callback `unlock` v4 tidak bisa dipancing pihak lain);
buyback 4 tranche + limit dampak 5% via `sqrtPriceLimitX96`; refund pro-rata; matriks wewenang
admin/operator/guardian; `renounceOwnership` diblokir; `prizeShareBps` berjumlah tepat 10.000.

---

## 4. Urutan kerja yang saya sarankan

| Batch | Isi | Hasil |
|---|---|---|
| **1 — Liveness** | Q-1 (+ keputusan bentuk fallback) | Tidak ada lagi dana yang bisa beku karena operator mati. |
| **2 — Pending & routing** | Q-2 (keeper), Q-6, Q-7, Q-8 | Tidak ada dana menunggu manusia; invariant pending bersih. |
| **3 — Kebijakan** | Q-3, Q-4 setelah Anda putuskan | Aturan main final antara pot & treasury; harga basi tidak lagi memutuskan. |
| **4 — Persiapan custom pair** | Q-5, Q-9, Q-10, Q-11 | 3 penghalang + 1 pengaman selesai, baru pintu pair dibuka. |
| **5 — Dokumen** | Q-12, Q-13, Q-14 | Satu sumber kebenaran antara kode, spec, README. |

Setiap batch: perubahan + regression test + update dokumen dalam satu commit, lalu Anda jalankan
`forge test` (build `via_ir` ±7 menit) karena saya tidak bisa menjalankannya dari sandbox.

**Yang saya butuhkan dari Anda untuk mulai:** jawaban atas 4 keputusan (Q-1 bentuk fallback, Q-2
cukup keeper atau plus tier 90 hari, Q-3 kebijakan harga basi, Q-4 pot vs Fase 3). Kalau Anda bilang
"saya ikut rekomendasimu", saya jalankan Batch 1 dan 2 sekaligus dengan pilihan default:
**Q-1 = Void permissionless + skipWeek**, **Q-2 = keeper saja dulu**, **Q-3 = basi = NOT-EVALUABLE**,
**Q-4 = tetap Fase 3 + spec yang diperjelas** (paling aman, dan tidak mengikat fee ke liveness).

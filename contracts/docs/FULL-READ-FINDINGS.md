# Qualyra — Full Contract Read: Findings

> Dasar: pembacaan **utuh** seluruh kontrak di `contracts/src` pada commit `b135a53` (branch
> `arena/01a0d9d0-project`). Semua temuan di bawah punya rujukan file:line. Tidak ada kode yang
> diubah. Build/test **tidak** dijalankan dari sini (forge & node_modules tidak terpasang di sandbox;
> RPC Robinhood diblokir) — jadi temuan di bawah adalah hasil pembacaan, bukan hasil eksekusi.

## 0. Cakupan pembacaan

| File | Baris | Status |
|---|---|---|
| `QualyraCompetitionVault.sol` | 1103 | dibaca penuh |
| `QualyraHook.sol` | 492 | dibaca penuh |
| `QualyraFactory.sol` | 453 | dibaca penuh |
| `QualyraBondingCurve.sol` | 407 | dibaca penuh |
| `QualyraFeeVault.sol` | 269 | dibaca penuh |
| `QualyraGraduationExecutor.sol` | 237 | dibaca penuh |
| `QualyraBuybackBurner.sol` | 219 | dibaca penuh |
| `QualyraOracle.sol` | 122 | dibaca penuh |
| `QualyraLiquidityLocker.sol` | 107 | dibaca penuh |
| `QualyraLaunchRouter.sol` / `QualyraLaunchDeployer.sol` / `QualyraLaunchToken.sol` | 69/64/27 | dibaca penuh |
| `periphery/QualyraSwapRouter.sol` | 137 | dibaca penuh |
| `libraries/QualyraFees.sol` + 8 interface | 32 + ~250 | dibaca penuh |

---

## 1. Koreksi terhadap penjelasan sebelumnya (penting)

Ini bagian yang wajib diluruskan supaya arah kerja tidak salah asumsi:

| Klaim sebelumnya | Fakta di kode sekarang |
|---|---|
| "Kontrak membayar Trader League top 5 dengan **35/25/18/13/9**, sedangkan docs menyebut top 3 50/30/20" | **Tidak berlaku lagi.** `prizeShareBps` (`QualyraCompetitionVault.sol:925-931`) = **4000/3000/1500/1000/500 (top 5, 40/30/15/10/5)**, dan **README + `Concept-documents.md` sudah sepakat** dengan angka itu (README baris 109, Concept baris 166 & 178). Yang masih kosong: **`docs/FEE-AND-BATTLE-SPEC.md` tidak punya tabel hadiah Trader League** — perlu ditambahkan agar satu sumber. |
| "`finalizeBattle` juga men-sweep **bucket 0** lalu memindahkan pending ke pot" | **Bukan begitu.** `finalizeBattle` (`:566-567`) hanya men-sweep bucket **battleId** milik kedua token. Bucket 0 hanya di-sweep oleh `_openPot` saat **penjadwalan** (`:1018`) dan oleh `_collectParkedFees` saat creator menarik fee (`QualyraFeeVault.sol:240-247`). Fee yang terjadi **setelah window live berakhir** ditandai `feeBucketOf == 0` (`:853-856`), lalu dirutekan sebagai **Fase 3** (70% treasury + 30% league) — lihat Temuan 2. |
| "Aturan continuous-maintenance (DQ berlaku juga saat eligible & antre) sudah terpasang" | **Benar.** Cek `mc < MC_THRESHOLD_USD` di `_evaluate` (`:340-400`) tidak lagi dibungkus `if (!e.eligible)`. ✓ |
| "Frontend fallback $1 untuk simbol tak dikenal" | **Benar, masih ada**: `frontend/lib/pricing.ts:40` (`STOCK_FALLBACK_PRICES[sym] ?? 1`). Untuk aset pair baru, ini menampilkan harga palsu $1. |

---

## 2. Temuan (urut severity)

### Temuan 1 — [Medium] Pending pot bisa parkir tanpa jalur otomatis (sisa Temuan #1 lama)

**Bukti:** `isPendingExpired` (`:885-893`) langsung `return false` bila `firstCloseAt != 0`.
Sementara keeper operator hanya mem-poke token yang: sedang di battle, sedang di drop
(`belowSince != 0 && !hasBattled`), atau sedang *bookable*
(`indexer/src/operator/plan.ts:163-186`).

**Kondisi yang terlewat:** token yang **timer 24 jam-nya sudah mulai** (`firstCloseAt != 0`) lalu
pool-nya **sepi** dan tidak pernah mendapat laporan baru, sehingga:
`eligible == false`, `disqualified == false`, `belowSince == 0`, `hasBattled == false`
→ tidak masuk kriteria poke mana pun, dan `releaseExpiredPending` menolak (belum "expired").
Varian kedua: `belowSince != 0` (sedang drop) tanpa laporan lanjutan — ini **bisa** di-poke, tapi
hanya kalau seseorang benar-benar memanggilnya.

**Dampak:** bagian battle (70% dari 15% competition) token itu parkir tanpa jalur otomatis. Dana
tidak hilang (siapa pun bisa memanggil `pokeEligibility` yang permissionless, `:333`), tapi tanpa
intervensi manual, tidak ada yang menyelesaikannya — dan token jenis ini tidak akan pernah
kebagian battle.

**Perbaikan yang disarankan (pilih satu):**
1. Tambahkan ke `tokensToPoke`: token dengan `firstCloseAt != 0 && !eligible && !disqualified &&
   !hasBattled` dan sepi ≥ X jam (paling murah, tanpa ubah kontrak).
2. Atau perluas `isPendingExpired`: bila timer sudah mulai tapi token tidak eligible & tidak DQ
   setelah, misal, 30 hari → boleh dilepas ke treasury.

---

### Temuan 2 — [Medium] Fee antara "battle selesai" dan "finalize" tidak masuk pot

**Bukti:** `feeBucketOf` (`:853-856`) mengembalikan battleId hanya selama
`block.timestamp < startTime + BATTLE_DURATION`. Setelah 24 jam live berakhir dan sebelum
`finalizeBattle` dipanggil, swap baru menandai fee ke bucket **0** → `_routeCompetition`
(`QualyraFeeVault.sol:182-236`) melihat `hasBattled == true` → **Fase 3**: 70% treasury +
30% Trader League.

**Dampak:** pot pemenang kehilangan fee selama masa sanggah (24 jam) + jeda finalize. Untuk
platform yang potnya adalah daya tarik utama, ini bisa berarti sampai ~1/3 dari total fee battle
tidak pernah masuk ke buyback pemenang. Bukan celah pencurian, tapi bertentangan dengan kalimat
spec "pot masih terbuka → 100% ke pot" (§3.2/§3.4).

**Perbaikan yang disarankan:** putuskan mana yang benar:
- **(a) Sesuai spec:** ubah `feeBucketOf` agar tetap mengembalikan battleId sampai battle
  **finalized** (`!battle.finalized`), sehingga fee selama masa sanggah masuk pot. Perlu diingat
  `_openPot`/`finalizeBattle` sudah men-sweep bucket yang tepat sehingga tidak ada dana nyangkut.
- **(b) Sesuai kode:** perbarui spec §3.2/§3.4 + README agar menyebut "fee setelah 24 jam live
  (termasuk masa sanggah) = Fase 3", dan sebutkan alasannya.

---

### Temuan 3 — [Medium] Kelangsungan hidup operator = titik tunggal kegagalan dana kompetisi

**Bukti:** hanya `operator` yang bisa `proposeBattleResult` (`:499`) dan `proposeWeeklyWinners`
(`:650`). Guardian hanya bisa **veto** (`:537`, `:683`) dan `cancelBattle` **sebelum** battle mulai
(`:598-601`, tolak bila `block.timestamp >= battle.startTime`).

**Dampak:**
- Operator mati/kunci hilang → pot battle dan pool mingguan **beku** (bisa menumpuk bertahun-tahun).
  Satu-satunya jalan keluar adalah jalur darurat admin: `pause()` + `migrate()` + `sweepToSuccessor`
  (`:813-828`) — berat, dan successor harus menghormati ledger lama secara manual.
- Battle yang sudah **mulai** tidak bisa dibatalkan guardian lagi; kalau operator mengirim hasil
  palsu, satu-satunya pengaman adalah veto dalam 24 jam.

**Perbaikan yang disarankan:** tambahkan jalur fallback liveness, mis. setelah `N` hari tanpa
proposal, **siapa pun** boleh menutup battle sebagai `Void` (kontribusi masing-masing kembali ke
tokennya) dan minggu tanpa proposal bisa di-rollover tanpa `finalizedAt`. Ini menjaga "optimistic
model" tetap ada pengaman tanpa memberi guardian hak memindahkan dana.

---

### Temuan 4 — [Low] `rolloverUnclaimed` bisa menyimpan dana ke minggu yang klaimnya sudah tutup

**Bukti:** `rolloverUnclaimed` (`:758-782`) memakai `toWeek = currentWeek()`. Fungsi ini baru bisa
dipanggil `finalizedAt + CLAIM_WINDOW (60 hari)`. Pada titik itu, minggu tujuan sudah ~8 minggu
lebih maju — dan bisa saja minggu itu **sudah difinalisasi dan semua hadiahnya sudah diklaim**.

**Dampak:** dana masuk ke `weekPool[toWeek]` yang tidak bisa diklaim lagi: `claim` menolak
(rank sudah `prizeClaimed`, atau `closed`), dan `rolloverUnclaimed(toWeek)` berikutnya menghitung
`unclaimed = 0` sehingga tidak memindahkannya. Dana tersangkut (bukan dicuri); hanya jalur
migrasi darurat yang bisa memindahkannya.

**Perbaikan yang disarankan:** gulirkan ke `currentWeek() + 1`, atau ke bucket `carry[asset]`
khusus yang selalu bisa diklaim/digulirkan, atau tolak `toWeek` yang sudah `finalizedAt != 0`.

---

### Temuan 5 — [Low] Kedua sisi "pending expiry" memakai syarat yang tidak identik

**Bukti:** `FeeVault._routeCompetition` (`:214`) memakai
`firstCloseAt == 0 && block.timestamp >= launchedAt + PENDING_EXPIRY`, sedangkan
`isPendingExpired` (`:885-893`) menambahkan pengecualian **grace**: token yang baru graduate
(menunggu TWAP siap, 30–60 menit) dianggap belum expired.

**Dampak:** pada jendela sempit (token yang graduate kurang dari ~1 jam sebelum ulang tahun ke-30
hari), satu kali routing bisa mengirim bagian battle ke treasury lebih cepat dari yang dimaksud,
dan pending yang tersisa baru dilepas saat TWAP sudah siap (dipicu best-effort oleh fee berikutnya).
Tidak ada dana hilang, tapi dua tempat yang seharusnya mencerminkan aturan yang sama bisa berbeda.

**Perbaikan:** ekstrak predikat yang sama (mis. `competition.pendingExpired(token)`) supaya hanya
ada satu definisi.

---

### Temuan 6 — [Low] `pendingBattlePot` milik token yang sudah bertanding tidak punya pintu keluar

**Bukti:** setelah battle selesai, `_evaluate` langsung `return` karena
`booked && now >= startTime + BATTLE_DURATION` (`:352-354`), jadi token itu **tidak bisa DQ lagi**
→ `_drainPendingToTreasury` (`:1073`) tidak akan pernah terpanggil. `isPendingExpired` juga `false` karena
`firstCloseAt != 0`.

**Dampak:** bila ada yang masuk ke `pendingBattlePot[token]` setelah battle (mis. dari
`depositBattleFees` yang tidak menemukan pot terbuka), dana itu parkir permanen. Pada jalur normal
ini tidak terjadi (fee token yang sudah battle dirutekan Fase 3), jadi ini murni masalah
robustness/invariant — tapi invariant-nya sebaiknya ditegakkan: saat `finalizeBattle`, sisa
`pendingBattlePot` token itu dirutekan ke treasury, atau `releaseExpiredPending` diizinkan untuk
token `hasBattled`.

---

### Temuan 7 — [Low] TWAP tidak punya batas umur harga terakhir

**Bukti:** `twapOf` (`QualyraHook.sol:164-171`) mengembalikan `ready = true` berdasarkan
`readyWindow` saja (`_average`, `:401-406`); `updatedAt` (waktu swap terakhir) hanya dilaporkan,
tidak pernah dipakai sebagai syarat. TWAP memang "menahan harga terakhir", sesuai desain.

**Dampak:** pool yang tidak trading selama berminggu-minggu tetap melaporkan harga terakhirnya
sebagai rata-rata yang sah. Karena sisi USD (Chainlink) selalu segar, MC bisa naik/turun hanya
karena **aset pair** bergerak → sebuah `pokeEligibility` bisa menjadikan token eligible **atau
men-DQ-kannya** berdasarkan harga token yang sudah basi. Ini keputusan desain yang tercatat di
`TWAP-HARDENING-DESIGN.md §6` ("Dormant token … desired resistance"), tapi untuk keputusan yang
memindahkan uang, sebaiknya ada batas eksplisit (mis. `lastTime` lebih tua dari X jam → anggap
NOT-EVALUABLE, atau butuh swap/poke baru).

---

### Temuan 8 — [Info] Gate $100k mustahil dicapai di bonding curve (bukan bug, tapi perlu masuk spec)

Hitungan dari parameter yang dikirim: pada graduation, virtual quote = `phantom + threshold` =
1,68 + 4,2 = 5,88 ETH dan `reservedTokens = ceil(k / 5,88)`; MC saat itu ≈ **20,58 ETH**.
Dengan ETH $2.660 → **≈ $54,7k**. Untuk pasangan lain bahkan lebih rendah: USDG (8.090) → ≈ $8k,
NVDA (41,6 saham) → ≈ $9,3k. Jadi **tidak ada token yang bisa menyentuh $100k selama di curve**.

Konsekuensinya: (a) `EligibilityTimerStarted` hanya bisa terjadi **setelah graduation** (dan
setelah TWAP siap 30–60 menit); (b) DQ tidak pernah relevan di fase curve. Ini **konsisten** dengan
desain TWAP yang pool-only (`TWAP-HARDENING-DESIGN.md §0`, opsi A), tetapi
`docs/FEE-AND-BATTLE-SPEC.md §2.2` masih berbunyi "berlaku sama di kedua fase" → **perbarui spec**.

---

## 3. Yang saya periksa dan hasilnya benar (bukan temuan)

Supaya jelas apa yang sudah diverifikasi, bukan hanya yang bermasalah:

- **Pembagian fee**: `collectFees` memakai share yang dikunci saat launch (`creatorShareBps`,
  `competitionShareBps`, sisanya platform) + creator tax 100% ke creator
  (`QualyraFeeVault.sol:70-110`) — sesuai spec 70/15/15 + tax.
- **Pola "kirim dulu, baru lapor"**: `_receive` memverifikasi saldo nyata bertambah
  (`QualyraFeeVault.sol:254-259`, `QualyraCompetitionVault.sol:943-958`) → tidak bisa
  memalsukan jumlah fee.
- **Reentrancy lintas vault**: `creditTreasury` sengaja **tanpa** `nonReentrant` karena dipanggil
  dari `onTradeClose` di jalur trading, dan `collectFees` sudah `nonReentrant`
  (`QualyraFeeVault.sol:107-113`) — urutannya benar.
- **`_openPot` (`:1018-1034`)**: men-sweep bucket 0 lebih dulu, lalu membaca
  `pendingBattlePot` — jadi seed mencakup seluruh fee sebelum penjadwalan; `hasBattled` baru
  di-set setelah itu sehingga routing sweep-nya belum melihat token sebagai "sudah battle". Ini
  urutan yang benar dan mudah salah.
- **Hook — matematika fee di keempat bentuk swap** (exact-in/out × beli/jual) konsisten:
  `_feesFromGross` untuk sisi yang di-specify, `_feesOnTop` untuk yang tidak, plus penolakan
  `PartialSwap` di `afterSwap` (`QualyraHook.sol:232-292` (`beforeSwap`/`afterSwap`), `:434-459` (`_feesFromGross`/`_feesOnTop`), `:480-490` (`_accrue`)). Buyback dikecualikan dari
  fee & laporan eligibility, tapi tetap meng-update TWAP.
- **TWAP** (`_observe`/`_sumsAt`/`_average`, `:365-406`): jendela 30 menit sejajar UTC, rata-rata
  mencakup 30–60 menit, `readyWindow = window + 2` (rata-rata pertama benar-benar berisi satu
  jendela penuh), pool sepi diisi harga terakhir, denominator = `TWAP_WINDOW + t % TWAP_WINDOW`
  → hasilnya tepat `price`. Sudah saya uji secara aljabar, bukan hanya dibaca.
- **Hysteresis DQ**: `belowSince` + `recoveredAt` dengan `DQ_DWELL` dua arah, `disqualifiedAt =
  belowSince` (tanggal jatuh, bukan tanggal konfirmasi), `_droppedOut` memperhitungkan drop yang
  sudah berjalan cukup lama tapi belum dikonfirmasi trade (`:365-400`, `:992-999`). Sesuai spec §6.
  Rute dana DQ juga benar: `isBattlePotOpen` (`:845`) memastikan klasifikasi "committed vs belum",
  `_requireBattleReady` (`:1008`) menolak token yang `belowSince != 0`, dan
  `_returnBattle` (`:967`) mengembalikan kontribusi + melepas `hasBattled` saat battle dibatalkan.
- **Graduasi**: `phase` di-set sebelum call eksternal, `graduateOnCompletion` lewat
  self-call + `try/catch` dengan buffer gas 900k dan **revert** saat gas kurang (`QualyraBondingCurve.sol:188-212`)
  — desain cerdas: memaksa `eth_estimateGas` menyediakan gas pool penuh; sisa token dibakar, debu
  quote dibukukan sebagai fee (`QualyraGraduationExecutor.sol:222-236`).
- **Liquidity lock**: tidak ada fungsi untuk menarik/memindahkan posisi
  (`QualyraLiquidityLocker.sol`) — benar-benar terkunci. Saya juga cek mekanisme `unlock` v4:
  callback hanya masuk ke pemanggil `poolManager.unlock`, jadi locker tidak bisa dipancing pihak
  lain untuk memodifikasi likuiditas.
- **Buyback**: 4 tranche, jeda 30 menit per token, limit dampak 5% lewat `sqrtPriceLimitX96`
  (`QualyraBuybackBurner.sol:111-136`, `:205-218`); trade-off MEV-nya sudah didokumentasikan jujur
  di komentar kontrak.
- **Refund**: pro-rata dari sisa reserve, token tak terjual dibakar, `burnFrom` butuh approval
  pemegang (`QualyraBondingCurve.sol:258-287`) — perlu dicatat di UI bahwa holder harus `approve`
  dulu sebelum klaim refund.
- **Peran & batas wewenang**: admin = `factory.owner()` (timelock), operator hanya menjadwalkan &
  mengajukan hasil, guardian hanya veto/cancel/pause — persis matriks wewenang yang direncanakan;
  `renounceOwnership` diblokir (`QualyraFactory.sol:280-282`).
- **`prizeShareBps` menjumlah tepat 10.000** (4000+3000+1500+1000+500) sehingga pool minggu
  terbagi habis bila kelima peringkat terisi.

---

## 4. Yang belum bisa saya verifikasi dari sini

1. **`forge test`** — forge & `node_modules` tidak terpasang di sandbox ini, jadi semua di atas
   adalah hasil pembacaan, bukan hasil uji. Perubahan apa pun nanti harus Anda jalankan sendiri
   (build `via_ir` ±7 menit).
2. **RPC Robinhood diblokir** dari sandbox: PoolManager kanonik 4663, pool key PONS, dan venue
   Long.xyz belum bisa dikonfirmasi on-chain.
3. **Ukuran bytecode** `QualyraCompetitionVault` (klaim "sisa 3,8 KB" dari `via_ir`) tidak saya
   ukur ulang.

## 5. Usulan urutan kerja

1. **Putuskan Temuan 2** (fee masa sanggah → pot atau Fase 3). Ini yang paling berdampak ke uang
   dan paling murah diperbaiki (`feeBucketOf` satu baris, atau update spec).
2. **Temuan 1 & 6**: tambahkan jalur otomatis untuk pending yang parkir (keeper + invariant
   `hasBattled`) supaya tidak ada dana yang menunggu manusia.
3. **Temuan 3**: jalur fallback liveness operator — ini yang melindungi platform dari kunci
   operator hilang.
4. **Temuan 4, 5, 7**: perbaikan kecil, bisa digabung dalam satu PR.
5. **Temuan 8 + tabel hadiah league di spec**: update dokumen (`FEE-AND-BATTLE-SPEC.md`) agar
   satu sumber kebenaran dengan kode.
6. Baru setelah itu kembali ke rencana **custom pair** (`CUSTOM-PAIR-DESIGN.md §10`), karena
   gate permissionless akan menambah aset baru ke mesin yang sekarang masih punya 3 jalur
   "dana menunggu manusia" di atas.

# QUALYRA — Spesifikasi Fee, Eligibility & Battle (Desain Baru)

> **Status:** Disepakati **dan sudah diimplementasikan di kode.** Batch liveness (Q-1/Q-2: `expireBattle`,
> `skipWeek`, pending expiry) dan koreksi dokumen (Q-4/Q-12/Q-13: routing Fase 3, tabel hadiah league, pool-only
> + harga basi) sudah masuk. Bagian yang menyentuh kode diberi tanda di §5.1/§5.2.
> **Tujuan dokumen:** Acuan tunggal untuk pengerjaan perubahan kontrak agar tidak ada salah tafsir.
> Dokumen ini mendefinisikan aturan **market cap eligibility**, **diskualifikasi**, dan **alur pembagian fee** untuk sistem Token Battle.

---

## 1. Ringkasan Perubahan (vs kode saat ini / "Opsi 2")

| Area | Kode saat ini (Opsi 2) | Desain baru (dokumen ini) |
|---|---|---|
| Launch fee | 100% treasury | 100% treasury *(tetap)* |
| Trade fee 1% | 70% creator / 15% platform / 15% competition | *(tetap)* |
| 15% competition — **belum pernah battle** | 70% pendingBattlePot / 30% league | 70% pendingBattlePot / 30% league *(tetap)* |
| 15% competition — **saat LIVE battle** | 70% pot / 30% league | **100% ke pot** *(berubah)* |
| 15% competition — **setelah battle selesai** | 70% pending / 30% league | **70% treasury / 30% league** *(berubah)* |
| 15% competition — **gugur (di luar battle)** | — | **100% (70%+pending) → treasury** *(baru)* |
| Eligibility MC 100k on-chain | tidak ada | **cek tiap trade, window 24 jam** *(baru)* |
| Jumlah battle per token | tidak dibatasi eksplisit | **maksimal 1× seumur hidup** *(baru)* |
| Durasi battle diatur (mingguan/48j) | — | **TIDAK diterapkan** (dibatalkan) |
| Battle/minggu tanpa hasil (operator mati) | dana bisa beku | **fallback permissionless:** `expireBattle` 72 jam (Void) / `skipWeek` 14 hari *(baru)* |
| Pending tak terpakai | bisa menunggu manusia | **otomatis ke treasury** (30/120 hari, `releaseExpiredPending`) *(baru)* |
| Harga pool basi | dipakai sebagai harga sah | **NOT-EVALUABLE** setelah 7 hari tanpa swap *(baru)* |

---

## 2. Eligibility & Diskualifikasi (Market Cap 100k)

### 2.1 Aturan dasar
- **Umur token TIDAK dibatasi.** Satu-satunya syarat masuk battle adalah **market cap (MC) dalam USD**.
- **Threshold = MC ≥ $100.000 USD.** (Satuan **USD**, bukan pair asset — supaya adil & konsisten antar token ETH/USDG/stock.)
- Token menjadi kandidat saat **pertama kali MC-nya CLOSE di ≥ $100k USD** (lihat §2.3).
- Pada saat pertama close ≥$100k, **timer 1×24 jam dimulai**.
- Selama window 24 jam itu, MC dicek **setiap trade (on-chain)**:
  - Jika MC **jatuh di bawah $100k** → token **gugur / didiskualifikasi** (permanen — tidak bisa eligible lagi selamanya, kecuali battle yang sedang berjalan tetap lanjut).
  - Jika **bertahan ≥$100k** melewati 24 jam → token **eligible** untuk battle.
- **Setiap token maksimal battle 1× seumur hidup.** Setelah pernah battle, tidak bisa ikut battle lagi.
- **Aturan $100k berlaku sebagai pemeliharaan terus-menerus, bukan hanya 24 jam pertama.** Sejak timer mulai,
  setiap CLOSE di bawah $100k (kapan pun: sebelum eligible, saat menunggu booking, saat sudah dijadwalkan, atau
  saat battle LIVE) mendiskualifikasi token secara permanen. Aturannya berakhir hanya ketika window 24 jam
  battle-nya selesai — jadi token harus memegang $100k terus sampai battle itu final (CLOSE terakhir sebelum
  window habis adalah yang menentukan).

### 2.2 Mekanisme pengecekan — ON-CHAIN (Arah B, via Chainlink)
> **KEPUTUSAN FINAL:** Eligibility dihitung **murni on-chain, pada setiap trade** (trustless & auditable).
> Ini **mengubah** desain lama di `Concept-documents.md` ("tanpa oracle di kontrak; penyetaraan USD oleh indexer").

- **MC = harga USD × (total supply − burned supply)**, dihitung on-chain di dalam kontrak.
- **Sumber harga USD = Chainlink native di Robinhood Chain** (terkonfirmasi tersedia):
  - Pakai interface standar `AggregatorV3Interface.latestRoundData()`.
  - Feed USD umumnya **8 desimal** — verifikasi via `.decimals()`.
  - **ETH/USD** feed untuk pasangan ETH; **USDG** ≈ $1; **stock token (NVDA/AAPL/SPY)** pakai feed masing-masing.
  - Stock feed sudah **multiplier-adjusted** (`latestRoundData()` sudah termasuk `uiMultiplier`) → **jangan** dikali manual.
  - **Wajib staleness check** (`updatedAt` vs heartbeat) + tangani `oraclePaused()` (stock 24/5, saat market tutup / corporate action bisa pause).
- **Hanya berlaku di pool (setelah graduation), bukan di bonding curve.** Trade yang memicu pengecekan adalah
  trade di pool Uniswap v4 (hook), dan `onTradeClose` hanya menerima laporan dari hook. Ini juga batas alami:
  MC maksimum di bonding curve ≈ 20,58 ETH (≈ $54,7k pada ETH $2.660; USDG ≈ $8k; NVDA ≈ $9,3k), jadi timer
  $100k memang tidak mungkin mulai sebelum token graduasi.
- **Harga yang dipakai adalah rata-rata 30 menit (TWAP) pool, bukan harga sesaat.** Wajib `ready`: pool baru
  melaporkan setelah punya satu window penuh (30–60 menit setelah graduasi), dan **sebuah pool yang tidak
  trading selama 7 hari (`MAX_PRICE_AGE`) melaporkan NOT-READY** — "basi = tidak dievaluasi" untuk kedua arah
  (tidak bisa memulai timer, tidak bisa men-DQ). Alasannya: harga terakhir yang umurnya tidak diketahui tidak
  boleh memindahkan uang, sementara sisi USD (Chainlink) selalu segar sehingga pergerakan aset pair saja bisa
  menaikkan/menurunkan MC. Token yang pool-nya basi diselesaikan lewat jalur pending (§5.1 poin 9), bukan lewat DQ.

> **⚠️ TESTNET vs MAINNET:** Alamat feed Chainlink **berbeda** antar jaringan.
> - Testnet (chain **46630**) — set alamat feed testnet.
> - Mainnet (chain **4663**) — **wajib disesuaikan** dengan alamat feed mainnet sebelum deploy.
> Alamat feed harus **dapat dikonfigurasi** (bukan hardcode) + di-set lewat admin/timelock.

#### 2.2.1 Alamat feed Chainlink — status & cara memperolehnya
> **PENTING:** Alamat proxy feed spesifik **TIDAK dipublikasikan sebagai daftar tetap** dan **TIDAK BOLEH di-hardcode**.
> Chainlink & Robinhood menyarankan ambil dari **registry resmi** (Robinhood price feeds registry / Chainlink Data Feeds portal) sebagai *source of truth*, karena tiap ticker RWA (NVDA/AAPL/SPY) punya **proxy contract sendiri per-deployment**.

| Feed | Testnet (46630) | Mainnet (4663) | Catatan |
|---|---|---|---|
| ETH / USD | *(ambil dari registry)* | *(ambil dari registry)* | untuk pasangan ETH |
| USDG | — | — | diperlakukan ≈ $1 (atau feed jika tersedia) |
| NVDA | *(ambil dari registry)* | *(ambil dari registry)* | RWA, multiplier-adjusted |
| AAPL | *(ambil dari registry)* | *(ambil dari registry)* | RWA, multiplier-adjusted |
| SPY | *(ambil dari registry)* | *(ambil dari registry)* | RWA, multiplier-adjusted |
| **Sequencer Uptime Feed** | *(ambil dari registry)* | `0xcE73c8ad…` *(Data Streams Verifier Proxy — verifikasi kegunaannya)* | **wajib** (lihat 2.2.2) |

> **TODO implementasi:** isi tabel di atas dengan alamat aktual dari registry Robinhood, **per-jaringan**, saat konfigurasi deploy. Simpan di config deploy (mis. `deployments/<chainId>.json` atau parameter `DeployQualyra.s.sol`), bukan di dalam kode kontrak.

#### 2.2.2 Robinhood Chain = L2 (Arbitrum Orbit) → wajib Sequencer Uptime check
- Robinhood Chain adalah **Arbitrum Orbit L2 rollup**. Sebelum membaca harga Chainlink, kontrak **harus** memeriksa **Chainlink Sequencer Uptime Feed**.
- Jika sequencer sedang down / baru pulih (dalam grace period) → **jangan** pakai harga (anggap MC tidak dapat dievaluasi pada trade itu, jangan trigger/disqualify berdasarkan harga basi).
- Ini melindungi dari diskualifikasi/eligibility yang salah akibat harga basi saat L2 bermasalah.

### 2.3 Definisi "menyentuh 100k" = harus CLOSE ≥ $100k USD
- Yang dihitung adalah **MC (USD) pada state akhir setelah sebuah trade selesai (close/settle)**, **bukan** harga puncak sesaat di tengah eksekusi.
- Spike sesaat ke ≥$100k lalu turun lagi dalam trade yang sama **TIDAK** memicu timer.
- Timer diskualifikasi 24 jam baru mulai saat **MC close pertama kali ≥ $100k USD**.

---

## 3. Alur Pembagian Fee (15% Competition)

Trade fee 1% selalu terbagi: **70% creator / 15% platform (treasury) / 15% competition.**
Dokumen ini fokus pada **15% competition**, yang routing-nya bergantung pada status token.

> **PENTING — titik mulai perhitungan (Pilihan 1 yang disepakati):**
> Pembagian `70% pendingBattlePot / 30% league` berlaku **sejak trade PERTAMA setelah launch**,
> bukan sejak token menyentuh MC 100k. Artinya `pendingBattlePot` sudah menabung dari awal.
>
> **Menyentuh MC 100k TIDAK mengubah pembagian fee.** MC 100k hanya berfungsi sebagai
> **penanda eligibility** (boleh masuk battle) + memicu **timer diskualifikasi 24 jam**.
> Dengan demikian tidak ada rentang waktu (sejak launch) yang aturannya "tidak terdefinisi".

### 3.0 → 3.1 FASE 1 — Sejak LAUNCH sampai sebelum battle (belum pernah battle)
Berlaku untuk MC berapa pun (di bawah 100k, saat mengejar 100k, maupun setelah eligible tapi belum dijadwalkan battle).
```
15% competition
├─ 70% → pendingBattlePot[token]   (ditahan / diakumulasi, sejak trade pertama)
└─ 30% → Trader League
```

### 3.2 FASE 2 — Saat battle LIVE
```
15% competition
└─ 100% → POT BATTLE            (70% + 30% seluruhnya ke pot)
```
**PLUS:** seluruh saldo `pendingBattlePot[token]` yang terkumpul di Fase 1 **di-seed masuk ke pot saat battle
dibooking** (operator memanggil `scheduleBattles`; di detik itu juga fee yang menunggu di bucket 0 ikut disapu
masuk pot).

> **Pot battle = pendingBattlePot (seed) + 100% competition fee sejak booking sampai window LIVE berakhir.**
> Hook menandai fee dengan battle-nya selama `[startTime, startTime + BATTLE_DURATION)`; fee yang masuk setelah
> itu — yaitu sepanjang **masa sanggah 24 jam** dan jeda sebelum `finalizeBattle` — sudah Fase 3.

### 3.3 FASE 3 — Setelah window LIVE berakhir, bukan setelah finalize (token pensiun dari battle)
```
15% competition
├─ 70% → TREASURY               (BUKAN lagi ke pendingBattlePot)
└─ 30% → Trader League
```
> **Penting:** "battle selesai" untuk routing fee = **24 jam window LIVE berakhir** (`startTime + BATTLE_DURATION`),
> **bukan** saat `finalizeBattle`. Ini disengaja: masa sanggah dan proses finalize tidak perlu menahan aliran fee,
> dan hasilnya tidak bergantung pada kapan operator menekan finalize. Pot yang sudah terkumpul tidak berubah lagi
> setelah window berakhir.

### 3.4 Tabel ringkas
| Status token | 70% competition | 30% competition |
|---|---|---|
| **Sejak launch** → belum pernah battle (MC berapa pun) | **→ pendingBattlePot** | → Trader League |
| Dibooking s/d window LIVE berakhir | **100% (70%+30%) → POT** + seed pending | (ikut ke pot) |
| Setelah window LIVE berakhir (masa sanggah, finalize, seterusnya) | **→ TREASURY** | → Trader League |

> **Catatan:** Menyentuh MC 100k **tidak** mengubah baris pertama — pembagiannya sama sejak launch.
> 100k hanya penanda eligibility + pemicu timer diskualifikasi (lihat §2).

> **Penanda logika kunci:** karena battle hanya 1× seumur hidup, sistem membedakan Fase 1 vs Fase 3 lewat flag **`hasBattled[token]`**.
> - `hasBattled == false` → 70% ke pendingBattlePot.
> - `hasBattled == true` → 70% ke treasury.
>
> **Trader League selalu menerima 30%**, KECUALI saat token sedang LIVE battle (saat itu 30% ikut masuk pot).

---

## 4. Diskualifikasi / Gugur — DUA JENIS (tujuan dana BERBEDA)

> ⚠️ Ini bagian paling sensitif. Tujuan dana bercabang berdasarkan **apakah token sedang LIVE battle saat gugur**.

### 4.1 Jenis 1 — Gugur SEBELUM bertanding (belum pernah LIVE battle)
Token masih di Fase 1 (mengejar/menjaga 100k), MC jatuh <100k → gugur.
```
Semua fee + SELURUH pendingBattlePot[token]  →  TREASURY
```
- Karena belum pernah ada battle/pot, dana diserap **treasury**.
- Ini sekaligus **menyelesaikan masalah dana pending macet selamanya** (token yang tak pernah lolos → dananya tidak nyangkut, langsung ke treasury).

### 4.2 Jenis 2 — Gugur SAAT battle LIVE (di tengah pertandingan)
Token sedang LIVE battle (mis. A vs B), MC token A jatuh <100k → **A dinyatakan KALAH/gugur**.
```
Dana  →  BUKAN ke treasury
      →  POT BATTLE menjadi milik PEMENANG (lawannya, B)
```
- Gugur di tengah battle = **kalah**.
- **Battle TIDAK selesai dini — tetap JALAN PENUH sampai 24 jam.** A hanya **ditandai `disqualified/lost`** seketika; pemenang baru ditetapkan saat `finalize` di akhir window (konsisten dengan alur finalize + guardian veto yang sudah ada).
- **Fee token yang sudah gugur (A) TETAP 100% masuk pot** sampai finalize (A masih peserta battle itu). Fee token B juga tetap 100% ke pot.
- Saat finalize → **B menang otomatis** → seluruh pot (termasuk kontribusi & seed dari A) → **buyback & burn token B**.
- **TIDAK lari ke treasury.**
- **Kasus "keduanya gugur":** yang **gugur DULUAN = KALAH**; token yang **bertahan lebih lama (gugur belakangan) = MENANG**. Jadi **selalu ada pemenang** → seluruh pot → **buyback & burn token pemenang**. Ini menghindari hasil "hambar" (tidak menarik) dan menjaga selalu ada pemenang. VOID murni **hanya** jika keduanya gugur di **blok/trade yang sama persis** (praktis mustahil) → maka pot **dikembalikan sesuai kontribusi masing-masing token** → buyback & burn token itu sendiri (sama seperti aturan draw/void).

### 4.3 Tabel ringkas gugur
| Situasi gugur | Kondisi | Dana lari ke |
|---|---|---|
| Gugur sebelum battle | belum pernah LIVE battle | **TREASURY** (fee + pendingBattlePot) |
| Gugur saat battle LIVE | sedang bertanding | **POT → PEMENANG (lawan)**, bukan treasury |

---

## 5. Pot & Finalize (TERKUNCI)

- **Isi pot** = seed dari `pendingBattlePot` + 100% competition fee selama window LIVE.
- **Durasi battle = 24 jam** (`BATTLE_DURATION`), selalu jalan penuh — tidak ada finalize dini.
- **Saat finalize** → seluruh pot dibagikan ke pemenang → **100% buyback & burn token pemenang** (FINAL, tidak ada skema lain).

### 5.1 Aturan finalize (sudah diputuskan)
1. **Lawan gugur di tengah battle → JALAN PENUH sampai 24 jam.** Token yang gugur hanya **ditandai kalah** seketika; pemenang ditetapkan saat `finalize` di akhir (selaras dengan guardian veto window). **Bukan** finalize dini.
2. **Fee token yang sudah gugur tetap 100% ke pot** hingga finalize (masih peserta battle itu).
3. **Pot pemenang → 100% buyback & burn** token pemenang.
4. **Draw** (skor akhir seri, **tidak ada pemenang**) → **BUKAN dibagi rata 50/50**. Tiap token menerima kembali **porsi yang IA SENDIRI sumbangkan** ke pot = `seed dari pendingBattlePot`-nya + `competition fee dari trade-nya selama battle` → dana itu dipakai **buyback & burn token itu sendiri**. Jadi kontribusi token A → buyback & burn **A**; kontribusi token B → buyback & burn **B** (**TIDAK** ke Trader League). *(Implementasi: butuh tracking `contributionOf[battleId][token]` di dalam pot.)*
5. **Void** (battle batal / tanpa hasil sah) → **sama seperti draw**: tiap token menerima kembali **kontribusinya sendiri** (`seed pending`-nya + `fee live`-nya) → buyback & burn token itu (**TIDAK** ke Trader League; **bukan** 50/50 rata).
6. **Keduanya gugur** dalam window → **yang gugur DULUAN kalah, token satunya (bertahan lebih lama) MENANG** → 100% pot → buyback & burn pemenang. **Selalu ada pemenang** (bukan void). Void murni hanya bila keduanya gugur di **blok/trade yang sama persis** (praktis mustahil).
7. **Fallback liveness battle (Q-1):** bila window LIVE sudah berakhir **72 jam** (`BATTLE_RESULT_GRACE`) dan tidak ada hasil yang sah diposting (operator mati, atau hasilnya di-veto dan tidak pernah diganti), **siapa pun** boleh memanggil `expireBattle` → battle ditutup sebagai **Void** (hasil ditolak selamanya setelah itu). Void berarti tiap token menerima kembali kontribusinya sendiri (poin 5), jadi pot tidak pernah beku karena satu pihak tidak bertindak.
8. **Fallback liveness league (Q-1):** bila sebuah minggu league sudah berakhir **14 hari** (`LEAGUE_SKIP_GRACE`) dan tidak ada pemenang yang diposting, **siapa pun** boleh memanggil `skipWeek` → seluruh pool minggu itu berpindah ke minggu yang sedang berjalan (`currentWeek()`). Tidak ada pemenang yang bisa diklaim dari minggu yang di-skip, jadi dana tidak bisa diambil dua kali. Minggu yang sudah punya proposal tidak boleh di-skip — jalur normalnya (masa sanggah → `finalizeWeek`) yang jalan.
9. **Pending yang tak terpakai (Q-2):** `pendingBattlePot` sebuah token berakhir di **treasury** lewat `releaseExpiredPending` (siapa pun boleh; fee vault juga menjalankannya otomatis pada fee berikutnya) bila:
   - **30 hari** (`PENDING_EXPIRY`) sejak launch dan timer belum pernah mulai (`firstCloseAt == 0`) — dan token tidak sedang dalam masa warm-up pool; atau
   - **30 + 90 hari** (`UNRESOLVED_PENDING_GRACE`) sejak launch dan timer sudah mulai tapi tidak pernah selesai (tidak eligible, tidak gugur, tidak battle).
   Jadi tidak ada kombinasi "pool sepi tanpa laporan" yang menahan dana tanpa ujung.

---

### 5.2 Trader League — hadiah mingguan (Q-12)

- **Pool minggu** = 30% bagian league dari setiap trade + sisa pool minggu sebelumnya. Saat `startLeague`,
  bootstrap pool yang terkumpul disebar ke 4 minggu pertama (30% bagian league sebelum league dimulai menumpuk di
  bootstrap pool itu). Deposit yang masuk saat sebuah minggu sedang berjalan langsung menambah pool minggu itu.
- **Hadiah peringkat (top 5) per asset**, dihitung dari pool minggu berjalan (`prizeShareBps`):

| Peringkat | Porsi pool |
|---|---|
| 1 | **40%** |
| 2 | **30%** |
| 3 | **15%** |
| 4 | **10%** |
| 5 | **5%** |

- **Peringkat kosong atau tidak diklaim:** porsi yang tidak punya pemenang ikut ke pool minggu berikutnya saat
  `finalizeWeek`; pool minggu tanpa pemenang sama sekali berpindah seluruhnya.
- **Klaim dibuka 60 hari** (`CLAIM_WINDOW`) setelah finalisasi. Setelah itu `rolloverUnclaimed` memindahkan hadiah
  yang belum diklaim ke pool minggu yang sedang berjalan — dan tidak pernah ke minggu yang klaimnya sudah dibuka
  (dana di sana tidak akan bisa diklaim lagi). Siapa pun boleh memicu klaim; hadiah tetap ke pemenang.
- **Minggu tanpa laporan:** lihat §5.1 poin 8 (`skipWeek`), jalur liveness-nya.

---

## 6. Aturan Fee Final (Ringkasan Utuh)

```
Launch fee 0.0005 ETH → 100% treasury

Trading fee 1%
├─ 70% → creator
├─ 15% → platform (treasury)
└─ 15% → competition
        ├─ sejak launch s/d belum battle   → 70% pendingBattlePot + 30% Trader League
        ├─ dibooking s/d LIVE berakhir     → 100% ke POT (+ seed pendingBattlePot)
        ├─ setelah LIVE berakhir (Fase 3)  → 70% treasury + 30% Trader League
        ├─ gugur sebelum battle            → 100% (fee + pending) → treasury
        └─ gugur saat LIVE battle          → tetap ke POT (battle jalan penuh 24 jam) → pemenang

Finalize:
- Battle selalu jalan penuh 24 jam (tidak ada finalize dini).
- Menang normal / menang karena lawan gugur → 100% pot → buyback & burn token pemenang.
- Draw / Void (tidak ada pemenang) → tiap token dapat KEMBALI kontribusinya sendiri (seed pending + fee live-nya) → buyback & burn token itu (BUKAN 50/50 rata; TIDAK ke Trader League).
- Keduanya gugur → yang gugur DULUAN kalah, token satunya menang (selalu ada pemenang; bukan void).

Liveness (Q-1 / Q-2) — tidak ada dana yang menunggu manusia:
- Battle tanpa hasil sah 72 jam setelah LIVE berakhir → siapa pun boleh `expireBattle` → Void (kontribusi masing-masing token kembali).
- Minggu league tanpa pemenang 14 hari setelah minggu berakhir → siapa pun boleh `skipWeek` → pool pindah ke minggu berjalan.
- pendingBattlePot yang tak terpakai → treasury (30 hari tanpa timer; 120 hari bila timer tidak pernah selesai; atau saat pool sudah basi).
- Eligibility pool basi (7 hari tanpa swap) = NOT-EVALUABLE untuk kedua arah (lihat §2.2).
```

---

## 7. Dampak ke Kode (peta kerja awal — akan diperinci setelah baca kode)

**Berubah:**
1. Routing saat LIVE battle: `70/30` → `100% pot`.
2. Routing setelah pernah battle: `pending` → `treasury` (butuh flag `hasBattled[token]`).

**Baru:**
3. Sistem eligibility MC $100k USD **on-chain** (cek tiap trade, timer 24 jam, status eligible/disqualified).
4. **Integrasi Chainlink** (`AggregatorV3Interface`) untuk harga USD ETH/stock + staleness/pause check; alamat feed **configurable** (testnet vs mainnet).
5. Batas battle 1× per token (`hasBattled[token]`).
6. Diskualifikasi bercabang: di luar battle → treasury; saat LIVE battle → kalah (pot ke pemenang).
7. Logika finalize menangani "menang karena lawan gugur".

**Tetap (sudah ada):** `pendingBattlePot` untuk Fase 1, `_seedFromPending`, split 30% league, launch fee 100% treasury.

**File yang kemungkinan terdampak:** `QualyraFeeVault.sol`, `QualyraCompetitionVault.sol`, `QualyraBondingCurve.sol`, `QualyraHook.sol`, `QualyraFactory.sol` (config feed), + test terkait.

---

## 8. Item yang MASIH TERBUKA (belum diputuskan)
- [x] ~~Satuan MC "100k"~~ → **USD** (diputuskan). Lihat §2.1.
- [x] ~~Cara hitung MC on-chain~~ → **Chainlink on-chain, harga × (supply − burned)** (diputuskan, Arah B). Lihat §2.2.
- [x] ~~Pembagian pot pemenang~~ → **100% buyback & burn token pemenang** (FINAL, tidak ada skema lain). Lihat §5.
- [x] ~~Syarat holder minimal 100~~ → **DIBUANG.** Satu-satunya syarat eligibility = **MC ≥ $100k USD**. (Menghindari kerumitan hitung holder on-chain.)
- [x] ~~Detail finalize saat lawan gugur~~ → **JALAN PENUH 24 jam** (bukan dini); fee token gugur tetap ke pot; keduanya gugur = void. Lihat §4.2 & §5.
- [x] ~~Aturan draw & void~~ → **draw & void = tiap token dapat KEMBALI kontribusinya sendiri** (seed pending + fee live-nya) → buyback & burn token itu (BUKAN 50/50 rata; TIDAK ke Trader League). Butuh tracking `contributionOf[battleId][token]`. Lihat §5.
- [x] ~~Kasus keduanya gugur~~ → **yang gugur DULUAN kalah, token satunya menang** (selalu ada pemenang, bukan void). Lihat §4.2 & §5.
- [x] ~~Battle tanpa hasil saat operator mati~~ → **Void permissionless setelah 72 jam** (`expireBattle`); tiap token menerima kembali kontribusinya. Lihat §5.1 poin 7.
- [x] ~~Minggu league tanpa pemenang~~ → **pool pindah ke minggu berjalan setelah 14 hari** (`skipWeek`), tanpa bisa diklaim dua kali. Lihat §5.1 poin 8.
- [x] ~~Pending yang tidak pernah terpakai~~ → **treasury**: 30 hari tanpa timer, **120 hari** bila timer tidak pernah selesai (Q-2), atau saat pool sudah basi. Lihat §5.1 poin 9.
- [x] ~~Harga pool basi dipakai untuk keputusan uang~~ → **NOT-EVALUABLE kedua arah** setelah 7 hari tanpa swap (`MAX_PRICE_AGE`), tidak bisa memulai timer maupun men-DQ. Lihat §2.2.
- [x] ~~Fee selama masa sanggah (setelah LIVE, sebelum finalize)~~ → **tetap Fase 3** (70% treasury / 30% league), disengaja; spec §3.3 yang diperjelas, bukan kode. Lihat §3.2/§3.3.

> ✅ **SEMUA ITEM SUDAH DIPUTUSKAN — DESAIN TERKUNCI.** Batch liveness (Q-1/Q-2) dan koreksi dokumen (Q-4/Q-12/Q-13) sudah masuk kode dan test.

---

## 9. Sinkronisasi Dokumen Lain (docs yang perlu dikoreksi ke alur baru)

Dokumen berikut masih memuat alur **LAMA** dan **berbenturan** dengan spec ini — perlu diperbarui:

| Dokumen | Yang berbenturan | Koreksi yang diperlukan |
|---|---|---|
| `Concept-documents.md` | "Tanpa oracle di kontrak; penyetaraan USD oleh indexer"; "syarat dicek indexer"; fee competition split lama | Eligibility kini **on-chain via Chainlink** (Arah B); MC USD dihitung kontrak; fee: 100% pot saat LIVE, 70% treasury/30% league setelah battle |
| `README.md` | Split fee lama; eligibility off-chain | Selaraskan angka fee & sumber eligibility |
| `indexer/README.md` | Indexer sebagai penentu eligibility | Indexer tetap untuk **Trader League scoring**, TAPI **bukan lagi** penentu eligibility battle (kini on-chain) |
| kode `Qualyra*.sol` | Belum ada MC gate / Chainlink / `hasBattled` | Implementasi sesuai §7 |

> **Catatan:** Perbaikan dokumen-dokumen di atas dilakukan **setelah** desain di dokumen ini dikunci penuh (§8 semua selesai), agar tidak bolak-balik.
```

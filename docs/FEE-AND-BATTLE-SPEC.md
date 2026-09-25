# QUALYRA — Spesifikasi Fee, Eligibility & Battle (Desain Baru)

> **Status:** Disepakati (belum diimplementasikan di kode).
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
- Berlaku **sama di kedua fase**: sebelum graduation (bonding curve) maupun setelah graduation (pool Uniswap v4 via hook).

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
**PLUS:** seluruh saldo `pendingBattlePot[token]` yang terkumpul di Fase 1 **di-seed masuk ke pot** saat battle dimulai.

> **Pot battle = pendingBattlePot (seed) + 100% competition fee selama window LIVE.**

### 3.3 FASE 3 — Setelah battle selesai (token pensiun dari battle)
```
15% competition
├─ 70% → TREASURY               (BUKAN lagi ke pendingBattlePot)
└─ 30% → Trader League
```

### 3.4 Tabel ringkas
| Status token | 70% competition | 30% competition |
|---|---|---|
| **Sejak launch** → belum pernah battle (MC berapa pun) | **→ pendingBattlePot** | → Trader League |
| Battle LIVE | **100% (70%+30%) → POT** + seed pending | (ikut ke pot) |
| Setelah battle selesai | **→ TREASURY** | → Trader League |

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

---

## 6. Aturan Fee Final (Ringkasan Utuh)

```
Launch fee 0.0005 ETH → 100% treasury

Trading fee 1%
├─ 70% → creator
├─ 15% → platform (treasury)
└─ 15% → competition
        ├─ sejak launch s/d belum battle   → 70% pendingBattlePot + 30% Trader League
        ├─ SEDANG LIVE battle (Fase 2)     → 100% ke POT (+ seed pendingBattlePot)
        ├─ setelah battle selesai (Fase 3) → 70% treasury + 30% Trader League
        ├─ gugur sebelum battle            → 100% (fee + pending) → treasury
        └─ gugur saat LIVE battle          → tetap ke POT (battle jalan penuh 24 jam) → pemenang

Finalize:
- Battle selalu jalan penuh 24 jam (tidak ada finalize dini).
- Menang normal / menang karena lawan gugur → 100% pot → buyback & burn token pemenang.
- Draw / Void (tidak ada pemenang) → tiap token dapat KEMBALI kontribusinya sendiri (seed pending + fee live-nya) → buyback & burn token itu (BUKAN 50/50 rata; TIDAK ke Trader League).
- Keduanya gugur → yang gugur DULUAN kalah, token satunya menang (selalu ada pemenang; bukan void).
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

> ✅ **SEMUA ITEM SUDAH DIPUTUSKAN — DESAIN TERKUNCI.** Siap lanjut ke rencana implementasi kode (§7).

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

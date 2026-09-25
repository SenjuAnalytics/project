# Qualyra — Konfigurasi Price Feed Mainnet (Robinhood Chain `4663`)

> Tujuan: mencatat **alamat price feed mainnet resmi** + **setelan heartbeat (staleness)** untuk deploy mainnet, supaya tidak menebak-nebak dan mesin battle tidak beku diam-diam.
> **Tidak mengubah kode Solidity.** Semua nilai di bawah adalah **env var** yang dibaca `script/DeployQualyra.s.sol` (`_wireFeeds`) saat deploy, lalu ditegakkan on-chain via `factory.setPriceFeed` / `setSequencerFeed`. Kalau perlu diganti setelah deploy → cukup **1 transaksi**, tanpa deploy ulang.
> Data mesin: [`deployments/4663.feeds.json`](../../deployments/4663.feeds.json).

---

## 1. Blok `.env` untuk deploy mainnet (copy–paste)

```dotenv
# --- Robinhood Chain mainnet (4663) — Chainlink price feed proxies ---
FEED_ETH_USD=0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9
FEED_USDG=0x61B7e5650328764B076A108EFF5fa7282a1B9aD2
FEED_NVDA=0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15
FEED_AAPL=0x6B22A786bAa607d76728168703a39Ea9C99f2cD0
FEED_SPY=0x319724394D3A0e3669269846abE664Cd621f9f6A

# --- Heartbeat / batas staleness (DETIK) ---
# Feed asli update MINIMAL tiap 86400s (24 jam) + langsung saat harga bergerak (deviation threshold).
# WAJIB >= 86400. Pakai 90000 untuk margin. Default skrip = 3600 (1 jam) => SALAH untuk mainnet.
FEED_HEARTBEAT=90000
FEED_ETH_USD_HEARTBEAT=90000
FEED_USDG_HEARTBEAT=90000
FEED_NVDA_HEARTBEAT=90000
FEED_AAPL_HEARTBEAT=90000
FEED_SPY_HEARTBEAT=90000

# --- Sequencer Uptime Feed (L2 Arbitrum-Orbit) ---
# DIKONFIRMASI 2026-09-24: TIDAK ada Sequencer Uptime Feed resmi untuk 4663 (tak ada di registry 58 feed).
# Biarkan address(0) => cek sequencer L2 dilewati (fail-safe; staleness/heartbeat tetap melindungi).
SEQUENCER_UPTIME_FEED=0x0000000000000000000000000000000000000000
SEQUENCER_GRACE_PERIOD=3600
```

> Catatan USDG: `FEED_USDG` di atas adalah **feed harga USDG/USD** (8 desimal). Ini beda dari **token USDG** (`USDG=0x...`) yang menurut verifikasi mainnet ber-**desimal 6** — set terpisah dan verifikasi `decimals()`-nya.

---

## 2. Tabel alamat & status verifikasi

| Aset | Feed proxy (utama, Shared SVR) | Desimal | Heartbeat asli | Set ke | Status |
|---|---|---|---|---|---|
| **ETH / USD** | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | 8 | 86400 | **90000** | ✅ Terverifikasi read-only (`ETH / USD`, harga ~$2.661) |
| **USDG / USD** | `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | 8 | 86400 | **90000** | ✅ Terverifikasi 2026-09-24 (`USDG / USD`, ~$1.00, segar ~1j34m) |
| **NVDA** | `0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15` | 8 | 86400 | **90000** | ✅ Terverifikasi 2026-09-24 (`RHNVDA / USD`, ~$224.41, segar ~29m) — us_equities_24/5 |
| **AAPL** | `0x6B22A786bAa607d76728168703a39Ea9C99f2cD0` | 8 | 86400 | **90000** | ✅ Terverifikasi 2026-09-24 (`Robinhood AAPL / USD`, ~$338.10, segar ~55m) — us_equities_24/5 |
| **SPY** | `0x319724394D3A0e3669269846abE664Cd621f9f6A` | 8 | 86400 | **90000** | ✅ Terverifikasi 2026-09-24 (`RHSPY / USD`, ~$766.70, `updatedAt` ~12j41m — segar di 24j, tapi BASI di default 3600) — us_equities_24/5 |

### Proxy alternatif **non-SVR** (secondary) — semua terverifikasi 2026-09-24

| Aset | Proxy non-SVR (secondary) | Harga | Sama dgn SVR? |
|---|---|---|---|
| ETH / USD | `0x5058aDee53b04e374d8bEDbAD634Bc4778F50b22` | ~$2.678,90 | ✅ data sama |
| USDG / USD | `0x901f56689360B89D7767a8acE28B7801e6348fa2` | ~$1,00 | ✅ identik |
| NVDA | `0xCF169363636D73dbBf77733629CB38919d14232d` | ~$224,41 | ✅ identik |
| AAPL | `0x4bDbb3150014c6Ab2C6D9347B0779c49015a2f3f` | ~$338,10 | ✅ identik |
| SPY | `0xa68CA83408bE3f78d1c58a82081c619e9d21486d` | ~$766,70 | ✅ identik |

**SVR (primary) vs non-SVR (secondary) — mana yang dipakai?**
- Keduanya `AggregatorV3`, `decimals=8`, dan pada pengecekan barusan **mengembalikan harga + `updatedAt` yang persis sama** → **data-equivalent**.
- **SVR** (Smart Value Recapture) berguna untuk protokol lending/likuidasi (merebut OEV). Qualyra **cuma membaca harga** untuk gerbang market-cap — **tidak ada likuidasi**, jadi SVR **tidak memberi manfaat** di sini.
- **Rekomendasi:** pakai **non-SVR (secondary)** sebagai default paling sederhana (tanpa dependensi SVR). Tapi primary (SVR) juga sah — hasilnya sama. **Pilih satu set, jangan dicampur.**
- Untuk memakai set non-SVR: cukup ganti nilai `FEED_ETH_USD` / `FEED_USDG` / `FEED_NVDA` / `FEED_AAPL` / `FEED_SPY` di blok `.env` dengan alamat pada tabel ini (heartbeat tetap 90000).

---

## 3. Kenapa heartbeat = 90000

Aturan staleness di [`src/libraries/QualyraOracle.sol`](../src/libraries/QualyraOracle.sol):

```solidity
if (heartbeat == 0 || block.timestamp - updatedAt > heartbeat) return (0, false); // NOT-EVALUABLE
```

- Feed asli update paling lama **86400s (24 jam)** → kalau `heartbeat` di-set **3600s (1 jam)**, ~23 jam dari tiap 24 jam harga dianggap **basi** → oracle balikan NOT-EVALUABLE → **timer $100k, DQ, finalize beku** padahal feed sehat.
- **Fail-safe:** trading, fee, launch, graduation, buyback **tetap jalan**; hanya fitur eligibility/battle yang menunggu. Dana tidak berisiko.
- Set **≥ 86400**; `90000` memberi margin ~40 menit.

---

## 4. Checklist WAJIB sebelum mainnet

- [x] Verifikasi read-only tiap feed: `description()`, `decimals() == 8`, `latestRoundData()` segar. **Kelima feed SUDAH diverifikasi read-only (2026-09-24)** — semua `decimals=8`, harga segar & wajar. Ulangi tepat sebelum deploy karena harga/`updatedAt` bergerak.
- [ ] Putuskan proxy **utama (Shared SVR)** vs **secondary (non-SVR)**.
- [ ] Pastikan semua `*_HEARTBEAT >= 86400`.
- [ ] Set & verifikasi **token USDG** (`decimals()` = 6 per catatan mainnet).
- [x] **Sequencer Uptime Feed** 4663 — DIKONFIRMASI **tidak ada** feed resmi (registry + web). Keputusan: `SEQUENCER_UPTIME_FEED=address(0)` (cek L2 dilewati, fail-safe). Tinjau ulang hanya jika Robinhood/Chainlink menerbitkannya.
- [ ] Jangan pernah ship deploy 4663 dengan feed `address(0)` (kecuali sengaja menonaktifkan eligibility).

---

## 5. Sumber

- Registry resmi Chainlink: `feeds-robinhood-mainnet.json` (58 feed).
- RPC mainnet: `https://rpc.mainnet.chain.robinhood.com` (chainId `4663` / `0x1237`).
- ETH/USD diverifikasi read-only (2026-09). Alamat feed **bukan rahasia**, tapi tetap harus dari registry — jangan di-hardcode di Solidity (spec §2.2.1); di-set per-jaringan via env + `setPriceFeed`.

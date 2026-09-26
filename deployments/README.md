# deployments/ — status & cara pakai

> ## ⚠️ STATUS FILE INI: **STALE — MENUNGGU DEPLOY KONTRAK BARU**
>
> `46630.json` memuat **deploy testnet terakhir (2026-09-21)**. Deploy itu **belum memuat**
> Batch 1+2 audit: tidak ada `expireBattle`, `skipWeek`, `MAX_PRICE_AGE`/`PRICE_STALENESS_LIMIT`,
> tier pending 90 hari, maupun routing `isPendingExpired` di `QualyraFeeVault`.
>
> Semua feed di file itu juga masih **`address(0)`** (testnet tidak punya price feed), jadi
> eligibility/DQ = NOT-EVALUABLE dan mesin kompetisi praktis belum bisa berjalan di sana.
>
> **Ini bukan bug dan bukan temuan.** Kontraknya non-upgradeable dan memang **belum dinyatakan
> siap**, jadi alamat lama tetap terpakai sampai ada deploy baru. Status yang benar untuk deploy ini
> adalah: **menunggu redeploy** — bukan "deployment tertinggal" atau "kontrak salah".

## Setelah redeploy

```bash
cd contracts && forge build
cd ../indexer && npm run gen-deployments   # regenerasi dari contracts/broadcast
cd .. && node scripts/sync-abi.mjs
```

`gen-deployments.mjs` menulis ulang `46630.json` dari broadcast, jadi penanda `_status` di dalam
file JSON itu akan **hilang dengan sendirinya** begitu deploy baru tercatat.

## Isi folder

| File | Isi | Dibaca oleh |
| --- | --- | --- |
| `46630.json` | Alamat 9 kontrak inti + `external.poolManager` + `deployBlock` di testnet (chain 46630). **Generated** — jangan diedit tangan. | `frontend/lib/contracts.ts:14` (fallback alamat), `indexer/src/config.ts:48` (`ADDRESSES` + `DEPLOY_BLOCK`) |
| `4663.feeds.json` | **Konfigurasi feed mainnet saja** (proxy Chainlink + heartbeat). Kontrak inti **belum** ada di 4663; alamat kontrak akan menyusul di `4663.json` setelah deploy. | `script/DeployQualyra.s.sol` (`_wireFeeds`, via env) + `contracts/docs/MAINNET-FEED-CONFIG.md` |

## Kenapa `deployBlock` penting

`indexer/src/config.ts` memakai `deployBlock` sebagai lantai scan (`START_BLOCK`). Redeploy otomatis
menaikkannya, jadi indexer ikut pindah tanpa edit manual — tapi artinya pula **indexer harus di-restart
setelah redeploy**, kalau tidak ia masih membaca alamat lama.

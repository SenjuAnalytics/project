Qualyra V1 — Konsep & Rancangan Kontrak
Sep 17, 2026 · @sejuaju

> ⚠️ **ADENDUM PERUBAHAN DESAIN (menggantikan bagian terkait di bawah).**
> Dokumen ini adalah konsep awal. Beberapa keputusan telah **diubah**; acuan tunggal yang berlaku sekarang adalah **`docs/FEE-AND-BATTLE-SPEC.md`**. Ringkasan perubahan:
> 1. **Eligibility battle kini dihitung ON-CHAIN via Chainlink**, bukan lagi oleh indexer. Kalimat "Tanpa oracle harga di kontrak: penyetaraan ke USD dilakukan indexer" **sudah tidak berlaku** — kontrak membaca harga USD Chainlink (`AggregatorV3Interface`) dan menghitung MC sendiri tiap trade. (Indexer tetap dipakai untuk **scoring Trader League**, bukan gate eligibility.)
> 2. **Threshold MC tetap $100.000 USD**, tetapi "menyentuh" = **MC CLOSE ≥ $100k** (state akhir setelah trade), dan diskualifikasi bersifat **permanen**.
> 3. **Launch fee kini 100% ke treasury** (bukan 50/50 treasury/league).
> 4. **Pembagian 15% competition** diubah: **saat LIVE battle → 100% ke pot**; **sebelum pernah battle → 70% pendingBattlePot + 30% Trader League**; **setelah battle → 70% treasury + 30% Trader League**. (Treasury tidak lagi dapat 7,5% saat idle.)
> 5. **Setiap token maksimal battle 1× seumur hidup.**
> 5b. **Syarat "holder minimal 100" DIBUANG.** Satu-satunya syarat eligibility sekarang = **MC ≥ $100k USD** (menghindari kerumitan hitung holder on-chain). Diagram "MC min $100.000, holder min 100" sudah tidak berlaku — cukup MC.
> 6. Diskualifikasi bercabang: gugur di luar battle → treasury; gugur saat LIVE battle → dianggap **kalah**, pot ke pemenang.
> 7. **Robinhood Chain = L2 (Arbitrum Orbit)** → wajib **Chainlink Sequencer Uptime** check; alamat feed **berbeda testnet vs mainnet** dan **configurable** (bukan hardcode).
>
> Lihat `docs/FEE-AND-BATTLE-SPEC.md` untuk detail lengkap dan item yang masih terbuka.

### ADENDUM (lanjutan) — Aturan Finalize Battle & Routing Fee 15%
- **Routing 15% competition per fase token:** sebelum pernah battle → 70% pendingBattlePot + 30% Trader League; saat LIVE battle → 100% ke pot (seluruh 15%, plus saldo pendingBattlePot token di-seed ke pot saat battle mulai); setelah battle (token pensiun, battle maksimal 1× seumur hidup) → 70% treasury + 30% Trader League. Gugur sebelum battle → 100% (fee + seluruh pendingBattlePot) ke treasury; gugur saat LIVE battle → tetap 100% ke pot (jadi milik pemenang).
- **Eligibility:** syarat satu-satunya = MC ≥ $100.000 USD, dihitung **ON-CHAIN via Chainlink** (`AggregatorV3Interface`), close-based, dicek tiap trade. Syarat "holder minimal 100" **dibuang**.
- **Finalize (battle selalu jalan penuh 24 jam, tidak ada finalize dini):**
  - **Menang** (normal atau karena lawan gugur) → 100% pot → buyback & burn token **pemenang**.
  - **Keduanya gugur** → yang gugur **duluan** kalah; token yang bertahan lebih lama **menang** → 100% pot → buyback & burn pemenang. **Selalu ada pemenang** (bukan void; void murni hanya jika keduanya gugur di blok yang sama persis).
  - **Draw** (seri, tanpa pemenang) → pot **tidak dibelah rata**. Tiap token menerima kembali **kontribusinya sendiri** (seed pendingBattlePot-nya + competition fee live dari trade-nya sendiri) → buyback & burn **token itu sendiri** (A→A, B→B). **Bukan 50/50, bukan ke Trader League.**
  - **Void** → **sama seperti draw** (tiap token dapat kembali kontribusinya sendiri → buyback & burn token itu).
- Subseksi ini **menggantikan** pernyataan lama mana pun di dokumen ini (draw → dibagi 2 / void → Trader League / "tanpa oracle di kontrak" / skema fee lama seperti launch 50/50 dan competition 7,5/7,5).

Ringkasan
Qualyra V1 adalah launchpad token di Robinhood Chain tempat token dan trader bertanding setiap minggu, dengan hadiah dari fee trading yang benar-benar masuk — bukan hadiah yang dipatok, bukan token baru yang dicetak.
Positioning: Launch. Trade. Battle.
Prinsip V1:
• Creator ikut untung: 70% dari trading fee token-nya, ditambah creator tax opsional.
• Aset pasangan: ETH sebagai aset utama, ditambah USDG dan stock token/ETF resmi Robinhood (RWA) dari daftar yang disetujui.
• Platform tidak pernah menombok: hadiah hanya dari fee yang sudah masuk, tidak ada hadiah yang dijanjikan di depan.
• Likuiditas terkunci permanen setelah graduation; tidak ada fungsi untuk menariknya, termasuk bagi tim.
• Transparan: aliran dana tercatat on-chain, aturan dan hasil kompetisi dipublikasikan.
• Sederhana: tanpa staking, APY, emisi token, NFT boost, atau XP di V1. Tim sudah memutuskan staking tidak dipakai; kalau nanti diperlukan, staking bisa ditambahkan sebagai kontrak terpisah tanpa mengubah kontrak yang sudah di-deploy.
• Pola teknis mengikuti Pons V2 (bonding curve → pool Uniswap v4 dengan hook), ditambah pembagi fee dan sistem kompetisi.
Angka yang belum final dikumpulkan di bagian Keputusan terbuka.
Aktor dan siklus hidup token
Ada tiga aktor: creator membuat token, trader memperdagangkannya, dan platform menjalankan kontrak serta kompetisi.
Aktor
Peran
Membayar
Menerima
Creator
Membuat token
Launch fee
70% trading fee token-nya + seluruh creator tax, dalam aset pasangan token itu
Trader
Membeli dan menjual token
Trading fee 1% (+ creator tax jika diaktifkan)
Hadiah Trader League (top 5 per minggu)
Platform (Qualyra)
Menjalankan kontrak, indexer, dan kompetisi
Biaya operasional, gas buyback dan pencatatan hasil
15% trading fee + tambahan dari token yang tidak battle + bagian launch fee
Holder token pemenang battle diuntungkan lewat buyback & burn, bukan lewat transfer langsung.
flowchart LR
  A["Creator isi form<br/>pilih aset pasangan<br/>bayar launch fee"] --> B["Token dibuat<br/>supply masuk curve"]
  B --> C["Trading di bonding curve<br/>fee 1% dalam aset pasangan"]
  C -->|"bagian curve habis"| D["Graduation otomatis"]
  D --> E["Pool Uniswap v4<br/>token/aset pasangan<br/>hook Qualyra, fee 1%"]
  E --> F["Likuiditas<br/>terkunci selamanya"]
  E -.->|"MC min $100.000 (dicek on-chain via Chainlink)"| G["Battle sesama aset"]
1. Create: creator mengisi nama, simbol, gambar, dan deskripsi, memilih aset pasangan, lalu membayar launch fee. Aset pasangan bisa ETH (pilihan utama), USDG, atau stock token/ETF dari daftar yang disetujui, dan terkunci selamanya untuk token itu. Opsional: link sosial, creator tax, dan pembelian pertama di transaksi yang sama. Kontrak token dan bonding curve dibuat, dan seluruh supply 1 miliar masuk ke curve tanpa jatah untuk creator, sama seperti Pons V2.
2. Trading di bonding curve: harga naik saat dibeli dan turun saat dijual; siapa pun selalu bisa menjual kembali ke curve. Setiap trade membayar fee 1% dalam aset pasangan token itu.
3. Graduation: berjalan otomatis di pembelian yang menghabiskan bagian curve, yaitu 5/7 supply. Targetnya sama dengan Pons V2: 4,2 ETH untuk pasangan ETH, 8.090 USDG untuk pasangan USDG, dan angka per aset dari Pons untuk stock token. Aset pasangan yang terkumpul dan 2/7 supply cadangan dipasangkan menjadi pool Uniswap v4, misalnya TOKEN/ETH atau TOKEN/USDG.
4. Setelah graduation: token bisa diperdagangkan dari mana saja (website Qualyra, aplikasi Uniswap, aggregator). Hook Qualyra memungut fee 1% yang sama, jadi pembagian dana tidak berubah.
5. Kompetisi: hanya token yang sudah graduation dan memenuhi syarat yang bisa dijadwalkan battle, melawan token dengan aset pasangan yang sama. Token yang masih di bonding curve tidak bisa ikut.
Aset pasangan: ETH, USDG, dan RWA
Setiap token dipasangkan dengan satu aset yang dipilih creator saat launch: ETH sebagai aset utama, USDG, atau stock token/ETF resmi Robinhood dari daftar yang disetujui.
Aset pasangan
Peran
Catatan
ETH
Aset utama dan pilihan bawaan
Aset gas di Robinhood Chain; Pons V2 juga memakai ETH sebagai bawaan
USDG
Pasangan stablecoin dolar
Stablecoin pertama yang diterbitkan native di Robinhood Chain, oleh Paxos; kontraknya proxy yang bisa di-upgrade
Stock token/ETF (RWA)
Pasangan berbasis saham, misalnya NVDA, AAPL, SPY
ERC-20 18 desimal; nilai per token mengikuti multiplier; dibatasi Robinhood di beberapa wilayah
Aturan:
• Daftar tertutup: hanya aset yang disetujui yang bisa dipilih. Untuk RWA, hanya alamat stock token resmi Robinhood; token dengan nama atau ticker sama tapi alamat lain ditolak.
• Tambah aset tanpa deploy ulang: lewat multisig dan timelock, berlaku untuk launch berikutnya. Token yang sudah launch tidak berubah.
• Daftar saat deploy: ETH, USDG, dan tiga stock token NVDA, AAPL, SPY. Sisa aset Pons (GOOGL, GME, SPCX, SGOV) alamat dan angkanya sudah dicatat di script deploy, tetapi baru didaftarkan lewat timelock setelah ditinjau satu per satu.
• Penjagaan desimal: kontrak membaca sendiri decimals() milik aset yang didaftarkan dan menolak kalau tidak cocok dengan yang diisi admin, atau kalau desimalnya di bawah 6. Ini mencegah salah harga 10^12 kalau USDG (6 desimal) diperlakukan sebagai 18 desimal.
• Parameter per aset: target graduation dan cadangan awal curve ditetapkan per aset mengikuti angka Pons V2, karena nilai 1 ETH, 1 USDG, dan 1 NVDA berbeda.
• Fee dan saldo per aset: fee dipungut dan dibagi dalam aset pasangan, dan saldo di vault dicatat terpisah per aset.
• Tanpa oracle harga di kontrak: penyetaraan ke USD dilakukan indexer, bukan kontrak.
• Bukan jaminan aset: dipasangkan dengan RWA berarti harga dihitung dalam aset itu, bukan berarti token dijamin aset itu atau punya harga dasar.
Risiko yang harus ditangani:
• Pembatasan wilayah: Robinhood tidak menawarkan stock token di AS atau kepada warga AS, dan membatasinya di negara lain seperti Inggris, Kanada, dan Swiss. V1 tidak membuat pembatasan wilayah di UI.
• Harga ikut saham: token berpasangan NVDA ikut naik-turun bersama NVDA. Mint dan redeem stock token hanya berjalan Senin 02:00 sampai Sabtu 02:00 CET/CEST, jadi harga on-chain bisa melenceng di akhir pekan.
• Multiplier: split dan dividen mengubah nilai per token lewat multiplier (uiMultiplier), bukan jumlah token. UI dan indexer wajib memakai harga yang sudah memperhitungkan multiplier.
• Kendali penerbit: fitur pause atau freeze pada USDG dan stock token belum terverifikasi, dan wajib dicek sebelum kontrak ditulis.
• Likuiditas terpecah: makin banyak aset, makin sedikit token per aset dan makin sulit battle mendapat lawan. Daftar awal sebaiknya kecil.
Fee, tax, dan pembagian dana
Setiap trade membayar fee 1% dalam aset pasangan token itu, dibagi 70% creator, 15% platform, dan 15% kompetisi. Bagian kompetisi diarahkan berbeda tergantung token sedang battle atau tidak. Kolom "sedang battle" hanya berlaku selama 24 jam battle; begitu battle selesai, fee token itu kembali ke pembagian normal dan tidak masuk pot lagi.
Porsi dari fee
Token sedang battle
Token tidak battle
Creator
70% · $7,00
70% · $7,00
Platform (treasury)
15% · $1,50
22,5% · $2,25
Pot battle
15% · $1,50
0%
Pool Trader League
0%
7,5% · $0,75
Contoh dalam tabel: satu trade senilai $1.000, fee $10.
Contoh satu minggu: volume $20 juta, 30% di token yang sedang battle
Jumlah
Creator
$140.000
Platform (treasury)
$40.500
Pool Trader League
$10.500
Pot battle (semua battle minggu itu)
$9.000
Biaya lain dan aturannya:
• Creator tax (opsional): dipilih creator saat launch, ada batas maksimal, tidak bisa dinaikkan, dan 100% untuk creator. Tarifnya sama untuk beli dan jual, dipungut di bonding curve dan hook, bukan di kontrak token.
• Anti-snipe tax: sama dengan Pons V2, pajak beli mulai 99% lalu turun eksponensial ke 0 dalam 15 detik (sekitar 25% di detik ketiga dan 6% di detik kelima). Jendela ini bisa diubah admin sampai maksimal 60 detik. Hanya berlaku untuk beli, dan hasilnya dibagi seperti trading fee. Untuk token ber-tax, anti-snipe dibatasi supaya fee, creator tax, dan anti-snipe totalnya paling tinggi 99%, jadi pembeli selalu mendapat token senilai minimal 1% dari yang dibayar. Wallet peluncur, penerima fee creator, dan maksimal 32 wallet pilihan creator bebas anti-snipe.
• Launch fee: sama dengan Pons V2, yaitu 0,0005 ETH, dibayar dengan ETH apa pun aset pasangannya. Seluruhnya 100% ke treasury (bukan lagi 50/50 dengan Trader League).
• Selalu dalam aset pasangan: di curve, fee dipotong dari aset pasangan yang masuk atau keluar. Setelah graduation, hook memungut fee langsung di sisi aset pasangan pada setiap swap, jadi tidak ada fee berbentuk token yang perlu ditukar. Creator token berpasangan USDG menerima fee dalam USDG.
• Dikunci per token: aset pasangan, persentase pembagian, dan creator tax dikunci saat launch. Perubahan persentase hanya berlaku untuk launch berikutnya, lewat multisig dan dalam batas yang ditulis di kontrak.
• Buyback bebas fee: pembelian dari pot battle tidak dikenai fee, supaya seluruh pot dipakai membeli token.
Token League (battle)
Token yang memenuhi syarat dipasangkan otomatis untuk battle 24 jam. Pemenang mengambil seluruh pot, yang dipakai untuk buyback & burn token pemenang.
Syarat ikut (market cap dalam USD, dihitung ON-CHAIN via Chainlink tiap trade, bukan oleh indexer):
• Sudah graduation; token yang masih di bonding curve tidak bisa ikut.
• Market cap minimal $100.000 dan tidak pernah di bawah angka itu selama 24 jam sebelum jadwal dicatat. Token yang pernah turun di bawah $100.000 setelah menyentuhnya tidak memenuhi syarat lagi untuk selamanya, tetapi battle yang sedang berjalan tetap lanjut. Market cap dihitung seperti Pons: harga × (total supply − burned supply), dalam USD; pengecekan close-based tiap trade memakai harga USD Chainlink.
• (Syarat "holder minimal 100" DIBUANG; kini satu-satunya syarat adalah MC >= $100.000 USD.)
• Creator boleh sudah menjual tokennya; tidak ada batas jual creator.
• Tidak sedang dalam battle lain.
Pasangan lawan:
• Hanya melawan token dengan aset pasangan yang sama (ETH lawan ETH, USDG lawan USDG, NVDA lawan NVDA), supaya pot berisi satu aset dan buyback tidak perlu menukar aset.
• Dipasangkan otomatis dengan ukuran mirip, misalnya dari likuiditas atau market cap.
• Tidak bertemu lawan yang sama dua kali dalam seminggu.
• Jadwal dicatat on-chain sebelum battle dimulai, jadi publik tahu lebih dulu dan tidak bisa diubah diam-diam.
Pot battle: berasal dari 15% fee kedua token selama 24 jam battle, dalam aset pasangan yang sama, bertambah live, dan besarnya tidak dipatok. Begitu battle selesai, fee kedua token kembali ke pembagian normal Fase 3 (70% treasury + 30% Trader League) dan tidak masuk pot lagi, termasuk selama masa sanggah dan buyback.
Penentu pemenang: skor = 70% bagian Qualified Volume + 30% bagian pembeli unik yang lolos filter. "Bagian" = nilai token itu ÷ total kedua token. Transaksi wallet creator dan wallet yang terhubung dengannya tidak dihitung. Selisih skor di bawah 1 poin persen dianggap seri.
Hadiah (buyback & burn):
• Setelah hasil final dan lewat masa sanggah, seluruh pot dipakai membeli token pemenang dengan aset pasangannya, lalu token dibakar.
• Pembelian dipecah menjadi 4 bagian, satu token paling cepat dibeli lagi setelah 30 menit walaupun menang beberapa battle, dan setiap bagian paling banyak menaikkan harga token 5%. Batas ini hanya mengatur kecepatan, bukan jumlah: sisa yang tidak terpakai tetap tinggal di pot. Di atas sekitar 2,1% bot mulai bisa mengambil untung dari lompatan harganya, dan angka 5% dipilih sadar supaya buyback terlihat di harga dan pot besar selesai dalam hitungan jam, bukan hari, supaya tidak dimanfaatkan bot atau whale.
• Pembelian selalu lewat pool Uniswap v4, karena token yang ikut battle pasti sudah graduation.
Battle Points: menang +3, seri +1, kalah 0. Poin dipakai untuk leaderboard mingguan dan penentuan lawan, bukan untuk hadiah uang.
Kasus khusus:
Kasus
Pot battle
Seri
Tiap token dapat kembali kontribusinya sendiri; buyback & burn token itu (A->A, B->B) - bukan dibagi dua, bukan ke Trader League
Satu token terbukti curang
Lawannya otomatis menang dan menerima seluruh pot
Kedua token gugur
Yang gugur duluan kalah; token yang bertahan lebih lama menang dan menerima seluruh pot (void murni hanya jika keduanya gugur di blok yang sama, dan itu pun tiap token dapat kembali kontribusinya sendiri)
Battle batal (void)
Tiap token dapat kembali kontribusinya sendiri; buyback & burn token itu (bukan ke Trader League)
Trader League
Wallet diranking setiap minggu berdasarkan Qualified Volume, disetarakan ke USD, dari semua token yang diluncurkan di Qualyra dalam satu leaderboard global (bukan per token), dan 5 besar berbagi pool Trader League: juara 1 40%, juara 2 30%, juara 3 15%, juara 4 10%, juara 5 5%.
• Volume yang dihitung: semua trade token yang diluncurkan lewat Qualyra, termasuk token yang sedang battle, di bonding curve maupun di pool Uniswap v4, dari mana pun trader bertransaksi. Token lain di Robinhood Chain tidak dihitung.
• Penyetaraan ke USD: indexer mengubah volume dalam ETH, USDG, dan stock token ke USD memakai harga saat trade; harga stock token sudah memperhitungkan multiplier.
• Filter: mengikuti aturan Qualified Volume di bagian berikutnya; creator yang memperdagangkan tokennya sendiri tidak dihitung.
• Sumber pool:
    ◦ 30% dari bagian competition (4,5% dari trading fee) setiap token, kecuali saat token itu LIVE battle atau sudah didiskualifikasi sebelum battle, dalam aset pasangan masing-masing.
    ◦ Hadiah minggu sebelumnya yang tidak diklaim dalam 60 hari.
• Hadiah per aset: pool bisa berisi beberapa aset sekaligus. Setiap juara menerima porsinya dari setiap aset, misalnya juara 1 mendapat 40% saldo ETH dan 40% saldo USDG; kontrak tidak menukar aset.
• Klaim: setelah hasil final dan lewat masa sanggah, kontrak menghitung sendiri bagian 40/30/15/10/5 dari saldo pool minggu itu per aset, dan operator hanya mencatat lima wallet pemenang. Siapa pun boleh memicu klaim atas nama pemenang, tetapi uangnya selalu masuk ke wallet pemenang.
• Tidak diklaim: setelah 60 hari, sisa hadiah otomatis masuk pool minggu yang sedang berjalan.
• Kurang dari 5 pemenang yang lolos syarat: porsi yang tidak terbagi masuk pool minggu berikutnya.
• Dana sebelum Trader League dimulai: bagian yang terkumpul sejak platform live, sebelum hadiah mingguan mulai dibayar, dibagi rata sebagai tambahan pool 4 minggu pertama, supaya minggu pertama tidak jadi sasaran wash trading.
Contoh: volume token yang tidak battle $10 juta dalam seminggu menghasilkan fee $100.000, jadi pool Trader League $4.500. Hadiahnya $1.800 untuk juara 1, $1.350 untuk juara 2, $675 untuk juara 3, $450 untuk juara 4, dan $225 untuk juara 5.
Wash trading tidak menguntungkan: pelaku membayar fee 1% dari seluruh volumenya, sedangkan pool hadiah hanya 4,5% dari fee.
Qualified Volume, verifikasi, dan siklus mingguan
Aliran uang berjalan otomatis on-chain. Hanya filter dan ranking yang dihitung di luar chain, lalu hasilnya dicatat on-chain dan bisa dicek publik sebelum hadiah cair.
Aturan filter Qualified Volume (dipublikasikan terbuka):
• Trade di bawah nominal minimum (dalam USD) tidak dihitung.
• Beli-jual bolak-balik oleh wallet yang sama hanya dihitung bersihnya.
• Wallet yang didanai dari sumber yang sama dianggap satu wallet.
• Wallet creator dan wallet yang terhubung dengannya tidak dihitung untuk tokennya sendiri.
• Pola wash trading, circular trading, dan volume terkoordinasi dikeluarkan.
• Pembelian oleh kontrak buyback tidak dihitung.
Identitas trader: di pool Uniswap v4, kontrak hanya melihat alamat router. Indexer menentukan wallet trader dari transaksi aslinya; trade lewat smart wallet atau aggregator mengikuti aturan yang dipublikasikan.
flowchart LR
  A["Trade tercatat<br/>sebagai event on-chain"] --> B["Indexer hitung<br/>volume & skor"]
  B --> C["Data & wallet yang<br/>dikeluarkan dipublikasikan"]
  C --> D["Multisig catat hasil<br/>(Merkle root) on-chain"]
  D --> E["Masa sanggah"]
  E -->|"tidak ada kesalahan"| F["Final: klaim<br/>& buyback berjalan"]
  E -->|"ada kesalahan"| B
Selama masa sanggah siapa pun bisa melaporkan kesalahan, dan guardian bisa membatalkan hasil untuk dihitung ulang. Kontrak menghitung sendiri besar hadiah dari dana yang ada, jadi hasil yang dicatat tidak mungkin melebihi pool atau pot, dan kontrak menolak hasil battle yang tidak sesuai aturan seri.
Kegiatan
Jadwal
Periode kompetisi
Senin 00:00 UTC (07:00 WIB) sampai Senin berikutnya
Battle
Slot 24 jam; jadwal dicatat on-chain sebelum dimulai
Hasil battle
Dicatat setelah battle selesai, masa sanggah 24 jam, lalu buyback
Hasil Trader League
Dicatat setelah minggu berakhir, masa sanggah 48 jam, lalu klaim dibuka
Reset leaderboard
Battle Points dan volume mingguan kembali ke 0 setiap Senin
Keamanan dana dan kontrol admin
Tidak ada pihak, termasuk tim Qualyra, yang bisa menarik likuiditas atau mengambil saldo creator dan dana hadiah untuk dirinya sendiri. Admin hanya bisa menghentikan sementara dan menjalankan penyelamatan darurat yang dibatasi.
Peran
Dipegang oleh
Bisa
Tidak bisa
Admin
Multisig (misalnya 3 dari 5) dengan timelock 48 jam
Mengubah parameter dan daftar aset pasangan untuk launch berikutnya dalam batas kontrak; penyelamatan darurat
Mengubah parameter token yang sudah launch; menarik likuiditas; mengambil saldo creator atau hadiah
Operator hasil
Multisig
Mencatat jadwal battle dan hasil kompetisi
Mencatat hasil melebihi dana yang tersedia
Guardian
Multisig kecil yang bisa bergerak cepat
Pause; membatalkan hasil selama masa sanggah
Memindahkan dana
Creator
Wallet creator
Menarik fee-nya; mengganti alamat penerima fee
Mengubah fee, tax, atau supply
• Pause: Pons V2 tidak punya pause, jadi trading di curve dan pool Qualyra juga tidak bisa dihentikan. Pause hanya ada di kontrak hadiah, yaitu QualyraCompetitionVault (pembayaran hadiah dan klaim) dan QualyraBuybackBurner (buyback), karena fitur ini tidak ada di Pons dan bergantung pada hasil yang dihitung di luar chain. QualyraLaunchToken, QualyraBondingCurve, QualyraHook, pool Uniswap, QualyraFeeVault, dan QualyraFactory tidak punya pause.
• Penyelamatan darurat: hanya untuk kontrak hadiah saat kondisi pause, lewat multisig admin dan timelock 48 jam, hanya ke kontrak pengganti yang alamatnya dikunci, dengan saldo tiap penerima tetap dihormati. Semua tercatat publik. Seperti Pons V2, launch yang tertahan 7 hari penuh antara curve habis dan graduation bisa dikembalikan dananya lewat QualyraFactory; ini jalur pemulihan, bukan pause.
• Membatasi kerugian: hook tidak menimbun saldo (fee dipindahkan ke vault secara berkala), dana hadiah dipisah per battle, per minggu, dan per aset, dan setiap hasil dibatasi sebesar dana yang tersedia. Jika penerbit USDG atau stock token menghentikan transfer, hanya aset itu yang tertahan.
• Tanpa upgrade: kontrak tidak bisa diubah setelah deploy, sama seperti Pons V2 yang mengganti seluruh set kontrak alih-alih meng-upgrade. Karena bug tidak bisa ditambal di tempat, audit wajib sebelum mainnet.
Pemetaan UI/UX saat ini ke kebutuhan kontrak
UI saat ini belum memanggil kontrak sama sekali: launch, trade, battle, stake, dan klaim semuanya masih simulasi di penyimpanan browser (localStorage). Tabel ini memetakan setiap fitur ke sumber data V1; perubahan tampilan dibahas terpisah nanti.
Halaman
Fitur di UI sekarang
Kebutuhan V1
Sumber
Launch
Nama, ticker, logo, deskripsi, link sosial
Buat token; simpan logo, deskripsi, dan sosial
Kontrak (nama, simbol) + penyimpanan metadata
Launch
Pilihan supply 1B/100M/10B, aset ETH/USDG/USD, target graduation
Supply tetap; aset pasangan dipilih dari daftar (ETH utama, USDG, stock token/ETF); target graduation per aset dari kontrak
Kontrak (daftar aset dan target dibaca dari kontrak)
Launch
Tabel biaya: 0,05 ETH dan fee 1% dibagi 40/50/10
Launch fee 0,0005 ETH, fee 1% dibagi 70/15/15, creator tax
Kontrak
Launch
Belum ada
Input creator tax, pembelian pertama, dan maksimal 32 wallet bebas anti-snipe
Kontrak
Launch
Shield escrow, vesting, track RWA, biaya battle $50
Tidak dipakai; likuiditas "terkunci selamanya"; RWA masuk lewat pilihan aset pasangan, tanpa klaim floor price
Tidak di V1
Trade
Beli/jual simulasi dengan harga linear
Beli/jual di curve dengan aset pasangan dan batas slippage (USDG dan stock token perlu approve); setelah graduation lewat pool v4
Kontrak / router Uniswap
Trade
Estimasi terima, price impact, min received
Quote termasuk fee, creator tax, dan anti-snipe
Kontrak (view)
Trade
Progres bonding, raised/goal, status graduated
Status curve dan event graduation
Kontrak
Trade
Chart, live trades, holders, aktivitas
Data dari event curve dan hook
Indexer
Trade
Tag battle (BTL #)
Status battle aktif dan pot live
Kontrak + indexer
Trade
Limit order, TP/SL, sentimen, trollbox, bridge, share PnL
Tidak ada kontrak Qualyra
Tidak di V1 (dibahas saat UI)
Battles
3 duel tetap, hadiah dipatok, countdown reset saat reload
Jadwal battle on-chain, pot live, waktu mulai dan selesai
Kontrak
Battles
Dominance = 70% volume + 30% vote
Skor = 70% Qualified Volume + 30% pembeli unik
Indexer, hasil dicatat ke kontrak
Battles
Vote, voter pool, biaya masuk $50, bracket, prediksi
Tidak dipakai
Tidak di V1
Battles
Leaderboard musim dan Hall of Fame
Leaderboard Battle Points mingguan, riwayat hasil dan burn
Indexer dari event kontrak
Battles
Filter kategori AI, memes, DeFi, dan RWA
Filter per aset pasangan: ETH, USDG, dan stock token
Indexer
Earn
Staking QLRA, APY, tier, compound (halaman sudah dihapus)
Staking tidak dipakai sama sekali; klaim hadiah pindah ke Portfolio
Tidak di V1
Portfolio
Saldo, holdings, PnL, riwayat trade
Saldo token dan riwayat dari event
RPC + indexer
Portfolio
Launched tokens dan klaim milestone
Daftar token milik creator, saldo fee creator per aset, tarik fee
Kontrak
Portfolio
Riwayat vote battle
Klaim hadiah Trader League per aset, 40/30/15/10/5 dihitung kontrak
Kontrak + indexer
Home & banner
Statistik hero dan pool $25.000 yang dipatok
Total volume, jumlah token, pool dan pot minggu ini, waktu akhir minggu
Kontrak + indexer
Semua halaman
Receipt transaksi dan feed aktivitas palsu
Receipt transaksi asli dan feed event
RPC + indexer
Fitur V1 yang belum punya tempat di UI:
• Rincian fee per trade (70/15/15 dan creator tax).
• Tarik fee untuk creator, per aset.
• Pilihan stock token/ETF sebagai aset pasangan.
• Leaderboard dan klaim Trader League, termasuk status masa sanggah.
• Halaman transparansi: aliran fee, pot, buyback & burn.
Arsitektur kontrak V1
V1 butuh 11 jenis kontrak, semuanya berawalan Qualyra: 9 dipasang sekali untuk seluruh platform, dan 2 (QualyraLaunchToken dan QualyraBondingCurve) dibuat otomatis setiap kali token diluncurkan. Pool tidak punya kontrak sendiri, karena di Uniswap v4 semua pool tinggal di PoolManager milik Uniswap.
flowchart LR
  C["Creator"] --> R["QualyraLaunchRouter"]
  R --> F["QualyraFactory"]
  F --> D["QualyraLaunchDeployer"]
  D --> BC["QualyraBondingCurve<br/>per token"]
  T["Trader"] --> BC
  T --> PM["Uniswap v4<br/>PoolManager"]
  PM --> H["QualyraHook"]
  BC -->|"curve habis"| G["QualyraGraduationExecutor"]
  G --> PM
  G --> L["QualyraLiquidityLocker"]
  BC -->|"fee"| V["QualyraFeeVault"]
  H -->|"fee"| V
  V -->|"15% kompetisi"| CV["QualyraCompetitionVault"]
  CV --> BB["QualyraBuybackBurner"]
  M["Multisig operator"] --> CV
Fee mengalir dalam aset pasangan dari curve (sebelum graduation) atau hook (sesudah graduation) ke QualyraFeeVault, lalu bagian kompetisi diteruskan ke QualyraCompetitionVault.
Kontrak
Jumlah
Kegunaan
QualyraFactory
1
Pintu masuk launch; menyimpan daftar aset pasangan dan parameter per aset, konfigurasi dan status tiap token; menjalankan graduation
QualyraLaunchDeployer
1
Membuat kontrak token dan curve di alamat yang bisa diprediksi
QualyraLaunchRouter
1
Launch dan pembelian pertama creator dalam satu transaksi, dengan ETH, USDG, atau stock token, supaya tidak didahului bot
QualyraLaunchToken
1 per token
Cetakan ERC-20 untuk token buatan creator, bukan token resmi Qualyra; supply tetap, tanpa owner, mint, tax, freeze, atau blacklist
QualyraBondingCurve
1 per token
Pasar beli/jual sebelum graduation dalam aset pasangan token; memungut fee, creator tax, dan anti-snipe tax
QualyraHook
1 untuk semua pool
Memungut fee 1% dan creator tax dalam aset pasangan di setiap swap setelah graduation
QualyraGraduationExecutor
1
Membuat pool Uniswap v4 token/aset pasangan dan posisi likuiditas, lalu mengirimnya ke locker
QualyraLiquidityLocker
1
Menyimpan posisi likuiditas selamanya, tanpa fungsi tarik
QualyraFeeVault
1
Membagi fee 70/15/15, menyimpan saldo creator dan treasury per aset, meneruskan dana kompetisi
QualyraCompetitionVault
1
Jadwal dan pot battle, pool Trader League mingguan per aset, hasil kompetisi, masa sanggah, klaim hadiah
QualyraBuybackBurner
1
Membeli token pemenang battle secara bertahap dengan aset pasangannya, lalu membakarnya
Tidak kita buat sendiri: PoolManager Uniswap v4, router Uniswap untuk swap setelah graduation, multisig Safe, timelock standar OpenZeppelin, serta kontrak USDG dan stock token milik penerbitnya.
Catatan teknis:
• Fee di pool: fee bawaan pool diset 0 dan hook yang memungut fee. Fee yang jatuh dalam bentuk token ditukar dulu ke aset pasangan sebelum dibagi.
• Status battle: hook menanyakan QualyraCompetitionVault apakah token sedang battle pada saat swap terjadi, lalu mencatat fee-nya per battle. Di luar 24 jam battle, fee langsung kembali ke pembagian normal.
• Identitas trader: hook hanya melihat alamat router, jadi wallet trader untuk leaderboard ditentukan indexer dari transaksi aslinya.
• Pola tarik sendiri: creator, treasury, dan pemenang menarik dananya sendiri; kontrak tidak mengirim otomatis ke banyak alamat sekaligus.
• Ukuran kontrak: Ethereum membatasi ukuran satu kontrak 24 KB, jadi pembagian kontrak bisa sedikit berubah saat implementasi.
Alamat kontrak
Platform menghasilkan 9 alamat kontrak tetap, ditambah 2 alamat baru setiap kali token diluncurkan: 9 + 2 × jumlah token.
Alamat
Jumlah
Dibuat oleh
9 kontrak platform
9, tetap
Tim, sekali deploy ke mainnet
QualyraLaunchToken dan QualyraBondingCurve
2 per token
QualyraFactory, otomatis saat creator launch
Safe multisig: Admin, Operator, Guardian
3
Tim, lewat aplikasi Safe
Timelock OpenZeppelin
1
Tim
Treasury
Tidak ada tambahan
Memakai Safe Admin
Pool Uniswap v4 dan posisi LP
Tidak ada
Pool hanya punya PoolId di PoolManager; posisi LP dipegang langsung oleh QualyraLiquidityLocker di dalam PoolManager, tanpa NFT
Contoh: dengan 100 token ada 209 alamat kontrak Qualyra, dan dengan 1.000 token ada 2.009. Battle, minggu Trader League, dan saldo creator hanya data di dalam kontrak, bukan alamat baru.
• Testnet dan mainnet: masing-masing punya set alamat sendiri dengan jumlah yang sama.
• Tetap 9: QualyraCompetitionVault selesai di 16,8 KB, di bawah batas 24 KB, jadi tidak perlu dipecah.
• Alamat pihak lain: kontrak Uniswap (PoolManager, PositionManager, Universal Router, Permit2), USDG, dan stock token dipakai, tapi bukan milik Qualyra.
• Token resmi Qualyra: diluncurkan terpisah di Pons dengan kontrak Pons. Token itu tidak memakai kontrak V1, tidak menambah alamat, fee-nya mengikuti aturan Pons, dan tidak ikut Token League maupun Trader League.
Cara deploy
9 kontrak di-deploy sekaligus ke mainnet dalam satu sesi, lalu fiturnya dinyalakan bertahap.
flowchart LR
  A["Deploy 9 kontrak<br/>sekaligus ke mainnet"] --> B["Tahap 1<br/>launch, trading, graduation"]
  B --> C["Tahap 2<br/>hadiah Trader League"]
  C --> D["Tahap 3<br/>battle Token League"]
Tahap 2 dimulai setelah indexer siap, dan tahap 3 setelah matchmaking siap. Bagian Trader League sudah terkumpul di QualyraCompetitionVault sejak tahap 1.
• Kenapa tidak dicicil: token bisa graduation kapan saja dan kontrak tidak bisa di-upgrade. Menyambungkan kontrak belakangan berarti memberi admin kuasa atas likuiditas.
• Tidak ada token saat deploy: deploy tidak membuat token apa pun; token pertama adalah token pertama yang di-launch creator.
• Uji di testnet: alur lengkap dari launch sampai graduation diuji di testnet. Tidak ada token uji di mainnet, karena token itu permanen dan publik.
• Pengerjaan tetap bertahap: penulisan kontrak dan uji di testnet dilakukan bertahap; aturan deploy sekaligus hanya berlaku untuk mainnet.
Fungsi utama per kontrak
Tabel ini rencana awal. Nama fungsi final ada di kode dan di README folder contracts/, dan bedanya dicatat di Status implementasi.
Kontrak
Fungsi
Dipanggil oleh
Kegunaan
QualyraFactory
launchToken(name, symbol, metadataURI, quoteAsset, creatorTaxBps, snipeExemptWallets)
Creator, lewat router
Bayar launch fee, buat token dan curve dengan aset pasangan yang dipilih, kunci konfigurasi
QualyraFactory
setCreatorFeeRecipient(token, recipient)
Creator
Ganti alamat penerima fee
QualyraFactory
graduate(token), recoverStuckLaunch(token)
Curve otomatis; siapa pun jika perlu diulang; admin setelah launch tertahan 7 hari
Menjalankan graduation; mengembalikan dana launch yang tertahan 7 hari
QualyraFactory
getLaunch(token), isQualyraToken(token), tokenCount()
Siapa pun (baca)
Data token untuk UI dan indexer
QualyraFactory
quoteAssets(), quoteAssetConfig(asset)
Siapa pun (baca)
Daftar aset pasangan dan parameter curve per aset
QualyraFactory
setQuoteAsset(asset, curveParams), disableQuoteAsset(asset)
Admin (multisig + timelock)
Menambah, mengubah, atau menonaktifkan aset pasangan untuk launch berikutnya
QualyraFactory
setLaunchFee, setSplitForNewLaunches, setMaxCreatorTax
Admin (multisig + timelock)
Parameter untuk launch berikutnya, dalam batas kontrak
QualyraLaunchDeployer
deploy(salt, params)
QualyraFactory
Membuat kontrak token dan curve
QualyraLaunchRouter
launchAndBuy(params, amountIn, minTokensOut)
Creator
Launch dan pembelian pertama dengan ETH, USDG, atau stock token, bebas anti-snipe tax
QualyraLaunchToken
Fungsi standar ERC-20 + burn(amount)
Siapa pun
Transfer dan saldo; burn dipakai QualyraBuybackBurner
QualyraBondingCurve
buy(amountIn, minTokensOut, recipient, deadline)
Trader
Beli dengan aset pasangan dan batas slippage
QualyraBondingCurve
sell(tokenAmount, minAmountOut, recipient, deadline)
Trader
Jual dengan batas slippage; hasil dalam aset pasangan
QualyraBondingCurve
quoteBuy(amountIn), quoteSell(tokenIn)
Siapa pun (baca)
Estimasi dengan rincian fee, creator tax, dan anti-snipe
QualyraBondingCurve
progress(), reserves(), isGraduated(), quoteAsset()
Siapa pun (baca)
Progres bonding dan aset pasangan untuk UI
QualyraHook
beforeInitialize
Uniswap PoolManager
Hanya QualyraGraduationExecutor yang boleh membuat pool dengan hook ini
QualyraHook
beforeSwap, afterSwap
Uniswap PoolManager
Memungut fee 1% dan creator tax dalam aset pasangan di setiap swap
QualyraHook
sweepFees(poolIds)
Siapa pun
Memindahkan fee terkumpul ke QualyraFeeVault
QualyraGraduationExecutor
execute(token)
QualyraFactory
Membuat pool v4 token/aset pasangan di harga akhir curve dan mengirim posisi ke locker
QualyraLiquidityLocker
positionOf(token)
Siapa pun (baca)
Bukti posisi terkunci; tidak ada fungsi tarik
QualyraFeeVault
depositFee(token, asset, fee, creatorTax)
Curve, hook
Membagi 70/15/15 per aset dan mengarahkan bagian kompetisi
QualyraFeeVault
depositLaunchFee()
QualyraFactory
Membagi launch fee (ETH)
QualyraFeeVault
withdrawCreatorFees(asset)
Creator
Menarik saldo fee creator untuk satu aset
QualyraFeeVault
withdrawTreasury(asset)
Siapa pun, dana ke alamat treasury
Mengirim saldo treasury satu aset ke multisig
QualyraFeeVault
creatorBalance(address, asset), treasuryBalance(asset)
Siapa pun (baca)
Saldo per aset untuk UI
QualyraCompetitionVault
scheduleBattles(pairs, startTime)
Operator
Mencatat jadwal battle sebelum dimulai; kedua token wajib sudah graduation dan beraset pasangan sama
QualyraCompetitionVault
activeBattleOf(token), getBattle(id), battlePot(id)
Siapa pun (baca)
Status dan pot battle live
QualyraCompetitionVault
proposeBattleResult(id, result)
Operator
Mencatat pemenang, seri, atau batal
QualyraCompetitionVault
proposeWeeklyRoot(week, root, totals)
Operator
Mencatat hasil Trader League beserta total per aset
QualyraCompetitionVault
vetoBattleResult(id), vetoWeeklyRoot(week)
Guardian
Membatalkan hasil selama masa sanggah
QualyraCompetitionVault
finalizeBattle(id), finalizeWeek(week)
Siapa pun, setelah masa sanggah
Mengirim pot ke QualyraBuybackBurner atau membuka klaim
QualyraCompetitionVault
claim(week, account, asset, amount, proof)
Siapa pun, dana ke pemenang
Klaim hadiah Trader League per aset
QualyraCompetitionVault
rolloverUnclaimed(week)
Siapa pun, setelah 60 hari
Memindahkan sisa hadiah ke pool minggu berjalan
QualyraCompetitionVault
pause, unpause, rescue
Guardian; admin + timelock
Jalur darurat; saat pause, pembayaran, klaim, dan buyback di QualyraBuybackBurner ikut berhenti
QualyraBuybackBurner
executeBuyback(battleId)
Keeper atau siapa pun
Membeli bertahap dengan aset pasangan lewat pool Uniswap v4, lalu membakar
QualyraBuybackBurner
remaining(battleId)
Siapa pun (baca)
Sisa pot yang belum dibelikan
Setiap aksi penting mengeluarkan event (misalnya TokenLaunched, CurveBuy, CurveSell, SwapFeeCharged, TokenGraduated, FeeSplit, BattleFinalized, RewardClaimed, BuybackExecuted, QuoteAssetUpdated). Indexer membaca event ini untuk chart, leaderboard, dan halaman transparansi.
Status implementasi
Sembilan kontrak platform sudah ditulis dan diuji: 124 test lolos, termasuk uji serangan dan satu invariant test yang mengacak ribuan trade, sweep, dan klaim untuk memastikan saldo tiap kontrak selalu sama dengan kewajibannya. Kode ada di folder contracts/ pada branch qualyra-contracts-v1, lengkap dengan script deploy dan README berbahasa Inggris. Review keamanan pertama memperbaiki tiga temuan: fee pada swap yang berhenti di batas harga, batas dampak harga buyback saat satu token punya beberapa pot, dan bagian treasury untuk fee battle yang disapu setelah battle selesai. Review kedua menambahkan penjagaan desimal aset pasangan, jendela anti-snipe 15 detik sesuai sumber Pons, pemeriksaan alamat sebelum deploy, dan satu dry-run deploy di atas fork Robinhood Chain.
Beda dari rencana di atas:
• Hadiah Trader League dihitung kontrak, bukan bukti Merkle. Operator hanya mencatat lima wallet pemenang, kontrak membagi 40/30/15/10/5 dari tiap aset, dan klaim dilakukan per aset.
• Aturan seri dikunci di kontrak: hasil menang wajib berselisih minimal 1 poin, kalau kurang harus dicatat seri.
• Posisi likuiditas dipegang QualyraLiquidityLocker langsung di PoolManager, tanpa NFT.
• Swap di pool wajib terisi penuh saat trader menentukan sisi aset pasangan. Swap yang berhenti di batas harga ditolak, supaya fee selalu sesuai jumlah yang benar-benar diperdagangkan.
• Satu token hanya boleh punya satu jadwal battle yang belum mulai, supaya pengecekan battle aktif tetap murah di setiap swap.
• Penyelamatan darurat: saat pause, admin menunjuk satu kontrak pengganti, sekali dan permanen, lalu saldo disapu ke sana. Pot, pool, dan hadiah tetap terbaca di kontrak lama.
Sebelum mainnet: audit independen, uji penuh di testnet, verifikasi alamat PoolManager Uniswap v4 dan CREATE2 deployer di Robinhood Chain, serta pengecekan perilaku pause dan blacklist USDG dan stock token.
Keputusan terbuka dan langkah berikutnya
Semua 33 keputusan sudah Disetujui. Kolom Revisi Anda tetap bisa dipakai kalau ada yang ingin diubah.
Keputusan
Usulan
Status
Revisi Anda
Aset pasangan
ETH sebagai aset utama dan pilihan bawaan, ditambah USDG dan stock token/ETF resmi Robinhood dari daftar yang disetujui
Disetujui

Daftar awal stock token/ETF
Beberapa yang paling likuid (misalnya NVDA, AAPL, SPY), dipastikan dari data likuiditas menjelang launch
Disetujui

Supply token
Tetap 1 miliar untuk semua token
Disetujui

Jatah awal creator
Sama dengan Pons V2: tidak ada; seluruh supply masuk curve dan creator membeli seperti trader lain
Disetujui

Target graduation
Sama dengan Pons V2: 4,2 ETH untuk pasangan ETH, 8.090 USDG untuk pasangan USDG, dan angka per aset dari Pons untuk stock token; 5/7 supply dijual di curve, 2/7 untuk pool
Disetujui

Besar launch fee
Sama dengan Pons V2: 0,0005 ETH, dibayar dengan ETH untuk semua aset pasangan
Disetujui

Pembagian launch fee
50% treasury, 50% pool Trader League
Disetujui

Batas maksimal creator tax
5%
Disetujui

Anti-snipe tax
Sama dengan Pons V2: mulai 99%, turun ke 0 dalam 15 detik (jendela admin, maksimal 60 detik), hanya untuk beli; untuk token ber-tax, fee + creator tax + anti-snipe paling tinggi 99%; peluncur, penerima fee creator, dan maksimal 32 wallet pilihan creator bebas anti-snipe
Disetujui

Buyback bebas fee
Ya
Disetujui

Token di bonding curve ikut battle
Tidak bisa; hanya token yang sudah graduation
Disetujui

Syarat ikut battle
Sudah graduation; market cap minimal $100.000 dan tidak boleh turun di bawahnya setelah pernah tersentuh; holder minimal 100; creator boleh sudah menjual token
Disetujui

Cara cek market cap $100.000
Dihitung indexer dalam USD: market cap tidak pernah di bawah $100.000 selama 24 jam sebelum jadwal dicatat (sekaligus menggantikan syarat umur 24 jam)
Disetujui

Jika market cap turun di bawah $100.000
Token tidak memenuhi syarat lagi untuk selamanya; battle yang sedang berjalan tetap lanjut
Disetujui

Rumus market cap
Sama dengan Pons (burn-adjusted): harga × (total supply − burned supply), dalam USD
Disetujui

Harga untuk cek market cap
Harga penutupan per jam, supaya satu transaksi besar sesaat tidak langsung mencoret token
Disetujui

Lawan battle
Hanya token dengan aset pasangan yang sama
Disetujui

Fee setelah battle selesai
Kembali ke pembagian normal (7,5% pool Trader League, 7,5% platform) dan tidak masuk pot, termasuk selama masa sanggah dan buyback
Disetujui

Kasus khusus battle
Seperti tabel di bagian Token League
Disetujui

Seri battle
Selisih skor di bawah 1 poin persen dianggap seri
Disetujui

Masa sanggah
24 jam untuk battle, 48 jam untuk Trader League
Disetujui

Awal minggu kompetisi
Senin 00:00 UTC (07:00 WIB)
Disetujui

Cakupan Trader League
Satu leaderboard global dari semua token yang diluncurkan di Qualyra, bukan per token
Disetujui

Hadiah Trader League multi-aset
Volume disetarakan ke USD oleh indexer; hadiah dibayar per aset, 40/30/15/10/5 dari setiap aset
Disetujui

Pemenang Trader League kurang dari 5
Porsi yang tidak terbagi masuk pool minggu berikutnya
Disetujui

Dana Trader League sebelum dimulai
Bagian Trader League yang terkumpul sejak platform live sampai hadiah mingguan mulai dibayar, dibagi rata sebagai tambahan pool 4 minggu pertama
Disetujui

Nama kontrak
Semua berawalan Qualyra; cetakan token bernama QualyraLaunchToken
Disetujui

Cara deploy mainnet
9 kontrak sekaligus, fitur dinyalakan bertahap
Disetujui

Upgrade kontrak
Sama dengan Pons V2: tidak bisa di-upgrade; versi baru berarti set kontrak baru; audit wajib sebelum mainnet
Disetujui

Cakupan pause
Seperti Pons V2, token, curve, hook, pool, QualyraFeeVault, dan QualyraFactory tidak punya pause; pause hanya di kontrak hadiah (QualyraCompetitionVault dan QualyraBuybackBurner) untuk pembayaran hadiah, klaim, dan buyback; launch yang tertahan 7 hari sebelum graduation bisa dikembalikan dananya lewat QualyraFactory
Disetujui

Multisig dan treasury
3 Safe (Admin, Operator, Guardian) dan 1 timelock; treasury memakai Safe Admin
Disetujui

Timelock admin
48 jam untuk setiap perubahan dari Admin
Disetujui

Kontrak, script deploy, dan dokumen model lama
Dihapus saat pengerjaan kontrak dimulai
Disetujui

Risiko yang perlu dipantau:
• Protocol fee Uniswap v4: sudah disetujui prinsipnya untuk Robinhood Chain, angkanya belum ditetapkan. Jika aktif, biaya swap di pool bisa bertambah.
• Pool tandingan: siapa pun bisa membuat pool lain tanpa hook Qualyra, tetapi seluruh likuiditas awal ada di pool resmi.
• Aset pihak ketiga: USDG dan stock token dikendalikan penerbitnya; rinciannya di bagian Aset pasangan.
Langkah berikutnya:
1. Anda meninjau dokumen ini dan mengisi kolom Status.
2. Rancangan kontrak disetujui.
3. Fitur pause, freeze, dan upgrade pada USDG dan stock token daftar awal dicek, dan angka Pons V2 (launch fee, target graduation per aset, durasi anti-snipe) dicocokkan langsung dari kontrak Pons.
4. Kontrak ditulis bertahap dengan test: QualyraLaunchToken dan QualyraBondingCurve (ETH dan ERC-20) → QualyraHook, QualyraGraduationExecutor, QualyraLiquidityLocker → QualyraFeeVault → QualyraCompetitionVault dan QualyraBuybackBurner.
5. Deploy ke testnet Robinhood Chain, bangun indexer termasuk penyetaraan USD, lalu sambungkan UI dengan desain yang sudah ada.
6. Audit sebelum mainnet, lalu 9 kontrak di-deploy sekaligus dan fitur dinyalakan bertahap.
Sumber
• pons v2 docs
• pons docs: Fees and burns (burn-adjusted market cap)
• Pons Launchpad API on Robinhood Chain (Bitquery)
• How to Launch a Token on Pons (AirdropAlert)
• Pons V2 Upgrade Enhances Token Launch with ETH Bonding Curve (The Cryptonomist)
• Uniswap is Live on Robinhood Chain
• Uniswap Vote Adds v4 Fees and Robinhood Chain Expansion
• Stock Tokens (Robinhood Chain Docs)
• Token Contracts (Robinhood Chain Docs)
• USDG is Now Available on Robinhood Chain (Global Dollar)
• Kontrak USDG di Blockscout Robinhood Chain
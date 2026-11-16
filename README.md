# KasirKita

**Retail Point of Sale & Inventory Management System**

KasirKita adalah aplikasi berbasis web untuk operasional kasir (Point of Sale) dan manajemen persediaan ritel. Aplikasi ini dirancang untuk menyelesaikan berbagai kendala operasional yang umum dihadapi oleh usaha ritel, seperti ketidaksesuaian stok fisik dengan pembukuan, pergeseran harga pokok historis akibat fluktuasi harga beli, kesalahan perhitungan kembalian pada jam sibuk, serta pencatatan transaksi multi-metode pembayaran (tunai dan QRIS).

Aplikasi ini dibangun menggunakan arsitektur monolit modern berbasis Next.js App Router dan PostgreSQL, dengan fokus pada transaksi database atomik, otorisasi berbasis peran (RBAC) di sisi server, pencatatan snapshot data historis, serta antarmuka kasir yang responsif dan efisien.

---

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Teknologi yang Digunakan](#teknologi-yang-digunakan)
- [Arsitektur & Sorotan Engineering](#arsitektur--sorotan-engineering)
- [Panduan Instalasi Lokal](#panduan-instalasi-lokal)
- [Pengujian Otomatis](#pengujian-otomatis)
- [Persiapan Deployment Staging](#persiapan-deployment-staging)
- [Struktur Proyek](#struktur-proyek)
- [Tangkapan Layar](#tangkapan-layar)
- [Author](#author)

---

## Fitur Utama

### 1. Autentikasi & Role-Based Access Control (RBAC)
- Manajemen sesi terproteksi menggunakan JSON Web Token (JWT) yang disimpan dalam HTTP-only Cookie untuk mencegah serangan Cross-Site Scripting (XSS).
- Pemisahan hak akses berbasis peran:
  - **Pemilik (Owner)**: Akses penuh ke seluruh modul sistem (Dashboard analitik, manajemen produk, kartu stok, penyesuaian stok opname, rekomendasi restok ROP, laporan penjualan, riwayat transaksi, pengaturan toko, dan pemantauan sistem).
  - **Kasir (Cashier)**: Terbatas pada modul operasional kasir (POS), pencarian katalog produk mode baca, riwayat transaksi harian, dan cetak ulang struk.
- Proteksi brute force login dan password spraying berbasis IP client menggunakan in-memory sliding window rate limiter.

### 2. Manajemen Produk & Kategori
- Katalog produk dinamis dengan dukungan pencarian nama dan kode barcode.
- Filter berdasarkan kategori produk serta paginasi data.
- Kompresi gambar otomatis ke format WebP (dimensi maksimal 500x500 piksel) menggunakan Sharp, dilengkapi validasi tipe MIME magic-byte untuk keamanan berkas unggahan.
- Proteksi *soft delete* untuk menjaga integritas data historis produk yang telah memiliki riwayat transaksi penjualan.

### 3. Point of Sale (POS) & Checkout Kasir
- Antarmuka kasir berkecepatan tinggi dengan dukungan navigasi keyboard (F2 untuk fokus pencarian, Escape untuk membatalkan dialog, Enter untuk konfirmasi).
- Pencarian dan pemilihan produk instan dengan indikator ketersediaan stok fisik real-time.
- Perhitungan diskon fleksibel (nominal dan persentase) dengan validasi batas atas agar diskon tidak melebihi subtotal belanja.
- Multi-metode pembayaran:
  - **Tunai**: Dilengkapi algoritma *Greedy Change-Making* yang merekomendasikan kombinasi pecahan uang Rupiah terkecil untuk uang kembalian.
  - **QRIS**: Tampilan kode QR toko dengan alur konfirmasi verifikasi pembayaran manual.
- Checkout atomik dengan idempotency key untuk mencegah duplikasi transaksi akibat penekanan tombol berulang.

### 4. Cetak Struk Belanja (Thermal Printing)
- Dukungan ganda format lebar kertas thermal: **58mm** dan **80mm**.
- Injeksi CSS `@page` dinamis yang memastikan dokumen tercetak rapi sesuai dimensi fisik kertas tanpa halaman kedua kosong.
- Informasi nota lengkap: identitas toko, nomor invoice, waktu transaksi, rincian produk, alokasi diskon, metode pembayaran, hingga pesan kaki struk.
- Fitur cetak ulang (*reprint*) struk historis yang bersifat *read-only* tanpa mengubah transaksi maupun stok barang.

### 5. Manajemen Persediaan & Kartu Stok
- Kartu stok berkelanjutan (*continuous stock ledger*) yang mencatat setiap riwayat mutasi fisik: Barang Masuk (`MASUK`), Penjualan Kasir (`KELUAR`), dan Penyesuaian Fisik (`PENYESUAIAN`).
- Restok barang masuk dengan pembaruan harga beli terkini.
- Penyesuaian stok opname fisik dengan validasi selisih agar tidak mencatat mutasi fiktif ketika stok fisik tidak berubah.
- Semua mutasi stok dieksekusi dalam transaksi atomik PostgreSQL untuk mencegah *race condition* dan *lost update* saat kasir bertransaksi bersamaan.

### 6. Rekomendasi Restok (Reorder Point / ROP)
- Perhitungan titik pemesanan ulang otomatis berdasarkan rumus:
  $$\text{ROP} = (\text{Penjualan Harian Rata-rata} \times \text{Lead Time}) + \text{Safety Stock}$$
- Safety stock otomatis dihitung proporsional terhadap kecepatan penjualan dan waktu tunggu pemasok (*lead time*), dengan opsi konfigurasi khusus per produk.
- Klasifikasi status persediaan visual: **Aman**, **Menipis** (stok $\le$ ROP), dan **Habis**.
- Rekomendasi kuantitas order ekonomis untuk membantu perencanaan belanja pemilik toko.

### 7. Dashboard Analitik Penjualan
- Kartu metrik utama: total omzet kotor, laba kotor, total transaksi selesai, rata-rata nominal per transaksi, dan jumlah produk menipis.
- Analisis proporsi metode pembayaran (Tunai vs QRIS) berdasarkan nominal omzet dan jumlah transaksi.
- Daftar produk terlaris (*Top Selling Products*) dengan agregasi berbasis identitas produk stabil.

### 8. Riwayat Transaksi & Laporan Penjualan
- Pencarian invoice dan filter transaksi berdasarkan rentang tanggal kalender, kasir bertugas, dan metode pembayaran.
- Modal rincian nota untuk verifikasi audit transaksi.
- Laporan penjualan komprehensif dengan rekonsiliasi laba kotor per produk secara proporsional terhadap diskon transaksi.
- Ekspor laporan ke format **CSV** yang kompatibel langsung dengan Microsoft Excel (menggunakan *separator directive* `sep=,`, encoding UTF-8 BOM, pemisahan kolom otomatis, serta sanitasi formula injection/DDE).

### 9. Pemantauan Sistem, Error Logging & Peringatan
- Halaman pemantauan sistem (`/monitoring`) khusus Pemilik.
- Pemeriksaan kesehatan koneksi PostgreSQL dan pengukuran latensi query aktual.
- Metrik runtime Node.js: penggunaan memori V8 Heap, RSS proses, waktu CPU, dan lama waktu aplikasi berjalan (*process uptime*).
- Pencatatan log kesalahan terstruktur ke tabel database dengan sanitasi otomatis data sensitif (password, token, dan URL koneksi).
- Mekanisme de-duplikasi peringatan dan pemulihan otomatis (*auto-recovery*) saat kondisi metrik kembali berada di bawah ambang batas normal.

---

## Teknologi yang Digunakan

| Lapisan | Teknologi | Versi | Peran dalam Sistem |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | 16.x | Fondasi aplikasi full-stack monolit dan routing server |
| **UI Library** | React | 19.x | Antarmuka pengguna komponen berbasis state |
| **Bahasa** | JavaScript (ESM) | ES2023+ | Kode sumber murni tanpa transpiler TypeScript |
| **Styling** | Tailwind CSS | 4.x | Token styling desain *Warm Minimalist Retail Software* |
| **Database** | PostgreSQL | 14+ | Basis data relasional dengan integritas transaksi ACID |
| **ORM** | Prisma | 6.x | Pemetaan relasional skema, migrasi, dan query database |
| **Autentikasi** | `jose` & `bcryptjs` | Terkini | Penandatanganan JWT sesi dan enkripsi kata sandi |
| **Validasi** | Zod | 3.x | Validasi skema input form dan mutasi data di sisi server |
| **Pemrosesan Gambar** | Sharp | 0.33+ | Kompresi WebP, resize, dan sanitasi berkas foto produk |
| **Pengujian** | Node.js Test Runner | Native | Suite pengujian otomatis (`node:test` dan `node:assert`) |

---

## Arsitektur & Sorotan Engineering

```
┌─────────────────────────────────────────────────────────────────┐
│                       Browser Client                            │
│  (React 19 Server & Client Components / Warm Minimalist UI)     │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / Server Actions
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router                        │
│  ├── Route Guard & Proxy (src/proxy.js)                         │
│  ├── Server Actions (auth, pos, product, inventory, report)     │
│  └── In-Memory IP Rate Limiter (Anti-Brute Force)               │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│       Core Business Lib      │        │          Prisma ORM          │
│  ├── ROP Inventory Algorithm │        │  ├── Connection Pooling      │
│  ├── Greedy Change Making    │        │  ├── Interactive Transaction │
│  ├── Excel-Safe CSV Builder  │        │  └── Managed Migrations      │
│  └── System Health Monitor   │        └──────────────┬───────────────┘
└──────────────────────────────┘                       │
                                                       ▼
                                        ┌──────────────────────────────┐
                                        │    PostgreSQL Database       │
                                        │  ├── ACID Transaction Blocks │
                                        │  ├── Check Constraints       │
                                        │  └── Relational Foreign Keys │
                                        └──────────────────────────────┘
```

1. **Server Actions & Server-Side Security**: Seluruh mutasi data (checkout, restok, CRUD) diproses langsung melalui Next.js Server Actions. Validasi hak akses (RBAC) dijalankan ulang di sisi server pada setiap mutasi, sehingga aksi tidak dapat dipicu secara ilegal meskipun klien memodifikasi state browser.
2. **Transaksi Database Atomik & Integritas Stok**: Pengurangan stok saat kasir menyelesaikan checkout dan penyesuaian stok opname dijalankan dalam blok transaksi Prisma (`$transaction`). Pengurangan stok menggunakan operator atomik database untuk menjamin ketiadaan kondisi pacu (*race conditions*) atau *lost updates* pada beban transaksi simultan.
3. **Snapshot Data Transaksi Historis**: Setiap item dalam transaksi menyimpan snapshot harga beli (`harga_beli_snapshot`), harga jual (`harga_jual_snapshot`), dan nama produk (`nama_produk_snapshot`) pada saat transaksi terjadi. Perubahan harga maupun nama produk di masa depan tidak akan mendistorsi laporan laba kotor masa lalu.
4. **Rekonsiliasi Laba Kotor Proporsional**: Diskon transaksi dialokasikan secara proporsional ke setiap item produk berdasarkan kontribusi nilainya terhadap total belanja. Metode ini mencegah pengurangan diskon ganda dan memastikan laba kotor seluruh produk selalu sama persis dengan laba kotor total toko.
5. **Sanitasi Log & Anti-Kebocoran Data**: Lapisan logging sistem (`src/lib/logger.js`) memiliki mekanisme sensor otomatis terhadap token sesi, kata sandi, dan string koneksi database sebelum disimpan ke tabel `system_health_logs` atau ditampilkan di antarmuka monitoring.
6. **Pemisahan Konfigurasi Lingkungan**: Aplikasi mendukung pemisahan konfigurasi koneksi langsung (*direct*) untuk migrasi Prisma dan koneksi ber-pool (*pooled connection*) untuk lingkungan serverless melalui variabel lingkungan yang terstandarisasi.

---

## Panduan Instalasi Lokal

### 1. Prasyarat Sistem
- **Node.js**: Versi 18.17+ atau 20+
- **PostgreSQL**: Versi 14+ yang sedang berjalan di komputer lokal (port default `5432`)
- **Git**

### 2. Kloning Repository & Instalasi Dependensi
```bash
git clone https://github.com/Ardhaneee/kasirkita.git
cd kasirkita
npm install
```

### 3. Konfigurasi Environment Variables
Salin berkas template lingkungan:
```bash
cp .env.example .env
```

Buka berkas `.env` dan sesuaikan nilainya:
```env
# Koneksi PostgreSQL Lokal
DATABASE_URL="postgresql://username_postgres:password_postgres@localhost:5432/kasirkita?schema=public"
DIRECT_URL="postgresql://username_postgres:password_postgres@localhost:5432/kasirkita?schema=public"

# Kunci Rahasia Sesi JWT (Gunakan string acak minimal 32 karakter)
JWT_SECRET="kunci-rahasia-jwt-kasirkita-minimal-32-karakter-acak"

# Mode Lingkungan
NODE_ENV="development"

# Setel "false" pada instalasi lokal (anti-spoofing header IP)
TRUST_PROXY="false"

# Menampilkan tombol isi cepat di halaman login untuk pengujian
ENABLE_DEMO_FAST_FILL="true"
```

### 4. Migrasi Skema Basis Data
Jalankan migrasi Prisma untuk membuat seluruh tabel dan *check constraints* di PostgreSQL:
```bash
npx prisma migrate dev --name init_schema
```

### 5. Seeding Data Awal (Development)
Jalankan skrip seeder untuk mengisi data inisialisasi (pengaturan toko, akun pengguna, kategori, dan produk awal):
```bash
node prisma/seed.js
```

### 6. Menjalankan Server Development
```bash
npm run dev
```

Buka peramban pada alamat [http://localhost:3000](http://localhost:3000). Sistem akan secara otomatis mengarahkan ke halaman `/login`.

---

## Pengujian Otomatis

Aplikasi dilengkapi dengan rangkaian pengujian otomatis (*automated test suite*) tanpa dependensi testing eksternal yang berat, menggunakan Node.js native test runner:

```bash
# 1. Menjalankan seluruh pengujian unit, bisnis logika, dan transaksi (63 pengujian)
npm test

# 2. Menjalankan pengujian integrasi endpoint HTTP dan rute proteksi RBAC (22 pengujian)
npm run test:http

# 3. Menjalankan pemeriksaan format dan standar kode (ESLint)
npm run lint

# 4. Memverifikasi build produksi Next.js
npm run build
```

Cakupan pengujian otomatis mencakup:
- Enkripsi password bcrypt dan integritas sesi JWT.
- Otorisasi server-side RBAC (hak akses Pemilik vs Kasir).
- Validasi skema Zod (input produk, kategori, restok, dan penyesuaian stok).
- Ketahanan transaksi atomik PostgreSQL dan pencegahan *lost update* stok.
- Akurasi algoritma Reorder Point (ROP) dan kalkulasi pecahan uang Greedy.
- Verifikasi dimensi fisik cetak struk thermal 58mm dan 80mm pada engine Chrome Headless.
- Sanitasi ekspor CSV terhadap CSV Formula Injection (DDE).
- Pengecekan latensi database, metrik memori V8, rate limiter login, dan de-duplikasi alert.

---

## Persiapan Deployment Staging

Arsitektur deployment staging yang dirancang untuk KasirKita:
- **Web Application & API**: [Vercel](https://vercel.com) (Serverless Next.js App Router).
- **Cloud Database**: [Neon](https://neon.tech) (Serverless PostgreSQL dengan Connection Pooling bawaan).

### 1. Build Command pada Vercel
Karena Vercel berjalan pada lingkungan serverless Linux yang bersih, override perintah build pada Project Settings Vercel menjadi:
```bash
npx prisma generate && next build
```

### 2. Environment Variables Staging
Konfigurasikan variabel berikut pada dashboard deployment:
- `DATABASE_URL`: Connection string Neon dengan parameter connection pooling (`-pooler` pada host) dan `?sslmode=require`.
- `DIRECT_URL`: Connection string Neon koneksi langsung (*unpooled*) untuk migrasi skema.
- `JWT_SECRET`: String acak kriptografi aman (minimal 32 karakter).
- `NODE_ENV`: `production`
- `TRUST_PROXY`: `true` (Wajib diaktifkan di balik reverse proxy Vercel agar identifikasi IP rate limiting membaca header terpercaya).
- `ENABLE_DEMO_FAST_FILL`: `true` (Opsional, untuk mempermudah demonstrasi aplikasi).

### 3. Catatan Penyimpanan Berkas pada Lingkungan Serverless
> [!NOTE]
> Pada instalasi lokal, gambar produk disimpan di sistem berkas lokal (`public/uploads/products/`). Pada lingkungan serverless (seperti Vercel), sistem berkas bersifat sementara (*ephemeral*). Untuk implementasi produksi skala besar, penyimpanan gambar direkomendasikan dialihkan ke layanan *Cloud Object Storage* (seperti AWS S3, Cloudflare R2, atau Vercel Blob). Untuk keperluan demonstrasi staging saat ini, aplikasi telah dilengkapi aset gambar statis default.

---

## Struktur Proyek

```
kasirkita/
├── prisma/
│   ├── migrations/                # Riwayat migrasi SQL terkelola
│   ├── schema.prisma              # Definisi skema model & relasi PostgreSQL
│   ├── seed.js                    # Seeder data awal untuk pengembangan lokal
│   └── seed_staging.js            # Seeder data sintetis untuk demonstrasi staging
├── public/
│   └── images/                    # Aset statis & placeholder QRIS
├── scripts/
│   ├── performance_benchmark.mjs  # Skrip pengujian beban & skalabilitas terukur
│   └── setup_qris.js              # Utilitas pemrosesan aset QRIS
├── src/
│   ├── actions/                   # Next.js Server Actions (Mutasi data terproteksi)
│   │   ├── authActions.js         # Autentikasi sesi & proteksi rate limiting
│   │   ├── inventoryActions.js    # Mutasi stok, opname fisik & rekomendasi ROP
│   │   ├── monitoringActions.js   # Pemeriksaan manual kesehatan sistem & alert
│   │   ├── posActions.js          # Pemrosesan transaksi checkout kasir
│   │   ├── productActions.js      # CRUD produk, kategori, & soft delete
│   │   └── reportActions.js       # Kalkulasi laporan omzet & ekspor CSV
│   ├── app/
│   │   ├── (dashboard)/           # Layout terproteksi sesi & RBAC
│   │   │   ├── dashboard/         # Dashboard analitik & ringkasan metrik
│   │   │   ├── laporan/           # Laporan penjualan finansial & ekspor data
│   │   │   ├── monitoring/        # Pemantauan kesehatan sistem, memori & log
│   │   │   ├── pos/               # Antarmuka kasir checkout & cetak struk
│   │   │   ├── produk/            # Katalog produk, filter & manajemen kategori
│   │   │   ├── stok/              # Kartu stok, opname, & rekomendasi restok
│   │   │   └── transaksi/         # Riwayat transaksi belanja & cetak ulang
│   │   ├── login/                 # Halaman login multi-peran
│   │   ├── globals.css            # Styling Warm Minimalist & konfigurasi print
│   │   ├── layout.js              # Root layout aplikasi
│   │   └── page.js                # Halaman pembuka / redirect rute utama
│   ├── lib/                       # Modul logika bisnis & utilitas
│   │   ├── algorithms.js          # Algoritma ROP, safety stock & greedy kembalian
│   │   ├── auth.js                # Verifikasi JWT sesi & penanganan cookie
│   │   ├── csvUtils.js            # Generator CSV kompatibel Excel & anti-formula injection
│   │   ├── dateUtils.js           # Utilitas penanganan zona waktu Asia/Jakarta (WIB)
│   │   ├── db.js                  # Singleton Prisma Client
│   │   ├── imageProcessor.js      # Pemrosesan gambar Sharp & kompresi WebP
│   │   ├── logger.js              # Pencatatan log terstruktur & manajemen peringatan
│   │   ├── monitoring.js          # Pengukuran metrik runtime Node.js & latensi DB
│   │   ├── rateLimiter.js         # Sliding-window rate limiter & resolusi IP
│   │   ├── utils.js               # Format mata uang Rupiah & helper umum
│   │   └── validations.js         # Skema validasi Zod
│   └── proxy.js                   # Middleware Next.js (Guard rute & otorisasi RBAC)
├── tests/                         # Suite pengujian otomatis
│   ├── auth.test.js               # Pengujian autentikasi, token JWT & RBAC
│   ├── integration_http.js        # Pengujian integrasi endpoint HTTP
│   ├── inventory.test.js          # Pengujian kartu stok, ROP & transaksi atomik
│   ├── monitoring.test.js         # Pengujian health check, sanitasi log & rate limiter
│   ├── pos.test.js                # Pengujian POS checkout, diskon & idempotensi
│   ├── product.test.js            # Pengujian CRUD produk, validasi Zod & Sharp
│   ├── receipt_print.test.js      # Pengujian dimensi fisik struk thermal 58mm/80mm
│   └── report.test.js             # Pengujian agregasi laporan & format CSV Excel
├── .env.example                   # Template variabel lingkungan aman
├── package.json                   # Konfigurasi dependensi proyek
└── README.md                      # Dokumentasi proyek
```

---

## Tangkapan Layar

Berikut dokumentasi antarmuka pengguna KasirKita:

| Modul | Deskripsi Tampilan |
| :--- | :--- |
| **Kasir (POS)** | Antarmuka kasir cepat dengan input barcode, perhitungan kembalian uang pecahan Greedy, dan pilihan cetak struk thermal 58mm/80mm. |
| **Dashboard Pemilik** | Ringkasan omzet, laba kotor, performa metode pembayaran, serta produk terlaris. |
| **Kartu Stok & ROP** | Buku mutasi stok berkelanjutan dan tabel rekomendasi restok dengan status urgensi persediaan. |
| **Laporan & Ekspor** | Laporan penjualan berkala dengan tombol ekspor CSV yang kompatibel langsung dengan Microsoft Excel. |
| **Monitoring Sistem** | Pemantauan latensi basis data real-time, penggunaan RAM proses, dan log peringatan sistem. |

*(Tangkapan layar antarmuka dapat dilihat secara langsung melalui demonstrasi aplikasi atau folder dokumentasi).*

---

## Author

**Raihan Nauval Ardhana**  
Software Engineering Portfolio Project.

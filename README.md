# KasirKita

Aplikasi Sistem Kasir (Point of Sale) dan Manajemen Stok untuk UMKM retail berbasis web. Dibangun menggunakan arsitektur modern yang ringan, andal, dan modular.

Proyek ini dirancang untuk memenuhi standar pembuktian portofolio **22 Unit Kompetensi BNSP Level KKNI 6** (Rekayasa Perangkat Lunak).

---

## 🛠️ Tech Stack Fondasi

- **Framework**: Next.js 16 (App Router)
- **Bahasa**: JavaScript murni (ESM, tanpa TypeScript)
- **UI & Styling**: React 19, Tailwind CSS v4 (Desain: *Warm Minimalist Retail Software*)
- **Database**: PostgreSQL lokal
- **ORM & Migrations**: Prisma ORM v6
- **Enkripsi Kredensial**: bcryptjs

---

## 🚀 Panduan Menjalankan Aplikasi (Lokal)

### 1. Prasyarat Sistem
- Node.js versi 18+ (direkomendasikan v20+)
- PostgreSQL lokal (berjalan pada port `5432`)

### 2. Konfigurasi Database
Salin berkas `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Sesuaikan nilai `DATABASE_URL` dengan username dan password PostgreSQL lokal Anda:
```env
DATABASE_URL="postgresql://postgres:PASSWORD_ANDA@localhost:5432/kasirkita?schema=public"
```

### 3. Migrasi Database & Seeding Data Awal
Jalankan migrasi skema dan seeder data awal:
```bash
# Menjalankan migrasi skema tabel dan check constraints
npx prisma migrate dev --name init_schema

# Menjalankan seeder data awal (akun demo, kategori, produk UMKM)
node prisma/seed.js
```

### 4. Menjalankan Server Development
```bash
npm run dev
```
Buka browser pada alamat [http://localhost:3000](http://localhost:3000).

---

## 👤 Akun Pengujian Default (Demo)

| Role | Username | Password | Hak Akses Rute | Target Redirect Login |
| :--- | :--- | :--- | :--- | :--- |
| **Pemilik** | `pemilik` | `pemilik123` | Akses penuh (`/dashboard`, `/pos`, `/produk`, CRUD) | `/dashboard` |
| **Kasir** | `kasir` | `kasir123` | Operasional (`/pos`, `/produk` mode baca saja) | `/pos` |

---

## 🧪 Pengujian Otomatis

Jalankan seluruh rangkaian pengujian otomatis (Autentikasi, RBAC, Validasi Zod, PostgreSQL CRUD, dan Sharp Image Processing):
```bash
npm test
```

Untuk pengujian integrasi endpoint HTTP langsung terhadap Next.js:
```bash
npm run test:http
```

---

## 📁 Struktur Direktori Proyek

```
kasirkita/
├── prisma/
│   ├── migrations/                # Riwayat migrasi SQL terkelola
│   ├── schema.prisma              # Definisi model & skema PostgreSQL
│   └── seed.js                    # Script seeder data awal (idempotent)
├── public/
│   └── uploads/products/          # Direktori penyimpanan lokal foto produk terkompresi
├── src/
│   ├── actions/
│   │   ├── authActions.js         # Server Actions: login & logout tersanitasi
│   │   └── productActions.js      # Server Actions: CRUD Produk, Kategori, & Soft-delete
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── layout.js          # Shell layout terproteksi RBAC & navigasi
│   │   │   ├── dashboard/page.js  # Halaman dashboard (khusus PEMILIK)
│   │   │   ├── pos/page.js        # Halaman kasir POS (PEMILIK & KASIR)
│   │   │   └── produk/
│   │   │       ├── ProductClient.js # Client UI produk, filter, modal, & preview gambar
│   │   │       └── page.js        # Server Component katalog produk
│   │   ├── login/
│   │   │   ├── LoginForm.js       # Client form component (Dev-only demo buttons)
│   │   │   └── page.js            # Server page component (validasi callbackUrl)
│   │   ├── globals.css            # Token desain Warm Minimalist & print CSS
│   │   ├── layout.js              # Root layout aplikasi (Geist fonts)
│   │   └── page.js                # Halaman landing fondasi
│   ├── lib/
│   │   ├── auth.js                # JWT session, cookie handler, & active user check
│   │   ├── db.js                  # Singleton Prisma Client
│   │   ├── imageProcessor.js      # Sharp: kompresi WebP 500x500 & validasi MIME
│   │   ├── utils.js               # Helper finansial & format tanggal
│   │   └── validations.js         # Skema validasi Zod (produk & kategori)
│   └── proxy.js                   # Konvensi Next.js 16 Proxy (Route guard & RBAC)
├── tests/
│   ├── auth.test.js               # 7 Unit test otentikasi & keamanan
│   ├── product.test.js            # 6 Unit & integration test produk, Zod & Sharp
│   └── integration_http.js        # 10 Integrasi test endpoint HTTP & redirect
├── .env.example                   # Template variabel lingkungan
├── package.json                   # Dependensi JavaScript yang ramping
└── README.md
```

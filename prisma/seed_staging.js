/**
 * Skrip Seeding Data Sintetis Staging KasirKita (BNSP Unit 1 & 4).
 *
 * Dirancang khusus untuk deployment staging Vercel + Neon PostgreSQL.
 * Sifat: IDEMPOTEN (Aman dijalankan berulang kali tanpa menghapus atau menduplikasi data).
 *
 * Menghasilkan data realistis:
 * 1. Toko & Pengaturan (StoreSetting)
 * 2. Akun Pemilik & Kasir dengan hash bcrypt aman
 * 3. Kategori & Produk Retail UMKM
 * 4. Kartu Stok & Mutasi Awal (StockMovement)
 * 5. Transaksi Historis 7 Hari Terakhir (Transaction & Items) untuk Dashboard & Laporan
 * 6. Metrik Sistem Awal (SystemMetric & SystemHealthLog)
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("================================================================================");
  console.log(" KASIRKITA — SEEDING DATA SINTETIS STAGING (VERCEL + NEON)");
  console.log("================================================================================\n");

  // GUARD KEAMANAN TARGET DATABASE:
  // Memastikan skrip ini HANYA dapat dijalankan ke Neon Cloud Database (*.neon.tech),
  // dan DITOLAK KERAS jika mencoba berjalan ke database lokal (localhost / 127.0.0.1).
  const targetUrl = process.env.DATABASE_URL || "";
  const isLocalDb = targetUrl.includes("localhost") || targetUrl.includes("127.0.0.1");
  const isNeonDb = targetUrl.includes("neon.tech");

  if (!targetUrl || isLocalDb || !isNeonDb) {
    console.error("================================================================================");
    console.error(" [GUARD KEAMANAN AKTIF] EKSEKUSI SEEDING STAGING DITOLAK!");
    console.error("================================================================================");
    console.error("Skrip prisma/seed_staging.js KHUSUS diperuntukkan bagi Neon Cloud Database.");
    console.error("Terdeteksi target koneksi BUKAN database Neon (*.neon.tech) atau menunjuk ke lokal.");
    console.error("");
    console.error("Untuk menjalankan skrip ini ke Neon secara aman, setel $env:DATABASE_URL:");
    console.error('  $env:DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require"');
    console.error("  node prisma/seed_staging.js");
    console.error("================================================================================\n");
    process.exit(1);
  }

  // 1. Pengaturan Toko
  const storeSetting = await prisma.storeSetting.upsert({
    where: { id: 1 },
    update: {
      nama_toko: "KasirKita Retail UMKM (Staging)",
      alamat: "Jl. Malioboro No. 45, Danurejan, D.I. Yogyakarta",
      no_telepon: "0812-3456-7890",
      pesan_kaki_struk: "Terima kasih telah berbelanja di KasirKita!",
      default_lead_time_days: 3,
      default_safety_stock_percent: 20.0,
    },
    create: {
      id: 1,
      nama_toko: "KasirKita Retail UMKM (Staging)",
      alamat: "Jl. Malioboro No. 45, Danurejan, D.I. Yogyakarta",
      no_telepon: "0812-3456-7890",
      pesan_kaki_struk: "Terima kasih telah berbelanja di KasirKita!",
      default_lead_time_days: 3,
      default_safety_stock_percent: 20.0,
    },
  });
  console.log("✓ Pengaturan toko disiapkan:", storeSetting.nama_toko);

  // 2. Akun Demo Staging (Kredensial dapat dikonfigurasi via env var)
  const saltRounds = 10;
  const pemilikPass = process.env.DEMO_PEMILIK_PASSWORD || "KasirKita2026!Pemilik";
  const kasirPass = process.env.DEMO_KASIR_PASSWORD || "KasirKita2026!Kasir";

  const hashPemilik = bcrypt.hashSync(pemilikPass, saltRounds);
  const hashKasir = bcrypt.hashSync(kasirPass, saltRounds);

  const pemilik = await prisma.user.upsert({
    where: { username: "pemilik" },
    update: {
      nama: "H. Rahmat Hidayat (Pemilik)",
      password_hash: hashPemilik,
      role: "PEMILIK",
      status_aktif: true,
    },
    create: {
      nama: "H. Rahmat Hidayat (Pemilik)",
      username: "pemilik",
      password_hash: hashPemilik,
      role: "PEMILIK",
      status_aktif: true,
    },
  });

  const kasir = await prisma.user.upsert({
    where: { username: "kasir" },
    update: {
      nama: "Siti Aminah (Kasir)",
      password_hash: hashKasir,
      role: "KASIR",
      status_aktif: true,
    },
    create: {
      nama: "Siti Aminah (Kasir)",
      username: "kasir",
      password_hash: hashKasir,
      role: "KASIR",
      status_aktif: true,
    },
  });
  console.log(`✓ Akun pengguna disiapkan: ${pemilik.username} (${pemilik.role}), ${kasir.username} (${kasir.role})`);

  // 3. Kategori Produk
  const categoriesList = [
    { nama: "Sembako", deskripsi: "Bahan pokok sembilan kebutuhan rumah tangga" },
    { nama: "Makanan", deskripsi: "Makanan ringan, biskuit, dan mie instan" },
    { nama: "Minuman", deskripsi: "Minuman kemasan, kopi, teh, dan air mineral" },
    { nama: "Kebutuhan Rumah", deskripsi: "Sabun, deterjen, dan perlengkapan kebersihan" },
  ];

  const catMap = {};
  for (const cat of categoriesList) {
    const record = await prisma.category.upsert({
      where: { nama: cat.nama },
      update: { deskripsi: cat.deskripsi },
      create: cat,
    });
    catMap[cat.nama] = record.id;
  }
  console.log("✓ Kategori disiapkan:", Object.keys(catMap).join(", "));

  // 4. Produk Ritel UMKM Realistis
  const productsList = [
    {
      barcode: "8992741912014",
      nama_produk: "Minyak Goreng 2L Pouch",
      category_id: catMap["Sembako"],
      harga_beli: 30000,
      harga_jual: 34000,
      stok: 24,
      stok_minimum: 8,
      lead_time_hari: 3,
      safety_stock: 2,
      satuan: "pouch",
    },
    {
      barcode: "8991001200055",
      nama_produk: "Beras Premium Ramos 5kg",
      category_id: catMap["Sembako"],
      harga_beli: 65000,
      harga_jual: 72000,
      stok: 15,
      stok_minimum: 6,
      lead_time_hari: 4,
      safety_stock: 2,
      satuan: "sak",
    },
    {
      barcode: "8998009010012",
      nama_produk: "Gula Pasir Kristal 1kg",
      category_id: catMap["Sembako"],
      harga_beli: 15000,
      harga_jual: 17500,
      stok: 30,
      stok_minimum: 10,
      lead_time_hari: 2,
      safety_stock: 2,
      satuan: "bungkus",
    },
    {
      barcode: "8991002105421",
      nama_produk: "Kopi Bubuk Robusta 100g",
      category_id: catMap["Minuman"],
      harga_beli: 11500,
      harga_jual: 14000,
      stok: 18,
      stok_minimum: 5,
      lead_time_hari: 3,
      safety_stock: 1,
      satuan: "bungkus",
    },
    {
      barcode: "8992745100021",
      nama_produk: "Teh Celup Melati Kotak 25s",
      category_id: catMap["Minuman"],
      harga_beli: 6800,
      harga_jual: 8500,
      stok: 12,
      stok_minimum: 5,
      lead_time_hari: 2,
      safety_stock: 1,
      satuan: "kotak",
    },
    {
      barcode: "8999999001011",
      nama_produk: "Air Mineral Botol 600ml",
      category_id: catMap["Minuman"],
      harga_beli: 2800,
      harga_jual: 3500,
      stok: 48,
      stok_minimum: 15,
      lead_time_hari: 2,
      safety_stock: 3,
      satuan: "botol",
    },
    {
      barcode: "8992388111029",
      nama_produk: "Mie Goreng Spesial 85g",
      category_id: catMap["Makanan"],
      harga_beli: 2700,
      harga_jual: 3200,
      stok: 72,
      stok_minimum: 20,
      lead_time_hari: 3,
      safety_stock: 4,
      satuan: "bungkus",
    },
    {
      barcode: "8991389222019",
      nama_produk: "Deterjen Bubuk Konsentrat 800g",
      category_id: catMap["Kebutuhan Rumah"],
      harga_beli: 18000,
      harga_jual: 21500,
      stok: 14,
      stok_minimum: 5,
      lead_time_hari: 3,
      safety_stock: 1,
      satuan: "bungkus",
    },
    {
      barcode: "8991234567890",
      nama_produk: "Sabun Cuci Piring Jeruk Nipis 750ml",
      category_id: catMap["Kebutuhan Rumah"],
      harga_beli: 13500,
      harga_jual: 16000,
      stok: 16,
      stok_minimum: 5,
      lead_time_hari: 3,
      safety_stock: 1,
      satuan: "pouch",
    },
    {
      barcode: "8993456789012",
      nama_produk: "Susu UHT Cokelat 200ml",
      category_id: catMap["Minuman"],
      harga_beli: 4500,
      harga_jual: 5500,
      stok: 36,
      stok_minimum: 10,
      lead_time_hari: 2,
      safety_stock: 2,
      satuan: "kotak",
    },
  ];

  const prodMap = {};
  for (const prod of productsList) {
    const record = await prisma.product.upsert({
      where: { barcode: prod.barcode },
      update: {
        nama_produk: prod.nama_produk,
        harga_beli: prod.harga_beli,
        harga_jual: prod.harga_jual,
        stok: prod.stok,
        stok_minimum: prod.stok_minimum,
        lead_time_hari: prod.lead_time_hari,
        safety_stock: prod.safety_stock,
        satuan: prod.satuan,
      },
      create: {
        ...prod,
        status_aktif: true,
      },
    });
    prodMap[prod.barcode] = record;

    // Catat mutasi awal saldo stok fisik jika belum tercatat
    const existingMovement = await prisma.stockMovement.findFirst({
      where: { product_id: record.id, tipe_mutasi: "MASUK" },
    });

    if (!existingMovement) {
      await prisma.stockMovement.create({
        data: {
          product_id: record.id,
          user_id: pemilik.id,
          tipe_mutasi: "MASUK",
          jumlah: prod.stok,
          stok_awal: 0,
          stok_akhir: prod.stok,
          referensi_nomor: "STG-INIT-STOCK",
          keterangan: "Saldo stok awal inisialisasi staging",
        },
      });
    }
  }
  console.log(`✓ ${productsList.length} Produk ritel dan kartu stok awal disiapkan.`);

  // 5. Transaksi Historis Sintetis (7 Hari Terakhir untuk Dashboard & Laporan)
  const now = new Date();
  const sampleTransactions = [
    {
      invoice: "INV-STG-20261110-001",
      daysAgo: 6,
      metode: "TUNAI",
      diskon: 0,
      bayar: 100000,
      items: [
        { barcode: "8991001200055", qty: 1 }, // Beras 72000
        { barcode: "8998009010012", qty: 1 }, // Gula 17500
      ],
    },
    {
      invoice: "INV-STG-20261112-002",
      daysAgo: 4,
      metode: "QRIS",
      diskon: 2000,
      bayar: 70000,
      items: [
        { barcode: "8992741912014", qty: 2 }, // Minyak 2x 34000 = 68000
        { barcode: "8999999001011", qty: 1 }, // Air 3500
      ],
    },
    {
      invoice: "INV-STG-20261114-003",
      daysAgo: 2,
      metode: "TUNAI",
      diskon: 0,
      bayar: 50000,
      items: [
        { barcode: "8991002105421", qty: 2 }, // Kopi 2x 14000 = 28000
        { barcode: "8992388111029", qty: 5 }, // Mie 5x 3200 = 16000
      ],
    },
    {
      invoice: "INV-STG-20261115-004",
      daysAgo: 1,
      metode: "QRIS",
      diskon: 5000,
      bayar: 85000,
      items: [
        { barcode: "8991389222019", qty: 2 }, // Deterjen 2x 21500 = 43000
        { barcode: "8991234567890", qty: 2 }, // Sabun Cuci 2x 16000 = 32000
        { barcode: "8993456789012", qty: 3 }, // Susu 3x 5500 = 16500
      ],
    },
    {
      invoice: "INV-STG-20261116-005",
      daysAgo: 0,
      metode: "TUNAI",
      diskon: 0,
      bayar: 50000,
      items: [
        { barcode: "8992741912014", qty: 1 }, // Minyak 34000
        { barcode: "8992745100021", qty: 1 }, // Teh 8500
      ],
    },
  ];

  for (const trx of sampleTransactions) {
    const existingTrx = await prisma.transaction.findUnique({
      where: { invoice_number: trx.invoice },
    });

    if (!existingTrx) {
      const trxDate = new Date(now.getTime() - trx.daysAgo * 24 * 60 * 60 * 1000);
      let subtotal = 0;
      let totalItems = 0;
      const itemsPayload = [];

      for (const item of trx.items) {
        const prod = prodMap[item.barcode];
        const lineTotal = Number(prod.harga_jual) * item.qty;
        subtotal += lineTotal;
        totalItems += item.qty;
        itemsPayload.push({
          product_id: prod.id,
          nama_produk_snapshot: prod.nama_produk,
          harga_beli_snapshot: prod.harga_beli,
          harga_jual_snapshot: prod.harga_jual,
          kuantitas: item.qty,
          subtotal: lineTotal,
        });
      }

      const totalBelanja = Math.max(0, subtotal - trx.diskon);
      const kembalian = Math.max(0, trx.bayar - totalBelanja);

      await prisma.transaction.create({
        data: {
          invoice_number: trx.invoice,
          idempotency_key: `IDEMP-${trx.invoice}`,
          user_id: kasir.id,
          tanggal_transaksi: trxDate,
          total_item: totalItems,
          subtotal: subtotal,
          discount_amount: trx.diskon,
          total_belanja: totalBelanja,
          nominal_bayar: trx.bayar,
          kembalian: kembalian,
          metode_pembayaran: trx.metode,
          status_pembayaran: "SELESAI",
          catatan: "Transaksi simulasi demonstrasi staging",
          items: {
            create: itemsPayload,
          },
        },
      });
    }
  }
  console.log(`✓ ${sampleTransactions.length} Transaksi penjualan historis disiapkan untuk Dashboard & Laporan.`);

  // 6. Catatan Inisialisasi Sistem (SystemHealthLog)
  const existingLog = await prisma.systemHealthLog.findFirst({
    where: { event_type: "STAGING_INITIALIZATION" },
  });

  if (!existingLog) {
    await prisma.systemHealthLog.create({
      data: {
        event_type: "STAGING_INITIALIZATION",
        status_code: 200,
        message: "Inisialisasi basis data staging KasirKita pada Neon PostgreSQL berhasil diselesaikan.",
        details_json: JSON.stringify({
          severity: "INFO",
          module: "SYSTEM",
          operation: "seed_staging",
          isAlert: false,
          resolved: true,
          resolved_at: new Date().toISOString(),
          environment: "staging",
        }),
      },
    });
  }
  console.log("✓ Log inisialisasi kesehatan sistem disiapkan.");

  console.log("\n================================================================================");
  console.log(" SEEDING STAGING SELESAI DENGAN SUKSES!");
  console.log("================================================================================");
  console.log("Catatan Kredensial Akun Staging:");
  console.log(`- Pemilik : pemilik / ${pemilikPass}`);
  console.log(`- Kasir   : kasir / ${kasirPass}`);
  console.log("================================================================================\n");
}

main()
  .catch((e) => {
    console.error("Kesalahan seeding staging:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

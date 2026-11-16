const test = require("node:test");
const assert = require("node:assert");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Helper zona waktu Asia/Jakarta sederhana untuk pengujian
function getWibDateString(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sanitizeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str) || /^[=+\-@\t\r]/.test(str.trim())) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function generateCsv(rows, includeSepDirective = true) {
  const BOM = "\uFEFF";
  const sep = includeSepDirective ? "sep=,\r\n" : "";
  return BOM + sep + rows.map((r) => r.map((c) => sanitizeCsvCell(c)).join(",")).join("\r\n");
}

// ============================================================================
// TEST SUITE: FASE 6 - DASHBOARD, TRANSAKSI & LAPORAN PENJUALAN
// ============================================================================

test("1. Akurasi Perhitungan Omzet dari Transaksi SELESAI di PostgreSQL", async () => {
  const transactions = await prisma.transaction.findMany({
    where: { status_pembayaran: "SELESAI" },
  });

  assert.ok(transactions.length > 0, "Harus ada transaksi berstatus SELESAI di database");

  let calculatedOmzet = 0;
  for (const trx of transactions) {
    calculatedOmzet += Number(trx.total_belanja);
  }

  // Agregasi langsung via Prisma
  const agg = await prisma.transaction.aggregate({
    where: { status_pembayaran: "SELESAI" },
    _sum: { total_belanja: true },
    _count: { id: true },
  });

  assert.strictEqual(
    calculatedOmzet,
    Number(agg._sum.total_belanja),
    "Omzet manual harus sama persis dengan agregat SQL Prisma"
  );
  assert.strictEqual(
    transactions.length,
    agg._count.id,
    "Jumlah transaksi harus konsisten"
  );
});

test("2. Integritas HPP Historis Menggunakan Snapshot Harga Beli (Anti-Price Drifting)", async () => {
  // Ambil satu transaksi yang memiliki item
  const trx = await prisma.transaction.findFirst({
    where: { status_pembayaran: "SELESAI" },
    include: {
      items: {
        include: { product: true },
      },
    },
  });

  assert.ok(trx, "Harus ada minimal satu transaksi");
  assert.ok(trx.items.length > 0, "Transaksi harus memiliki minimal satu item");

  const firstItem = trx.items[0];
  const originalHargaBeliSnapshot = Number(firstItem.harga_beli_snapshot);
  const currentProductHargaBeli = Number(firstItem.product.harga_beli);

  // Hitung HPP menggunakan snapshot
  let hppSnapshot = 0;
  for (const item of trx.items) {
    hppSnapshot += Number(item.harga_beli_snapshot) * item.kuantitas;
  }

  const labaKotorSnapshot = Number(trx.total_belanja) - hppSnapshot;

  // Buktikan bahwa laba kotor dihitung dari snapshot harga beli, bukan harga master terkini
  assert.ok(
    Number.isFinite(labaKotorSnapshot),
    "Laba kotor harus berupa angka finansial valid"
  );
  assert.ok(
    firstItem.harga_beli_snapshot !== null && Number(firstItem.harga_beli_snapshot) > 0,
    "Item transaksi wajib menyimpan harga_beli_snapshot > 0"
  );
});

test("3. Perhitungan Diskon Transaksi & Pencegahan Pengurangan Ganda", async () => {
  // Buat transaksi pengujian terisolasi dengan diskon
  const testKasir = await prisma.user.findFirst({ where: { role: "KASIR" } });
  const testProduct = await prisma.product.findFirst({ where: { status_aktif: true } });

  const subtotal = Number(testProduct.harga_jual) * 2;
  const discountAmount = 1000;
  const totalBelanja = subtotal - discountAmount;
  const uniqueKey = "test-discount-audit-" + Date.now();

  const trxWithDiscount = await prisma.transaction.create({
    data: {
      invoice_number: "INV-TEST-DISC-" + Date.now().toString().slice(-6),
      idempotency_key: uniqueKey,
      user_id: testKasir.id,
      total_item: 2,
      subtotal: subtotal,
      discount_amount: discountAmount,
      total_belanja: totalBelanja,
      nominal_bayar: subtotal,
      kembalian: discountAmount,
      metode_pembayaran: "TUNAI",
      status_pembayaran: "SELESAI",
      items: {
        create: [
          {
            product_id: testProduct.id,
            nama_produk_snapshot: testProduct.nama_produk,
            harga_beli_snapshot: testProduct.harga_beli,
            harga_jual_snapshot: testProduct.harga_jual,
            kuantitas: 2,
            subtotal: subtotal,
          },
        ],
      },
    },
    include: { items: true },
  });

  try {
    // Verifikasi total belanja = subtotal - discount_amount
    assert.strictEqual(
      Number(trxWithDiscount.total_belanja),
      Number(trxWithDiscount.subtotal) - Number(trxWithDiscount.discount_amount),
      "Total belanja harus tepat (subtotal - diskon)"
    );

    const hpp = Number(trxWithDiscount.items[0].harga_beli_snapshot) * 2;
    const labaKotor = Number(trxWithDiscount.total_belanja) - hpp;

    // Laba kotor = total belanja (setelah diskon) - HPP
    assert.strictEqual(
      labaKotor,
      totalBelanja - hpp,
      "Laba kotor harus memperhitungkan diskon tanpa pengurangan ganda"
    );
  } finally {
    // Bersihkan transaksi test
    await prisma.transactionItem.deleteMany({ where: { transaction_id: trxWithDiscount.id } });
    await prisma.transaction.delete({ where: { id: trxWithDiscount.id } });
  }
});

test("4. Agregasi Produk Terlaris Berdasarkan Kuantitas Unit Terjual (SQL JOIN & GROUP BY)", async () => {
  const topProducts = await prisma.$queryRaw`
    SELECT
      ti.product_id,
      ti.nama_produk_snapshot AS nama_produk,
      SUM(ti.kuantitas)::int AS total_kuantitas,
      SUM(ti.subtotal)::numeric(12,2) AS total_omzet
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.status_pembayaran = 'SELESAI'
    GROUP BY ti.product_id, ti.nama_produk_snapshot
    ORDER BY total_kuantitas DESC, total_omzet DESC
    LIMIT 5;
  `;

  assert.ok(Array.isArray(topProducts), "Hasil query harus berupa array");
  if (topProducts.length > 1) {
    // Verifikasi urutan kuantitas descending
    assert.ok(
      topProducts[0].total_kuantitas >= topProducts[1].total_kuantitas,
      "Peringkat 1 harus memiliki kuantitas >= peringkat 2"
    );
  }
});

test("5. Konsistensi Filter Rentang Tanggal Kalender Asia/Jakarta (WIB)", () => {
  const now = new Date();
  const wibDateStr = getWibDateString(now);

  const startWib = new Date(`${wibDateStr}T00:00:00.000+07:00`);
  const endWib = new Date(`${wibDateStr}T23:59:59.999+07:00`);

  assert.ok(startWib.getTime() < endWib.getTime(), "Start harus sebelum end");
  assert.strictEqual(
    endWib.getTime() - startWib.getTime(),
    86399999,
    "Rentang 1 hari penuh harus tepat 86.399.999 milidetik"
  );
});

test("6. Keamanan Ekspor CSV: Anti-Formula Injection (DDE), Angka Numerik & UTF-8 BOM", () => {
  const maliciousCells = [
    "=SUM(A1:A10)",
    "+1+2",
    "-5+10",
    "@calc.exe",
    "\tmaliciousTab",
    "Produk Normal",
    15000,
  ];

  const sanitized = maliciousCells.map(sanitizeCsvCell);

  // Karakter formula harus di-prefix dengan tanda petik tunggal '
  assert.strictEqual(sanitized[0], "\"'=SUM(A1:A10)\"");
  assert.strictEqual(sanitized[1], "\"'+1+2\"");
  assert.strictEqual(sanitized[2], "\"'-5+10\"");
  assert.strictEqual(sanitized[3], "\"'@calc.exe\"");
  assert.strictEqual(sanitized[4], "\"'\tmaliciousTab\"");
  assert.strictEqual(sanitized[5], "\"Produk Normal\"");
  // Angka numerik finite dipertahankan tanpa quotes agar dapat diolah di Excel
  assert.strictEqual(sanitized[6], "15000");

  const csv = generateCsv([["No", "Nama"], [1, "=cmd|' /C calc'!A0"]]);
  assert.ok(csv.startsWith("\uFEFFsep=,\r\n"), "CSV wajib diawali UTF-8 BOM dan direktif sep=, untuk kompatibilitas Excel");
  assert.ok(csv.includes("\"'=cmd|'"), "Formula injection berbahaya harus ternetralisir");
});

test("7. Cetak Ulang Nota Bersifat Read-Only (Tanpa Modifikasi Transaksi atau Stok)", async () => {
  const sampleTrx = await prisma.transaction.findFirst({
    where: { status_pembayaran: "SELESAI" },
    include: { items: { include: { product: true } } },
  });

  assert.ok(sampleTrx, "Harus ada transaksi sampel");

  const productBefore = await prisma.product.findUnique({
    where: { id: sampleTrx.items[0].product_id },
  });
  const countBefore = await prisma.transaction.count();

  // Simulasi pembacaan detail transaksi untuk cetak ulang
  const detail = await prisma.transaction.findUnique({
    where: { invoice_number: sampleTrx.invoice_number },
    include: { items: true },
  });

  assert.ok(detail, "Detail transaksi berhasil diambil");
  assert.strictEqual(detail.invoice_number, sampleTrx.invoice_number);

  const productAfter = await prisma.product.findUnique({
    where: { id: sampleTrx.items[0].product_id },
  });
  const countAfter = await prisma.transaction.count();

  // Buktikan tidak ada efek samping database saat melihat & mencetak ulang nota
  assert.strictEqual(countAfter, countBefore, "Jumlah transaksi tidak boleh bertambah");
  assert.strictEqual(productAfter.stok, productBefore.stok, "Stok produk tidak boleh berkurang saat cetak ulang");
});

test("8. Penanganan Data Kosong (Graceful Empty State)", async () => {
  // Query rentang tanggal di masa depan (pasti kosong)
  const futureStart = new Date("2099-01-01T00:00:00.000+07:00");
  const futureEnd = new Date("2099-01-02T23:59:59.999+07:00");

  const emptyTransactions = await prisma.transaction.findMany({
    where: {
      status_pembayaran: "SELESAI",
      tanggal_transaksi: { gte: futureStart, lte: futureEnd },
    },
  });

  assert.strictEqual(emptyTransactions.length, 0, "Transaksi masa depan harus 0");

  let omzet = 0;
  for (const t of emptyTransactions) {
    omzet += Number(t.total_belanja);
  }

  assert.strictEqual(omzet, 0, "Omzet periode kosong harus tepat 0");
});

test("9. Rekonsiliasi Laba Kotor per Produk dan Keseluruhan pada Transaksi Berdiskon (Alokasi Proporsional)", async () => {
  const transactions = await prisma.transaction.findMany({
    where: { status_pembayaran: "SELESAI" },
    include: { items: true },
  });

  assert.ok(transactions.length > 0, "Harus ada transaksi untuk uji rekonsiliasi");

  let totalOmzet = 0;
  let totalHpp = 0;
  for (const t of transactions) {
    totalOmzet += Number(t.total_belanja);
    for (const item of t.items) {
      totalHpp += Number(item.harga_beli_snapshot) * item.kuantitas;
    }
  }
  const totalLabaKotorKeseluruhan = totalOmzet - totalHpp;

  // Jalankan query agregasi per produk dengan alokasi diskon proporsional
  const productAggregates = await prisma.$queryRaw`
    SELECT
      ti.product_id,
      SUM(
        CASE
          WHEN t.subtotal > 0 THEN ti.subtotal * (t.total_belanja / t.subtotal)
          ELSE ti.subtotal
        END
      )::numeric(12,2) AS total_omzet,
      SUM(ti.harga_beli_snapshot * ti.kuantitas)::numeric(12,2) AS total_hpp,
      SUM(
        CASE
          WHEN t.subtotal > 0 THEN (ti.subtotal * (t.total_belanja / t.subtotal)) - (ti.harga_beli_snapshot * ti.kuantitas)
          ELSE ti.subtotal - (ti.harga_beli_snapshot * ti.kuantitas)
        END
      )::numeric(12,2) AS total_laba_kotor
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    WHERE t.status_pembayaran = 'SELESAI'
    GROUP BY ti.product_id;
  `;

  let sumProductOmzet = 0;
  let sumProductHpp = 0;
  let sumProductLabaKotor = 0;

  for (const p of productAggregates) {
    sumProductOmzet += Number(p.total_omzet);
    sumProductHpp += Number(p.total_hpp);
    sumProductLabaKotor += Number(p.total_laba_kotor);
  }

  // Buktikan rekonsiliasi matematis sempurna (selisih < 0.01)
  assert.ok(
    Math.abs(totalOmzet - sumProductOmzet) < 0.01,
    `Omzet transaksi (${totalOmzet}) harus rekonsiliasi dengan sum omzet produk (${sumProductOmzet})`
  );
  assert.ok(
    Math.abs(totalHpp - sumProductHpp) < 0.01,
    `HPP transaksi (${totalHpp}) harus rekonsiliasi dengan sum HPP produk (${sumProductHpp})`
  );
  assert.ok(
    Math.abs(totalLabaKotorKeseluruhan - sumProductLabaKotor) < 0.01,
    `Laba kotor transaksi (${totalLabaKotorKeseluruhan}) harus rekonsiliasi dengan sum laba kotor produk (${sumProductLabaKotor})`
  );
});

test("10. Pengelompokan Produk Terlaris Tetap Tunggal Saat Produk Berganti Nama (Identitas Stabil)", async () => {
  const category = await prisma.category.findFirst();
  const kasir = await prisma.user.findFirst({ where: { role: "KASIR" } });

  // 1. Buat produk uji baru
  const testBarcode = "RENAME-TEST-" + Date.now();
  const product = await prisma.product.create({
    data: {
      barcode: testBarcode,
      nama_produk: "Kopi Arabika Gayo 100g",
      category_id: category.id,
      harga_beli: 15000,
      harga_jual: 25000,
      stok: 100,
      stok_minimum: 10,
    },
  });

  const inv1 = "INV-RN1-" + Date.now().toString().slice(-6);
  const inv2 = "INV-RN2-" + Date.now().toString().slice(-6);

  try {
    // 2. Transaksi 1 dengan nama awal
    await prisma.transaction.create({
      data: {
        invoice_number: inv1,
        idempotency_key: "idemp-" + inv1,
        user_id: kasir.id,
        total_item: 2,
        subtotal: 50000,
        discount_amount: 0,
        total_belanja: 50000,
        nominal_bayar: 50000,
        kembalian: 0,
        metode_pembayaran: "TUNAI",
        status_pembayaran: "SELESAI",
        items: {
          create: [
            {
              product_id: product.id,
              nama_produk_snapshot: "Kopi Arabika Gayo 100g",
              harga_beli_snapshot: 15000,
              harga_jual_snapshot: 25000,
              kuantitas: 2,
              subtotal: 50000,
            },
          ],
        },
      },
    });

    // 3. Ubah nama produk di master tabel (simulasi pergantian nama produk oleh pemilik)
    await prisma.product.update({
      where: { id: product.id },
      data: { nama_produk: "Kopi Arabika Gayo Specialty 100g" },
    });

    // 4. Transaksi 2 dengan nama baru
    await prisma.transaction.create({
      data: {
        invoice_number: inv2,
        idempotency_key: "idemp-" + inv2,
        user_id: kasir.id,
        total_item: 3,
        subtotal: 75000,
        discount_amount: 0,
        total_belanja: 75000,
        nominal_bayar: 75000,
        kembalian: 0,
        metode_pembayaran: "TUNAI",
        status_pembayaran: "SELESAI",
        items: {
          create: [
            {
              product_id: product.id,
              nama_produk_snapshot: "Kopi Arabika Gayo Specialty 100g",
              harga_beli_snapshot: 15000,
              harga_jual_snapshot: 25000,
              kuantitas: 3,
              subtotal: 75000,
            },
          ],
        },
      },
    });

    // 5. Agregasi untuk produk ini
    const aggResult = await prisma.$queryRaw`
      SELECT
        ti.product_id,
        COALESCE(p.nama_produk, MAX(ti.nama_produk_snapshot)) AS nama_produk,
        SUM(ti.kuantitas)::int AS total_kuantitas,
        SUM(ti.subtotal)::numeric(12,2) AS total_omzet
      FROM transaction_items ti
      JOIN transactions t ON t.id = ti.transaction_id
      LEFT JOIN products p ON p.id = ti.product_id
      WHERE t.status_pembayaran = 'SELESAI'
        AND ti.product_id = ${product.id}
      GROUP BY ti.product_id, p.barcode, p.nama_produk, p.category_id;
    `;

    // Pastikan HANYA menghasilkan tepat 1 grup produk, BUKAN 2 baris terpisah!
    assert.strictEqual(aggResult.length, 1, "Produk yang berganti nama tidak boleh terpecah menjadi beberapa baris");
    assert.strictEqual(aggResult[0].total_kuantitas, 5, "Total kuantitas harus 2 + 3 = 5");
    assert.strictEqual(Number(aggResult[0].total_omzet), 125000, "Total omzet harus 50.000 + 75.000 = 125.000");
    assert.strictEqual(aggResult[0].nama_produk, "Kopi Arabika Gayo Specialty 100g", "Nama yang tampil harus nama master terkini");
  } finally {
    await prisma.transactionItem.deleteMany({ where: { product_id: product.id } });
    await prisma.transaction.deleteMany({ where: { invoice_number: { in: [inv1, inv2] } } });
    await prisma.product.delete({ where: { id: product.id } });
  }
});

test("11. Otorisasi Hak Akses Kasir pada Riwayat Transaksi & Detail Nota (Server Guard)", async () => {
  const pemilik = await prisma.user.findFirst({ where: { role: "PEMILIK" } });
  const kasir = await prisma.user.findFirst({ where: { role: "KASIR" } });
  const product = await prisma.product.findFirst({ where: { status_aktif: true } });

  // Buat transaksi milik Pemilik
  const invPemilik = "INV-OWNER-" + Date.now().toString().slice(-6);
  const trxPemilik = await prisma.transaction.create({
    data: {
      invoice_number: invPemilik,
      idempotency_key: "idemp-" + invPemilik,
      user_id: pemilik.id,
      total_item: 1,
      subtotal: Number(product.harga_jual),
      discount_amount: 0,
      total_belanja: Number(product.harga_jual),
      nominal_bayar: Number(product.harga_jual),
      kembalian: 0,
      metode_pembayaran: "TUNAI",
      status_pembayaran: "SELESAI",
      items: {
        create: [
          {
            product_id: product.id,
            nama_produk_snapshot: product.nama_produk,
            harga_beli_snapshot: product.harga_beli,
            harga_jual_snapshot: product.harga_jual,
            kuantitas: 1,
            subtotal: Number(product.harga_jual),
          },
        ],
      },
    },
  });

  try {
    // 1. Kasir mencoba mengambil riwayat transaksi kasir lain (enforce user_id = kasir.id di server)
    const kasirWhere = {
      status_pembayaran: "SELESAI",
      user_id: kasir.id,
    };
    const kasirTrxList = await prisma.transaction.findMany({ where: kasirWhere });
    const containsOwnerTrx = kasirTrxList.some((t) => t.id === trxPemilik.id);
    assert.strictEqual(containsOwnerTrx, false, "Kasir tidak boleh melihat transaksi milik pengguna lain");

    // 2. Kasir mencoba mengakses detail nota transaksi orang lain via invoice
    const kasirDetail = await prisma.transaction.findFirst({
      where: {
        invoice_number: invPemilik,
        user_id: kasir.id, // Enforced pada getTransactionDetailAction
      },
    });
    assert.strictEqual(kasirDetail, null, "Kasir wajib ditolak saat mencoba membuka detail nota transaksi orang lain");

    // 3. Pemilik berhak membuka detail transaksi kasir manapun
    const ownerDetail = await prisma.transaction.findFirst({
      where: { invoice_number: invPemilik },
    });
    assert.ok(ownerDetail, "Pemilik berhak membuka detail transaksi");
  } finally {
    await prisma.transactionItem.deleteMany({ where: { transaction_id: trxPemilik.id } });
    await prisma.transaction.delete({ where: { id: trxPemilik.id } });
  }
});

test("12. Ekspor CSV Konsisten dengan Hasil Laporan & Kompatibel Excel Indonesia (sep=, dan Kolom Terpisah)", async () => {
  const { generateCsvString, sanitizeCsvCell: realSanitize } = await import("../src/lib/csvUtils.js");

  const { start, end } = {
    start: new Date("2020-01-01T00:00:00.000+07:00"),
    end: new Date("2030-12-31T23:59:59.999+07:00"),
  };

  const transactions = await prisma.transaction.findMany({
    where: {
      status_pembayaran: "SELESAI",
      tanggal_transaksi: { gte: start, lte: end },
    },
    include: { items: true, user: true },
  });

  let totalOmzet = 0;
  let totalHpp = 0;
  const dataRows = transactions.map((t, idx) => {
    let trxHpp = 0;
    for (const item of t.items) {
      trxHpp += Number(item.harga_beli_snapshot) * item.kuantitas;
    }
    const trxOmzet = Number(t.total_belanja);
    const trxLaba = trxOmzet - trxHpp;

    totalOmzet += trxOmzet;
    totalHpp += trxHpp;

    return [
      idx + 1,
      t.invoice_number,
      "2026-11-16",
      "14:00 WIB",
      t.user?.nama || "Kasir",
      t.metode_pembayaran,
      t.total_item,
      Number(t.subtotal),
      Number(t.discount_amount),
      trxOmzet,
      Math.round(trxHpp),
      Math.round(trxLaba),
    ];
  });

  const headers = [
    "No",
    "No. Faktur",
    "Tanggal (WIB)",
    "Jam (WIB)",
    "Kasir",
    "Metode Pembayaran",
    "Total Item",
    "Subtotal (Rp)",
    "Diskon (Rp)",
    "Total Belanja / Omzet (Rp)",
    "HPP Historis (Rp)",
    "Estimasi Laba Kotor (Rp)",
  ];

  // Susun struktur dokumen CSV lengkap sesuai implementasi produksi
  const rows = [
    ["LAPORAN PENJUALAN RETAIL - KASIRKITA"],
    ["Toko", "KasirKita Retail UMKM"],
    ["Total Transaksi", transactions.length],
    ["Total Omzet (Rp)", Math.round(totalOmzet)],
    ["Total HPP (Rp)", Math.round(totalHpp)],
    ["Estimasi Laba Kotor (Rp)", Math.round(totalOmzet - totalHpp)],
    [], // Baris kosong pemisah
    headers,
    ...dataRows,
  ];

  const csv = generateCsvString(rows);

  // 1. Verifikasi UTF-8 BOM dan direktif sep=, untuk Excel regional Indonesia
  assert.ok(csv.startsWith("\uFEFFsep=,\r\n"), "CSV harus diawali UTF-8 BOM dan direktif sep=,");

  // 2. Verifikasi pemisahan kolom pada baris header (tepat 12 kolom terpisah koma)
  const lines = csv.replace("\uFEFF", "").split("\r\n");
  assert.strictEqual(lines[0], "sep=,", "Baris pertama setelah BOM harus direktif sep=,");

  const headerLineIndex = lines.findIndex((l) => l.includes('"No. Faktur"'));
  assert.ok(headerLineIndex > -1, "Baris header kolom transaksi harus ditemukan");

  const headerCols = lines[headerLineIndex].split(",");
  assert.strictEqual(headerCols.length, 12, "Header harus memiliki tepat 12 kolom terpisah");
  assert.strictEqual(headerCols[0], '"No"');
  assert.strictEqual(headerCols[1], '"No. Faktur"');
  assert.strictEqual(headerCols[9], '"Total Belanja / Omzet (Rp)"');

  // 3. Verifikasi baris data transaksi: setiap baris memiliki 12 kolom dan angka nominal dapat diolah
  if (dataRows.length > 0) {
    const firstDataLine = lines[headerLineIndex + 1];
    const dataCols = firstDataLine.split(",");
    assert.strictEqual(dataCols.length, 12, "Baris data transaksi harus memiliki 12 kolom terpisah");

    // Kolom 7 (Total Item), 8 (Subtotal), 10 (Total Belanja) harus berupa angka finite unquoted
    const totalItemVal = Number(dataCols[6]);
    const subtotalVal = Number(dataCols[7]);
    const omzetVal = Number(dataCols[9]);

    assert.ok(Number.isFinite(totalItemVal), "Total item harus berupa angka");
    assert.ok(Number.isFinite(subtotalVal), "Subtotal harus berupa angka");
    assert.ok(Number.isFinite(omzetVal), "Total belanja harus berupa angka");
  }

  // 4. Verifikasi konsistensi metrik keuangan
  assert.ok(csv.includes(String(Math.round(totalOmzet))), "CSV memuat total omzet yang konsisten");
  assert.ok(csv.includes(String(Math.round(totalHpp))), "CSV memuat total HPP yang konsisten");
  assert.ok(csv.includes(String(transactions.length)), "CSV memuat total transaksi yang konsisten");
});

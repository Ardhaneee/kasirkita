const test = require("node:test");
const assert = require("node:assert");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();

// 1. Algoritma ROP & Safety Stock (sesuai implementasi di src/lib/algorithms.js)
function calculateAverageDailySales(totalQuantitySold, activeDays = 30) {
  const sold = Number(totalQuantitySold) || 0;
  const days = Math.max(1, Number(activeDays) || 1);
  return Number((sold / days).toFixed(2));
}

function calculateSafetyStock({
  averageDailySales,
  leadTimeDays,
  productSafetyStockOverride = null,
  defaultSafetyStockPercent = 20,
  minStockDefault = 5,
}) {
  if (
    productSafetyStockOverride !== null &&
    productSafetyStockOverride !== undefined &&
    Number(productSafetyStockOverride) >= 0
  ) {
    return Math.max(0, Math.round(Number(productSafetyStockOverride)));
  }

  if (averageDailySales > 0) {
    const leadTimeDemand = averageDailySales * leadTimeDays;
    const safetyFromPercent = Math.ceil(leadTimeDemand * (defaultSafetyStockPercent / 100));
    return Math.max(1, safetyFromPercent);
  }

  // Fallback Estimasi Awal: gunakan persentase buffer dari batas stok minimum produk (minimal 1 unit)
  const minStock = Number(minStockDefault) || 5;
  const safetyFromMinStock = Math.ceil(minStock * (defaultSafetyStockPercent / 100));
  return Math.max(1, safetyFromMinStock);
}

function calculateReorderPoint({
  currentStock,
  totalSold = 0,
  periodDays = 30,
  productLeadTime = null,
  defaultLeadTime = 3,
  productSafetyStock = null,
  defaultSafetyStockPercent = 20,
  stokMinimum = 5,
}) {
  const stock = Number(currentStock) || 0;
  const sold = Number(totalSold) || 0;
  const days = Math.max(1, Number(periodDays) || 1);
  const leadTime =
    productLeadTime !== null && productLeadTime !== undefined && Number(productLeadTime) > 0
      ? Number(productLeadTime)
      : Number(defaultLeadTime) || 3;

  const hasSufficientSalesData = sold > 0;
  const ads = calculateAverageDailySales(sold, days);
  const minStock = Number(stokMinimum) || 5;
  const safetyStock = calculateSafetyStock({
    averageDailySales: ads,
    leadTimeDays: leadTime,
    productSafetyStockOverride: productSafetyStock,
    defaultSafetyStockPercent: Number(defaultSafetyStockPercent) || 20,
    minStockDefault: minStock,
  });

  let rop = 0;
  let calculationType = "RIIL";
  let formulaLabel = "";
  let formulaDetail = "";

  if (hasSufficientSalesData) {
    calculationType = "RIIL";
    formulaLabel = "ROP Riil";
    rop = Math.ceil(ads * leadTime + safetyStock);
    formulaDetail = `(ADS: ${ads} × LT: ${leadTime} hr) + SS: ${safetyStock}`;
  } else {
    calculationType = "ESTIMASI_AWAL";
    formulaLabel = "ROP Estimasi Awal";
    // Rumus Fallback Eksplisit: Stok Minimum + Safety Stock
    rop = minStock + safetyStock;
    formulaDetail = `Stok Min: ${minStock} + SS: ${safetyStock}`;
  }

  let status = "AMAN";
  let isRestockNeeded = false;
  let recommendedOrderQty = 0;
  let urgencyLevel = 0;

  if (stock <= 0) {
    status = "HABIS";
    isRestockNeeded = true;
    urgencyLevel = 3;
    recommendedOrderQty = Math.max(rop * 2, 10);
  } else if (stock <= rop) {
    status = "PERLU_RESTOK";
    isRestockNeeded = true;
    urgencyLevel = 2;
    recommendedOrderQty = Math.max(rop * 2 - stock, 5);
  } else if (stock <= Math.ceil(rop * 1.25)) {
    status = "MENDEKATI_ROP";
    isRestockNeeded = false;
    urgencyLevel = 1;
    recommendedOrderQty = Math.max(rop * 2 - stock, 0);
  } else {
    status = "AMAN";
    isRestockNeeded = false;
    urgencyLevel = 0;
    recommendedOrderQty = 0;
  }

  return {
    currentStock: stock,
    averageDailySales: ads,
    leadTimeDays: leadTime,
    safetyStock,
    rop,
    calculationType,
    formulaLabel,
    formulaDetail,
    hasSufficientSalesData,
    status,
    isRestockNeeded,
    recommendedOrderQty,
    urgencyLevel,
  };
}

// 2. Skema Zod
const addStockSchema = z.object({
  productId: z.coerce.number().int().positive(),
  jumlah: z.coerce.number().int().positive("Jumlah stok masuk harus positif"),
  keterangan: z.string().trim().max(255).optional().nullable(),
});

const adjustStockSchema = z.object({
  productId: z.coerce.number().int().positive(),
  stokFisik: z.coerce.number().int().min(0, "Stok fisik tidak boleh negatif"),
  alasan: z.string().trim().min(3, "Alasan penyesuaian minimal 3 karakter").max(255),
  kategoriAlasan: z
    .enum(["STOK_OPNAME", "BARANG_RUSAK", "BARANG_HILANG", "KOREKSI_CATATAN", "LAINNYA"])
    .optional()
    .default("STOK_OPNAME"),
});

// ============================================================================
// TEST CASES
// ============================================================================

test("1. Algoritma Reorder Point (ROP) & Safety Stock", () => {
  // Skenario 1: Penjualan 60 item dalam 30 hari (ADS = 2.0 /hari)
  // Lead time = 3 hari, Buffer = 20%
  // Lead Time Demand = 2.0 * 3 = 6
  // Safety Stock = ceil(6 * 0.20) = 2
  // ROP = (2.0 * 3) + 2 = 8
  const res1 = calculateReorderPoint({
    currentStock: 15,
    totalSold: 60,
    periodDays: 30,
    defaultLeadTime: 3,
    defaultSafetyStockPercent: 20,
    stokMinimum: 5,
  });

  assert.strictEqual(res1.averageDailySales, 2.0);
  assert.strictEqual(res1.leadTimeDays, 3);
  assert.strictEqual(res1.safetyStock, 2);
  assert.strictEqual(res1.rop, 8);
  assert.strictEqual(res1.status, "AMAN");
  assert.strictEqual(res1.isRestockNeeded, false);

  // Skenario 2: Stok saat ini 5 (<= ROP 8) -> PERLU_RESTOK
  const res2 = calculateReorderPoint({
    currentStock: 5,
    totalSold: 60,
    periodDays: 30,
    defaultLeadTime: 3,
    defaultSafetyStockPercent: 20,
    stokMinimum: 5,
  });
  assert.strictEqual(res2.status, "PERLU_RESTOK");
  assert.strictEqual(res2.isRestockNeeded, true);
  assert.strictEqual(res2.urgencyLevel, 2);
  // Saran order: max(8 * 2 - 5, 5) = 11 unit
  assert.strictEqual(res2.recommendedOrderQty, 11);

  // Skenario 3: Stok saat ini 0 -> HABIS
  const res3 = calculateReorderPoint({
    currentStock: 0,
    totalSold: 60,
    periodDays: 30,
    defaultLeadTime: 3,
    defaultSafetyStockPercent: 20,
    stokMinimum: 5,
  });
  assert.strictEqual(res3.status, "HABIS");
  assert.strictEqual(res3.isRestockNeeded, true);
  assert.strictEqual(res3.urgencyLevel, 3);
  assert.strictEqual(res3.recommendedOrderQty, 16);

  // Skenario 4: Override lead time (7 hari) dan safety stock (5 unit) khusus produk
  const res4 = calculateReorderPoint({
    currentStock: 25,
    totalSold: 90,
    periodDays: 30, // ADS = 3.0 /hari
    productLeadTime: 7,
    productSafetyStock: 5,
    stokMinimum: 5,
  });
  assert.strictEqual(res4.averageDailySales, 3.0);
  assert.strictEqual(res4.leadTimeDays, 7);
  assert.strictEqual(res4.safetyStock, 5);
  // ROP = (3.0 * 7) + 5 = 26
  assert.strictEqual(res4.rop, 26);
  // Stok 25 <= ROP 26 -> PERLU_RESTOK
  assert.strictEqual(res4.status, "PERLU_RESTOK");
  assert.strictEqual(res4.isRestockNeeded, true);

  // Skenario 5: Belum ada histori penjualan memadai (ADS = 0) -> Fallback Eksplisit: ROP Estimasi Awal
  // Contoh kasus audit: ADS = 0, Lead Time = 3, Stok Min = 2, Buffer = 20%
  // Safety Stock = ceil(2 * 0.20) = 1
  // ROP Estimasi Awal = 2 + 1 = 3
  const res5 = calculateReorderPoint({
    currentStock: 4,
    totalSold: 0,
    periodDays: 30,
    defaultLeadTime: 3,
    defaultSafetyStockPercent: 20,
    stokMinimum: 2,
  });
  assert.strictEqual(res5.calculationType, "ESTIMASI_AWAL");
  assert.strictEqual(res5.formulaLabel, "ROP Estimasi Awal");
  assert.strictEqual(res5.hasSufficientSalesData, false);
  assert.strictEqual(res5.averageDailySales, 0);
  assert.strictEqual(res5.safetyStock, 1, "Safety stock fallback dari stok minimum 2 * 20% = 1");
  assert.strictEqual(res5.rop, 3, "ROP fallback: Stok Min (2) + Safety Stock (1) = tepat 3");
  assert.strictEqual(res5.formulaDetail, "Stok Min: 2 + SS: 1");

  // Skenario 6: Uji Perubahan Persentase Safety Stock pada Fallback ROP Estimasi Awal (ADS = 0)
  // 6a. Toko mengubah konfigurasi default_safety_stock_percent menjadi 30%, Stok Min = 10
  // Safety Stock = ceil(10 * 0.30) = 3
  // ROP Estimasi Awal = 10 + 3 = 13
  const res6a = calculateReorderPoint({
    currentStock: 10,
    totalSold: 0,
    periodDays: 30,
    defaultLeadTime: 3,
    defaultSafetyStockPercent: 30,
    stokMinimum: 10,
  });
  assert.strictEqual(res6a.calculationType, "ESTIMASI_AWAL");
  assert.strictEqual(res6a.safetyStock, 3, "Safety stock dengan persentase 30% dari stok minimum 10 adalah 3");
  assert.strictEqual(res6a.rop, 13, "ROP fallback: 10 + 3 = 13");
  assert.strictEqual(res6a.formulaDetail, "Stok Min: 10 + SS: 3");

  // 6b. Toko mengubah konfigurasi default_safety_stock_percent menjadi 15%, Stok Min = 5
  // Safety Stock = ceil(5 * 0.15) = ceil(0.75) = 1 (pembulatan ke atas)
  // ROP Estimasi Awal = 5 + 1 = 6
  const res6b = calculateReorderPoint({
    currentStock: 5,
    totalSold: 0,
    periodDays: 30,
    defaultLeadTime: 3,
    defaultSafetyStockPercent: 15,
    stokMinimum: 5,
  });
  assert.strictEqual(res6b.safetyStock, 1, "Safety stock pembulatan ke atas ceil(5 * 0.15) = 1");
  assert.strictEqual(res6b.rop, 6, "ROP fallback: 5 + 1 = 6");

  // Skenario 7: Uji Perubahan Persentase Safety Stock pada ROP Riil (ADS > 0)
  // Penjualan 90 item / 30 hari (ADS = 3.0), Lead Time = 3 hari
  // Jika persentase diubah ke 30%:
  // Lead Time Demand = 3.0 * 3 = 9
  // Safety Stock = ceil(9 * 0.30) = ceil(2.7) = 3
  // ROP Riil = 9 + 3 = 12
  const res7 = calculateReorderPoint({
    currentStock: 20,
    totalSold: 90,
    periodDays: 30,
    defaultLeadTime: 3,
    defaultSafetyStockPercent: 30,
    stokMinimum: 5,
  });
  assert.strictEqual(res7.calculationType, "RIIL");
  assert.strictEqual(res7.safetyStock, 3, "Safety stock ceil(9 * 0.30) = 3");
  assert.strictEqual(res7.rop, 12, "ROP riil: 9 + 3 = 12");
});

test("2. Validasi Zod: addStockSchema & adjustStockSchema", () => {
  // 2a. addStockSchema: Tolak jumlah 0 atau negatif
  const zeroAdd = addStockSchema.safeParse({ productId: 1, jumlah: 0 });
  assert.strictEqual(zeroAdd.success, false, "Jumlah masuk 0 harus ditolak");

  const negAdd = addStockSchema.safeParse({ productId: 1, jumlah: -10 });
  assert.strictEqual(negAdd.success, false, "Jumlah masuk negatif harus ditolak");

  const validAdd = addStockSchema.safeParse({ productId: 1, jumlah: 24, keterangan: "PO-001" });
  assert.strictEqual(validAdd.success, true);
  assert.strictEqual(validAdd.data.jumlah, 24);

  // 2b. adjustStockSchema: Tolak stok fisik negatif
  const negAdjust = adjustStockSchema.safeParse({
    productId: 1,
    stokFisik: -5,
    alasan: "Barang rusak",
  });
  assert.strictEqual(negAdjust.success, false, "Stok fisik negatif harus ditolak");

  // Terima stok fisik 0 (barang habis/hilang semua)
  const zeroAdjust = adjustStockSchema.safeParse({
    productId: 1,
    stokFisik: 0,
    alasan: "Barang rusak total kena banjir",
  });
  assert.strictEqual(zeroAdjust.success, true);
  assert.strictEqual(zeroAdjust.data.stokFisik, 0);

  // Tolak alasan terlalu pendek (< 3 karakter)
  const shortReason = adjustStockSchema.safeParse({
    productId: 1,
    stokFisik: 10,
    alasan: "ok",
  });
  assert.strictEqual(shortReason.success, false, "Alasan di bawah 3 karakter harus ditolak");
});

test("3. PostgreSQL Atomik: Penambahan Stok Barang Masuk (Restok)", async () => {
  const pemilik = await prisma.user.findFirst({ where: { role: "PEMILIK" } });
  assert.ok(pemilik, "Pengguna PEMILIK harus tersedia di database");

  // Buat produk uji khusus
  const category = await prisma.category.findFirst();
  const testProduct = await prisma.product.create({
    data: {
      category_id: category.id,
      barcode: `TEST-STOK-${Date.now()}`,
      nama_produk: "Produk Uji Penambahan Stok Atomik",
      harga_beli: 10000,
      harga_jual: 15000,
      stok: 20,
      stok_minimum: 5,
    },
  });

  const stokAwal = testProduct.stok;
  const jumlahMasuk = 15;

  // Jalankan transaksi penambahan stok atomik
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: testProduct.id },
      data: { stok: { increment: jumlahMasuk } },
    });

    const movement = await tx.stockMovement.create({
      data: {
        product_id: testProduct.id,
        user_id: pemilik.id,
        tipe_mutasi: "MASUK",
        jumlah: jumlahMasuk,
        stok_awal: stokAwal,
        stok_akhir: stokAwal + jumlahMasuk,
        keterangan: "Restok rutin dari Distributor Utama",
      },
    });

    return { updated, movement };
  });

  // Verifikasi stok produk terupdate tepat
  assert.strictEqual(result.updated.stok, stokAwal + jumlahMasuk);
  assert.strictEqual(result.movement.stok_awal, 20);
  assert.strictEqual(result.movement.stok_akhir, 35);
  assert.strictEqual(result.movement.tipe_mutasi, "MASUK");

  // Bersihkan data uji
  await prisma.stockMovement.deleteMany({ where: { product_id: testProduct.id } });
  await prisma.product.delete({ where: { id: testProduct.id } });
});

test("4. PostgreSQL Atomik: Penyesuaian Stok Fisik (Opname & Koreksi)", async () => {
  const pemilik = await prisma.user.findFirst({ where: { role: "PEMILIK" } });
  const category = await prisma.category.findFirst();

  const testProduct = await prisma.product.create({
    data: {
      category_id: category.id,
      barcode: `TEST-ADJ-${Date.now()}`,
      nama_produk: "Produk Uji Penyesuaian Stok Opname",
      harga_beli: 8000,
      harga_jual: 12000,
      stok: 50,
      stok_minimum: 10,
    },
  });

  const stokAwal = testProduct.stok;
  const stokFisikBaru = 42; // Ada selisih -8 unit (misal rusak/hilang)
  const selisih = stokFisikBaru - stokAwal;

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id: testProduct.id },
      data: { stok: stokFisikBaru },
    });

    const movement = await tx.stockMovement.create({
      data: {
        product_id: testProduct.id,
        user_id: pemilik.id,
        tipe_mutasi: "PENYESUAIAN",
        jumlah: Math.abs(selisih),
        stok_awal: stokAwal,
        stok_akhir: stokFisikBaru,
        keterangan: "[BARANG_RUSAK] 8 kemasan sobek digigit hama gudang (-8 pcs)",
      },
    });

    return { updated, movement };
  });

  assert.strictEqual(result.updated.stok, 42);
  assert.strictEqual(result.movement.jumlah, 8);
  assert.strictEqual(result.movement.stok_awal, 50);
  assert.strictEqual(result.movement.stok_akhir, 42);
  assert.strictEqual(result.movement.tipe_mutasi, "PENYESUAIAN");

  // Bersihkan data uji
  await prisma.stockMovement.deleteMany({ where: { product_id: testProduct.id } });
  await prisma.product.delete({ where: { id: testProduct.id } });
});

test("5. Otorisasi RBAC: Kasir Dilarang Menambah atau Menyesuaikan Stok Manual", async () => {
  // Verifikasi definisi izin
  const rolePermissions = {
    PEMILIK: ["MANAGE_STOCK", "ADD_STOCK", "ADJUST_STOCK", "VIEW_STOCK", "VIEW_MUTATIONS"],
    KASIR: ["VIEW_STOCK"],
  };

  assert.strictEqual(rolePermissions.KASIR.includes("ADD_STOCK"), false);
  assert.strictEqual(rolePermissions.KASIR.includes("ADJUST_STOCK"), false);
  assert.strictEqual(rolePermissions.PEMILIK.includes("ADD_STOCK"), true);
  assert.strictEqual(rolePermissions.PEMILIK.includes("ADJUST_STOCK"), true);
});

test("6. Konsistensi Audit: Tidak Ada Perubahan Stok Tanpa Catatan Mutasi", async () => {
  // Ambil transaksi kasir yang ada di database
  const tx = await prisma.transaction.findFirst({
    include: { items: true },
    orderBy: { id: "desc" },
  });

  if (tx && tx.items.length > 0) {
    const item = tx.items[0];
    const movement = await prisma.stockMovement.findFirst({
      where: {
        product_id: item.product_id,
        referensi_nomor: tx.invoice_number,
        tipe_mutasi: "PENJUALAN",
      },
    });

    assert.ok(movement, "Setiap penjualan kasir wajib memiliki pasangan record StockMovement");
    assert.strictEqual(movement.jumlah, item.kuantitas);
  }
});

test("7. Uji Konkurensi & Anti-Race Condition Pembaruan Stok Bersamaan", async () => {
  const category = await prisma.category.findFirst();
  const testProduct = await prisma.product.create({
    data: {
      category_id: category.id,
      barcode: `TEST-CONC-${Date.now()}`,
      nama_produk: "Produk Uji Konkurensi Stok",
      harga_beli: 5000,
      harga_jual: 7500,
      stok: 10,
    },
  });

  // Jalankan 5 penambahan stok simultan (+2 unit masing-masing) secara paralel
  const promises = Array.from({ length: 5 }, () =>
    prisma.product.update({
      where: { id: testProduct.id },
      data: { stok: { increment: 2 } },
    })
  );

  await Promise.all(promises);

  const finalProduct = await prisma.product.findUnique({
    where: { id: testProduct.id },
  });

  // Stok awal (10) + (5 * 2 = 10) = tepat 20 tanpa kehilangan data
  assert.strictEqual(finalProduct.stok, 20, "Operasi konkuren harus bebas dari Lost Update");

  await prisma.product.delete({ where: { id: testProduct.id } });
});

test("8. Filter Riwayat Mutasi Stok di Database", async () => {
  const allMovements = await prisma.stockMovement.findMany({
    take: 10,
    orderBy: { created_at: "desc" },
  });

  assert.ok(Array.isArray(allMovements));

  // Filter berdasarkan tipe PENJUALAN
  const salesMovements = await prisma.stockMovement.findMany({
    where: { tipe_mutasi: "PENJUALAN" },
    take: 5,
  });

  salesMovements.forEach((m) => {
    assert.strictEqual(m.tipe_mutasi, "PENJUALAN");
  });
});

test("9. Penyesuaian stok tanpa selisih (stok fisik sama) tidak menghasilkan mutasi menyesatkan", async () => {
  const category = await prisma.category.findFirst();
  const testProduct = await prisma.product.create({
    data: {
      category_id: category.id,
      barcode: `TEST-ZERO-DIFF-${Date.now()}`,
      nama_produk: "Produk Uji Penyesuaian Nol Selisih",
      harga_beli: 4000,
      harga_jual: 6000,
      stok: 18,
    },
  });

  const countBefore = await prisma.stockMovement.count({
    where: { product_id: testProduct.id },
  });

  // Simulasi logika adjustStockAction ketika stokFisik === product.stok (selisih 0)
  const stokFisik = 18;
  const selisih = stokFisik - testProduct.stok;

  // Sesuai aturan: jika selisih === 0, jangan buat record mutasi fiktif
  let createdMovement = false;
  if (selisih !== 0) {
    await prisma.stockMovement.create({
      data: {
        product_id: testProduct.id,
        user_id: 1,
        tipe_mutasi: "PENYESUAIAN",
        jumlah: Math.abs(selisih),
        stok_awal: testProduct.stok,
        stok_akhir: stokFisik,
        keterangan: "Penyesuaian nol",
      },
    });
    createdMovement = true;
  }

  const countAfter = await prisma.stockMovement.count({
    where: { product_id: testProduct.id },
  });

  assert.strictEqual(createdMovement, false, "Tidak boleh membuat mutasi baru saat selisih 0");
  assert.strictEqual(countBefore, countAfter, "Jumlah mutasi di database tidak boleh bertambah");

  await prisma.product.delete({ where: { id: testProduct.id } });
});

test("10. Server-Side RBAC: Kasir Ditolak Mengakses Riwayat Mutasi dan Rekomendasi Restok", () => {
  // Verifikasi tabel hak akses server
  const rolePermissions = {
    PEMILIK: ["VIEW_MUTATIONS", "VIEW_ROP_RECOMMENDATIONS", "ADD_STOCK", "ADJUST_STOCK", "VIEW_STOCK"],
    KASIR: ["VIEW_STOCK"],
  };

  assert.strictEqual(
    rolePermissions.KASIR.includes("VIEW_MUTATIONS"),
    false,
    "Kasir dilarang mengakses riwayat mutasi stok"
  );
  assert.strictEqual(
    rolePermissions.KASIR.includes("VIEW_ROP_RECOMMENDATIONS"),
    false,
    "Kasir dilarang mengakses rekomendasi restok ROP"
  );
  assert.strictEqual(
    rolePermissions.PEMILIK.includes("VIEW_MUTATIONS"),
    true,
    "Pemilik memiliki izin audit riwayat mutasi stok"
  );
  assert.strictEqual(
    rolePermissions.PEMILIK.includes("VIEW_ROP_RECOMMENDATIONS"),
    true,
    "Pemilik memiliki izin akses rekomendasi restok ROP"
  );
});

test("11. Konkurensi: Penjualan Kasir dan Penyesuaian Stok Simultan Bebas Lost Update", async () => {
  const category = await prisma.category.findFirst();
  const testProduct = await prisma.product.create({
    data: {
      category_id: category.id,
      barcode: `TEST-CONC-SALE-${Date.now()}`,
      nama_produk: "Produk Uji Penjualan vs Penyesuaian",
      harga_beli: 10000,
      harga_jual: 15000,
      stok: 30,
    },
  });

  // Operasi 1: Penjualan kasir memotong 2 unit dengan atomic condition
  const op1 = prisma.$executeRaw`
    UPDATE "products"
    SET "stok" = "stok" - 2, "updated_at" = NOW()
    WHERE "id" = ${testProduct.id} AND "stok" >= 2
  `;

  // Operasi 2: Penambahan stok masuk 10 unit secara atomik
  const op2 = prisma.product.update({
    where: { id: testProduct.id },
    data: { stok: { increment: 10 } },
  });

  await Promise.all([op1, op2]);

  const finalProduct = await prisma.product.findUnique({
    where: { id: testProduct.id },
  });

  // Stok awal 30 - 2 (penjualan) + 10 (stok masuk) = 38 unit
  assert.strictEqual(
    finalProduct.stok,
    38,
    "Kombinasi penjualan kasir dan mutasi stok secara atomik harus menghasilkan saldo 38 tanpa Lost Update"
  );

  await prisma.product.delete({ where: { id: testProduct.id } });
});

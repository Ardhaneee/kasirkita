const test = require("node:test");
const assert = require("node:assert");
const { PrismaClient } = require("@prisma/client");
const { z } = require("zod");

const prisma = new PrismaClient();

// Implementasi fungsi Greedy Pecahan Uang Rupiah (sama dengan src/lib/algorithms.js)
function calculateChangeBreakdown(changeAmount) {
  const amount = Math.floor(Number(changeAmount) || 0);
  if (amount <= 0) return [];

  const DENOMINATIONS = [
    { nominal: 100000, label: "Rp 100.000 (Kertas)" },
    { nominal: 50000, label: "Rp 50.000 (Kertas)" },
    { nominal: 20000, label: "Rp 20.000 (Kertas)" },
    { nominal: 10000, label: "Rp 10.000 (Kertas)" },
    { nominal: 5000, label: "Rp 5.000 (Kertas)" },
    { nominal: 2000, label: "Rp 2.000 (Kertas)" },
    { nominal: 1000, label: "Rp 1.000 (Kertas/Koin)" },
    { nominal: 500, label: "Rp 500 (Koin)" },
    { nominal: 200, label: "Rp 200 (Koin)" },
    { nominal: 100, label: "Rp 100 (Koin)" },
  ];

  let remaining = amount;
  const breakdown = [];

  for (const denom of DENOMINATIONS) {
    if (remaining >= denom.nominal) {
      const count = Math.floor(remaining / denom.nominal);
      remaining %= denom.nominal;
      breakdown.push({
        nominal: denom.nominal,
        count,
        label: denom.label,
      });
    }
    if (remaining === 0) break;
  }

  return breakdown;
}

// Skema validasi checkout (sama dengan src/lib/validations.js)
const checkoutItemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().positive(),
});

const checkoutSchema = z.object({
  idempotencyKey: z.string().min(5).max(100),
  items: z.array(checkoutItemSchema).min(1),
  discountAmount: z.coerce.number().min(0).default(0),
  paymentMethod: z.enum(["TUNAI", "QRIS"]),
  cashReceived: z.coerce.number().min(0),
  notes: z.string().max(500).optional().nullable(),
});

test("1. Algoritma Greedy: Perhitungan rincian pecahan uang kembalian Rupiah", () => {
  // Skenario 1: Tidak ada kembalian
  const zeroChange = calculateChangeBreakdown(0);
  assert.deepStrictEqual(zeroChange, []);

  // Skenario 2: Kembalian Rp 18.500
  // Ekspektasi Greedy: 1x 10.000, 1x 5.000, 1x 2.000, 1x 1.000, 1x 500 = 5 lembar/koin
  const breakdown1 = calculateChangeBreakdown(18500);
  const totalNominal1 = breakdown1.reduce((sum, item) => sum + item.nominal * item.count, 0);
  assert.strictEqual(totalNominal1, 18500);
  assert.strictEqual(breakdown1.find((d) => d.nominal === 10000)?.count, 1);
  assert.strictEqual(breakdown1.find((d) => d.nominal === 5000)?.count, 1);
  assert.strictEqual(breakdown1.find((d) => d.nominal === 2000)?.count, 1);
  assert.strictEqual(breakdown1.find((d) => d.nominal === 1000)?.count, 1);
  assert.strictEqual(breakdown1.find((d) => d.nominal === 500)?.count, 1);

  // Skenario 3: Kembalian Rp 178.600
  const breakdown2 = calculateChangeBreakdown(178600);
  const totalNominal2 = breakdown2.reduce((sum, item) => sum + item.nominal * item.count, 0);
  assert.strictEqual(totalNominal2, 178600);
  assert.strictEqual(breakdown2.length, 8);
});

test("2. Validasi Zod Checkout: Keranjang belanja, metode bayar, dan nominal", () => {
  // Keranjang kosong harus ditolak
  const emptyCart = checkoutSchema.safeParse({
    idempotencyKey: "unique-key-12345",
    items: [],
    paymentMethod: "TUNAI",
    cashReceived: 50000,
  });
  assert.strictEqual(emptyCart.success, false, "Keranjang belanja kosong wajib ditolak");

  // Metode pembayaran salah harus ditolak
  const invalidMethod = checkoutSchema.safeParse({
    idempotencyKey: "unique-key-12345",
    items: [{ productId: 1, quantity: 2 }],
    paymentMethod: "KARTU_KREDIT", // Belum didukung
    cashReceived: 50000,
  });
  assert.strictEqual(invalidMethod.success, false, "Metode pembayaran non-TUNAI/QRIS wajib ditolak");

  // Data valid
  const validPayload = checkoutSchema.safeParse({
    idempotencyKey: "unique-key-12345",
    items: [{ productId: 1, quantity: 2 }],
    discountAmount: 2000,
    paymentMethod: "TUNAI",
    cashReceived: 50000,
    notes: "Pelanggan meminta struk terpisah",
  });
  assert.strictEqual(validPayload.success, true, "Data checkout valid wajib diterima");
});

test("3. Integritas Database Transaksi Kasir, Price Snapshot, dan Audit Mutasi Stok", async () => {
  // Ambil produk uji dan user kasir dari PostgreSQL (pilih produk seeder permanen)
  const product = await prisma.product.findFirst({
    where: {
      status_aktif: true,
      stok: { gte: 10 },
      barcode: { not: { startsWith: "TEST-" } },
    },
  });
  assert.ok(product, "Harus ada produk dengan stok minimal 10 untuk pengujian.");

  const kasirUser = await prisma.user.findFirst({
    where: { username: "kasir" },
  });
  assert.ok(kasirUser, "User kasir ditemukan.");

  const initialStock = product.stok;
  const testIdempotencyKey = `TEST-IDEMP-${Date.now()}`;
  let createdInvoiceNumber = null;

  try {
    const qtyToBuy = 2;
    const hargaJual = Number(product.harga_jual);
    const hargaBeli = Number(product.harga_beli);
    const subtotal = hargaJual * qtyToBuy;
    const discount = 1000;
    const totalBelanja = subtotal - discount;
    const nominalBayar = totalBelanja + 5000;
    const kembalian = 5000;

    // Transaksi Atomik Database (ACID)
    const txResult = await prisma.$transaction(async (tx) => {
      // 1. Potong stok secara atomik
      const updated = await tx.$executeRaw`
        UPDATE "products"
        SET "stok" = "stok" - ${qtyToBuy}, "updated_at" = NOW()
        WHERE "id" = ${product.id} AND "stok" >= ${qtyToBuy}
      `;
      assert.strictEqual(updated, 1, "Pemotongan stok atomik harus menghasilkan 1 baris terupdate.");

      const inv = `TEST-INV-${Date.now()}`;
      createdInvoiceNumber = inv;

      // 2. Buat Transaksi
      const createdTx = await tx.transaction.create({
        data: {
          invoice_number: inv,
          idempotency_key: testIdempotencyKey,
          user_id: kasirUser.id,
          total_item: qtyToBuy,
          subtotal,
          discount_amount: discount,
          total_belanja: totalBelanja,
          nominal_bayar: nominalBayar,
          kembalian,
          metode_pembayaran: "TUNAI",
          status_pembayaran: "SELESAI",
          items: {
            create: [
              {
                product_id: product.id,
                nama_produk_snapshot: product.nama_produk,
                harga_beli_snapshot: hargaBeli,
                harga_jual_snapshot: hargaJual,
                kuantitas: qtyToBuy,
                subtotal,
              },
            ],
          },
        },
        include: { items: true },
      });

      // 3. Catat Kartu Mutasi Stok (Stock Movement)
      await tx.stockMovement.create({
        data: {
          product_id: product.id,
          user_id: kasirUser.id,
          tipe_mutasi: "PENJUALAN",
          jumlah: qtyToBuy,
          stok_awal: initialStock,
          stok_akhir: initialStock - qtyToBuy,
          referensi_nomor: inv,
          keterangan: `Pengujian Transaksi Kasir - ${inv}`,
        },
      });

      return createdTx;
    });

    assert.ok(txResult.id, "Transaksi berhasil disimpan di database.");
    assert.strictEqual(txResult.idempotency_key, testIdempotencyKey);
    assert.strictEqual(txResult.items.length, 1);
    assert.strictEqual(txResult.items[0].nama_produk_snapshot, product.nama_produk);
    assert.strictEqual(Number(txResult.items[0].harga_jual_snapshot), hargaJual);
    assert.strictEqual(Number(txResult.items[0].harga_beli_snapshot), hargaBeli);

    // Cek stok produk di database berkurang tepat sesuai kuantitas
    const productAfter = await prisma.product.findUnique({
      where: { id: product.id },
    });
    assert.strictEqual(productAfter.stok, initialStock - qtyToBuy);

    // Cek kartu mutasi stok (StockMovement)
    const movement = await prisma.stockMovement.findFirst({
      where: { referensi_nomor: createdInvoiceNumber },
    });
    assert.ok(movement, "Audit log StockMovement harus tercatat.");
    assert.strictEqual(movement.tipe_mutasi, "PENJUALAN");
    assert.strictEqual(movement.stok_awal, initialStock);
    assert.strictEqual(movement.stok_akhir, initialStock - qtyToBuy);

    // 4. Uji Idempotency: Duplicate idempotency_key wajib ditolak oleh PostgreSQL
    await assert.rejects(
      async () => {
        await prisma.transaction.create({
          data: {
            invoice_number: `DUP-INV-${Date.now()}`,
            idempotency_key: testIdempotencyKey, // Duplikat key
            user_id: kasirUser.id,
            total_item: 1,
            subtotal: 1000,
            total_belanja: 1000,
            nominal_bayar: 1000,
            kembalian: 0,
            metode_pembayaran: "TUNAI",
          },
        });
      },
      /Unique constraint failed on the fields: \(`idempotency_key`\)/i,
      "PostgreSQL harus menolak transaksi dengan idempotency_key yang sama."
    );

    // 5. Uji Atomik Anti-Negative Stock: Jika kuantitas melebihi sisa stok, row affected adalah 0
    const excessiveQty = productAfter.stok + 500;
    const failedUpdate = await prisma.$executeRaw`
      UPDATE "products"
      SET "stok" = "stok" - ${excessiveQty}, "updated_at" = NOW()
      WHERE "id" = ${product.id} AND "stok" >= ${excessiveQty}
    `;
    assert.strictEqual(failedUpdate, 0, "Update stok harus bernilai 0 bila kuantitas melebihi stok yang ada.");
  } finally {
    // Teardown / Pembersihan data pengujian
    if (createdInvoiceNumber) {
      await prisma.stockMovement.deleteMany({
        where: { referensi_nomor: createdInvoiceNumber },
      });
      await prisma.transactionItem.deleteMany({
        where: { transaction: { invoice_number: createdInvoiceNumber } },
      });
      await prisma.transaction.deleteMany({
        where: { invoice_number: createdInvoiceNumber },
      });
    }
    // Pulihkan stok produk
    await prisma.product.update({
      where: { id: product.id },
      data: { stok: initialStock },
    });
  }
});

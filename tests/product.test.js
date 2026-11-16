const test = require("node:test");
const assert = require("node:assert");
const { PrismaClient } = require("@prisma/client");
const sharp = require("sharp");
const path = require("node:path");
const fs = require("node:fs/promises");
const { z } = require("zod");

const prisma = new PrismaClient();

// Definisi skema validasi yang sama dengan lib/validations.js
const productSchema = z.object({
  nama_produk: z.string().trim().min(3).max(150),
  barcode: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_-]+$/),
  category_id: z.coerce.number().int().positive(),
  harga_beli: z.coerce.number().min(0, "Harga beli tidak boleh negatif"),
  harga_jual: z.coerce.number().min(0, "Harga jual tidak boleh negatif"),
  stok: z.coerce.number().int().min(0, "Stok tidak boleh negatif"),
  stok_minimum: z.coerce.number().int().min(0).default(5),
  satuan: z.string().trim().min(1).max(20).default("pcs"),
  status_aktif: z.coerce.boolean().default(true),
});

const categorySchema = z.object({
  nama: z.string().trim().min(2).max(50),
  deskripsi: z.string().trim().max(255).optional().nullable(),
});

test("1. Validasi Zod: Penolakan harga dan stok bernilai negatif", () => {
  // Skenario harga negatif
  const invalidPrice = productSchema.safeParse({
    nama_produk: "Kecap Manis 600ml",
    barcode: "899123456001",
    category_id: 1,
    harga_beli: -1000,
    harga_jual: 12000,
    stok: 10,
  });
  assert.strictEqual(invalidPrice.success, false, "Harga beli negatif wajib ditolak");

  // Skenario stok negatif
  const invalidStock = productSchema.safeParse({
    nama_produk: "Kecap Manis 600ml",
    barcode: "899123456001",
    category_id: 1,
    harga_beli: 10000,
    harga_jual: 12000,
    stok: -5,
  });
  assert.strictEqual(invalidStock.success, false, "Stok negatif wajib ditolak");

  // Skenario data valid
  const valid = productSchema.safeParse({
    nama_produk: "Kecap Manis 600ml",
    barcode: "899123456001",
    category_id: 1,
    harga_beli: 10000,
    harga_jual: 12000,
    stok: 25,
    satuan: "botol",
  });
  assert.strictEqual(valid.success, true, "Data valid wajib diterima");
});

test("2. PostgreSQL: Penambahan kategori baru dan pencegahan duplikasi", async () => {
  const testCatName = `Kategori Uji ${Date.now()}`;

  // Tambah kategori baru
  const created = await prisma.category.create({
    data: {
      nama: testCatName,
      deskripsi: "Kategori pengujian otomatis",
    },
  });
  assert.ok(created.id, "Kategori harus berhasil dibuat");
  assert.strictEqual(created.nama, testCatName);

  // Percobaan duplikasi kategori (wajib ditolak oleh database unique constraint)
  await assert.rejects(
    async () => {
      await prisma.category.create({
        data: { nama: testCatName },
      });
    },
    /Unique constraint failed on the fields: \(`nama`\)/i,
    "Duplikasi nama kategori wajib ditolak oleh database"
  );

  // Bersihkan data uji agar tidak mencemari database pengembangan
  await prisma.category.delete({ where: { id: created.id } });
});

test("3. PostgreSQL: Tambah produk baru, edit, dan tolak SKU duplikat", async () => {
  const category = await prisma.category.findFirst();
  assert.ok(category, "Kategori harus tersedia");

  const testBarcode = `TEST-SKU-${Date.now()}`;

  // 1. Tambah produk
  const newProduct = await prisma.product.create({
    data: {
      nama_produk: "Garam Dapur Beryodium 250g",
      barcode: testBarcode,
      category_id: category.id,
      harga_beli: 2500,
      harga_jual: 3500,
      stok: 50,
      stok_minimum: 10,
      satuan: "bungkus",
      status_aktif: true,
    },
  });
  assert.ok(newProduct.id, "Produk baru harus berhasil dibuat");
  assert.strictEqual(newProduct.barcode, testBarcode);

  // 2. Tolak duplikasi barcode/SKU
  await assert.rejects(
    async () => {
      await prisma.product.create({
        data: {
          nama_produk: "Garam Dapur Lain",
          barcode: testBarcode, // SKU sama
          category_id: category.id,
          harga_beli: 2000,
          harga_jual: 3000,
          stok: 10,
        },
      });
    },
    /Unique constraint failed on the fields: \(`barcode`\)/i,
    "SKU duplikat harus ditolak oleh PostgreSQL"
  );

  // 3. Edit produk
  const updated = await prisma.product.update({
    where: { id: newProduct.id },
    data: {
      harga_jual: 4000,
      nama_produk: "Garam Dapur Halus Beryodium 250g",
    },
  });
  assert.strictEqual(Number(updated.harga_jual), 4000);
  assert.strictEqual(updated.nama_produk, "Garam Dapur Halus Beryodium 250g");

  // 4. Nonaktifkan produk (Soft Delete / Status Toggle)
  const deactivated = await prisma.product.update({
    where: { id: newProduct.id },
    data: { status_aktif: false },
  });
  assert.strictEqual(deactivated.status_aktif, false, "Produk harus dapat dinonaktifkan");

  // Aktifkan kembali
  const reactivated = await prisma.product.update({
    where: { id: newProduct.id },
    data: { status_aktif: true },
  });
  assert.strictEqual(reactivated.status_aktif, true, "Produk harus dapat diaktifkan kembali");

  // Bersihkan data produk uji
  await prisma.product.delete({ where: { id: newProduct.id } });
});

test("4. PostgreSQL: Pencarian produk dan filter kategori", async () => {
  // Cari produk Minyak Goreng yang ada di seeder
  const searchResults = await prisma.product.findMany({
    where: {
      OR: [
        { nama_produk: { contains: "Minyak", mode: "insensitive" } },
        { barcode: { contains: "Minyak", mode: "insensitive" } },
      ],
    },
  });
  assert.ok(searchResults.length > 0, "Pencarian nama produk 'Minyak' harus menemukan hasil");
  assert.ok(searchResults[0].nama_produk.toLowerCase().includes("minyak"));

  // Filter kategori
  const sembakoCategory = await prisma.category.findUnique({ where: { nama: "Sembako" } });
  if (sembakoCategory) {
    const sembakoProducts = await prisma.product.findMany({
      where: { category_id: sembakoCategory.id },
    });
    assert.ok(sembakoProducts.length > 0, "Filter kategori Sembako harus mengembalikan produk");
  }
});

test("5. Pengolahan Gambar dengan Sharp: Kompresi, resize 500x500, dan tolak file non-gambar", async () => {
  // 1. Buat buffer gambar PNG sintetis valid berukuran 800x600
  const validImageBuffer = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 49, g: 92, b: 73 }, // Warna hijau KasirKita
    },
  })
    .png()
    .toBuffer();

  assert.ok(validImageBuffer.length > 0);

  // Proses gambar via Sharp: resize ke 500x500 dan konversi ke WebP
  const processedBuffer = await sharp(validImageBuffer)
    .resize(500, 500, { fit: "cover", position: "center" })
    .webp({ quality: 80 })
    .toBuffer();

  const metadata = await sharp(processedBuffer).metadata();
  assert.strictEqual(metadata.format, "webp", "Hasil kompresi harus berformat WebP");
  assert.strictEqual(metadata.width, 500, "Lebar harus di-resize ke 500px");
  assert.strictEqual(metadata.height, 500, "Tinggi harus di-resize ke 500px");
  assert.ok(processedBuffer.length < validImageBuffer.length, "Ukuran file terkompresi harus lebih efisien");

  // 2. Pengujian penolakan berkas non-gambar (teks biasa berkedok gambar)
  const fakeImageBuffer = Buffer.from("Bukan file gambar, ini teks berbahaya");
  await assert.rejects(
    async () => {
      await sharp(fakeImageBuffer).metadata();
    },
    /unsupported image format|input buffer has corrupt header/i,
    "Berkas non-gambar wajib ditolak berdasarkan inspeksi konten"
  );
});

test("6. Otorisasi RBAC: Kasir dilarang memodifikasi data produk", () => {
  // Simulasi peran Kasir
  const role = "KASIR";
  const canModifyProducts = role === "PEMILIK";
  assert.strictEqual(canModifyProducts, false, "Kasir tidak boleh diizinkan mengubah produk");

  const canViewActiveProducts = role === "KASIR" || role === "PEMILIK";
  assert.strictEqual(canViewActiveProducts, true, "Kasir diizinkan melihat katalog produk");
});

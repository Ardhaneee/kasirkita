const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Memulai proses seeding data KasirKita...");

  // 1. Seed Store Setting (Pengaturan Toko)
  const storeSetting = await prisma.storeSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nama_toko: "Toko KasirKita Sejahtera",
      alamat: "Jl. Malioboro No. 45, Danurejan, Yogyakarta",
      no_telepon: "081234567890",
      pesan_kaki_struk: "Terima kasih telah berbelanja di Toko KasirKita Sejahtera! Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.",
      qris_image_path: "/images/qris-placeholder.png",
      default_lead_time_days: 3,
      default_safety_stock_percent: 20.00,
    },
  });
  console.log("✓ Store Setting berhasil disiapkan:", storeSetting.nama_toko);

  // 2. Seed Users (Pemilik dan Kasir)
  const saltRounds = 10;
  const hashPemilik = bcrypt.hashSync("pemilik123", saltRounds);
  const hashKasir = bcrypt.hashSync("kasir123", saltRounds);

  const pemilik = await prisma.user.upsert({
    where: { username: "pemilik" },
    update: {
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
  console.log(`✓ Akun berhasil disiapkan: ${pemilik.username} (${pemilik.role}), ${kasir.username} (${kasir.role})`);

  // 3. Seed Kategori Produk
  const categoriesData = [
    { nama: "Sembako", deskripsi: "Bahan pokok sembilan kebutuhan pokok rumah tangga" },
    { nama: "Makanan", deskripsi: "Makanan ringan, biskuit, dan mie instan" },
    { nama: "Minuman", deskripsi: "Minuman kemasan, kopi, teh, dan air mineral" },
    { nama: "Kebutuhan Rumah", deskripsi: "Sabun, deterjen, dan perlengkapan kebersihan" },
  ];

  const categories = {};
  for (const cat of categoriesData) {
    const createdCat = await prisma.category.upsert({
      where: { nama: cat.nama },
      update: { deskripsi: cat.deskripsi },
      create: cat,
    });
    categories[cat.nama] = createdCat.id;
  }
  console.log("✓ Kategori produk berhasil disiapkan:", Object.keys(categories).join(", "));

  // 4. Seed Produk UMKM Realistis
  const productsData = [
    {
      barcode: "8992741912014",
      nama_produk: "Minyak Goreng 2L Pouch",
      category_id: categories["Sembako"],
      harga_beli: 30000,
      harga_jual: 34000,
      stok: 24,
      stok_minimum: 5,
      satuan: "pouch",
      status_aktif: true,
    },
    {
      barcode: "8991001200055",
      nama_produk: "Beras Premium Ramos 5kg",
      category_id: categories["Sembako"],
      harga_beli: 65000,
      harga_jual: 72000,
      stok: 15,
      stok_minimum: 5,
      satuan: "sak",
      status_aktif: true,
    },
    {
      barcode: "8998009010012",
      nama_produk: "Gula Pasir Kristal Putih 1kg",
      category_id: categories["Sembako"],
      harga_beli: 15000,
      harga_jual: 17500,
      stok: 30,
      stok_minimum: 5,
      satuan: "bungkus",
      status_aktif: true,
    },
    {
      barcode: "8991002105421",
      nama_produk: "Kopi Bubuk Robusta 100g",
      category_id: categories["Minuman"],
      harga_beli: 11500,
      harga_jual: 14000,
      stok: 18,
      stok_minimum: 5,
      satuan: "bungkus",
      status_aktif: true,
    },
    {
      barcode: "8992745100021",
      nama_produk: "Teh Celup Melati Kotak 25s",
      category_id: categories["Minuman"],
      harga_beli: 6800,
      harga_jual: 8500,
      stok: 12,
      stok_minimum: 4,
      satuan: "kotak",
      status_aktif: true,
    },
    {
      barcode: "8999999001011",
      nama_produk: "Air Mineral Botol 600ml",
      category_id: categories["Minuman"],
      harga_beli: 2800,
      harga_jual: 3500,
      stok: 48,
      stok_minimum: 12,
      satuan: "botol",
      status_aktif: true,
    },
    {
      barcode: "8998866200225",
      nama_produk: "Mie Instan Goreng Spesial",
      category_id: categories["Makanan"],
      harga_beli: 2800,
      harga_jual: 3500,
      stok: 60,
      stok_minimum: 12,
      satuan: "bungkus",
      status_aktif: true,
    },
    {
      barcode: "8992775210041",
      nama_produk: "Biskuit Gandum Susu 200g",
      category_id: categories["Makanan"],
      harga_beli: 8500,
      harga_jual: 10500,
      stok: 10,
      stok_minimum: 3,
      satuan: "bungkus",
      status_aktif: true,
    },
    {
      barcode: "8993005120031",
      nama_produk: "Sabun Mandi Cair Refill 400ml",
      category_id: categories["Kebutuhan Rumah"],
      harga_beli: 18000,
      harga_jual: 22000,
      stok: 10,
      stok_minimum: 3,
      satuan: "pouch",
      status_aktif: true,
    },
    {
      barcode: "8991234567890",
      nama_produk: "Deterjen Bubuk Bersih 800g",
      category_id: categories["Kebutuhan Rumah"],
      harga_beli: 17000,
      harga_jual: 20500,
      stok: 8,
      stok_minimum: 2,
      satuan: "bungkus",
      status_aktif: true,
    },
  ];

  for (const prod of productsData) {
    await prisma.product.upsert({
      where: { barcode: prod.barcode },
      update: {
        nama_produk: prod.nama_produk,
        harga_beli: prod.harga_beli,
        harga_jual: prod.harga_jual,
        stok: prod.stok,
        stok_minimum: prod.stok_minimum,
        satuan: prod.satuan,
      },
      create: prod,
    });
  }
  console.log(`✓ ${productsData.length} produk retail UMKM berhasil di-seed.`);
  console.log("Seeding data KasirKita selesai dengan sukses!");
}

main()
  .catch((e) => {
    console.error("Gagal melakukan seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

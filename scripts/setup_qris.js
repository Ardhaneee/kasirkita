const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { PrismaClient } = require("@prisma/client");

async function setupQris() {
  const sourcePath =
    process.env.QRIS_SOURCE_PATH ||
    path.join(__dirname, "../public/images/qris-toko.png");
  const targetDir = path.join(__dirname, "../public/images");

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const qrisTokoPath = path.join(targetDir, "qris-toko.png");
  const qrisPlaceholderPath = path.join(targetDir, "qris-placeholder.png");

  // Proses gambar QRIS menjadi PNG tajam 600x600 berlatar putih bersih
  await sharp(sourcePath)
    .resize(600, 600, { fit: "contain", background: "#FFFFFF" })
    .png({ quality: 100 })
    .toFile(qrisTokoPath);

  // Duplikasi juga ke placeholder agar kompatibel dengan konfigurasi lama
  fs.copyFileSync(qrisTokoPath, qrisPlaceholderPath);

  console.log("✓ Gambar QRIS berhasil disimpan di:");
  console.log("  -", qrisTokoPath);
  console.log("  -", qrisPlaceholderPath);

  // Update record di database PostgreSQL
  const prisma = new PrismaClient();
  const updated = await prisma.storeSetting.updateMany({
    data: {
      qris_image_path: "/images/qris-toko.png",
    },
  });

  console.log("✓ Database StoreSetting berhasil diupdate:", updated);
  await prisma.$disconnect();
}

setupQris().catch((err) => {
  console.error("Kesalahan setup QRIS:", err);
  process.exit(1);
});

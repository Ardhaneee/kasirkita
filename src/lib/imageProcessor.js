import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const UPLOAD_DIR_RELATIVE = "public/uploads/products";

/**
 * Memproses, mengubah ukuran, mengompresi, dan menyimpan gambar produk.
 * @param {File|Blob|Buffer} file - Berkas gambar yang diunggah
 * @returns {Promise<{ success: boolean, imagePath?: string, error?: string }>}
 */
export async function processAndSaveProductImage(file) {
  if (!file) {
    return { success: false, error: "Tidak ada berkas yang diunggah." };
  }

  // 1. Dapatkan buffer dari file
  let buffer;
  if (typeof file.arrayBuffer === "function") {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } else if (Buffer.isBuffer(file)) {
    buffer = file;
  } else {
    return { success: false, error: "Format berkas tidak dikenali." };
  }

  // 2. Validasi ukuran berkas
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: "Ukuran gambar terlalu besar. Maksimal 2 MB.",
    };
  }

  if (buffer.length === 0) {
    return { success: false, error: "Berkas gambar kosong." };
  }

  try {
    // 3. Validasi tipe berkas berdasarkan konten biner via Sharp metadata (Bukan sekadar ekstensi nama)
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      return {
        success: false,
        error: "Jenis berkas tidak didukung. Harap unggah gambar JPG, PNG, atau WebP.",
      };
    }

    // 4. Pastikan direktori tujuan tersedia
    const uploadDirPath = path.resolve(process.cwd(), UPLOAD_DIR_RELATIVE);
    await fs.mkdir(uploadDirPath, { recursive: true });

    // 5. Buat nama berkas acak yang aman dan bebas karakter berbahaya (Anti Path Traversal)
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const safeFileName = `prod_${Date.now()}_${uniqueId}.webp`;
    const targetFilePath = path.join(uploadDirPath, safeFileName);

    // Verifikasi kembali path tujuan berada di dalam direktori uploads
    if (!targetFilePath.startsWith(uploadDirPath)) {
      return { success: false, error: "Upaya path traversal terdeteksi." };
    }

    // 6. Resize ke 500x500 (rasio 1:1) dan kompresi ke WebP kualitas 80
    await image
      .resize(500, 500, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 80 })
      .toFile(targetFilePath);

    // 7. Kembalikan URL publik relatif untuk disimpan ke database
    return {
      success: true,
      imagePath: `/uploads/products/${safeFileName}`,
    };
  } catch (err) {
    return {
      success: false,
      error: "Gagal memproses gambar. Pastikan berkas gambar valid dan tidak rusak.",
    };
  }
}

/**
 * Menghapus berkas gambar produk lama saat diperbarui.
 * @param {string|null} relativePath - Path relatif gambar (misal /uploads/products/prod_123.webp)
 */
export async function deleteProductImage(relativePath) {
  if (!relativePath || typeof relativePath !== "string") return;

  // Hanya izinkan penghapusan berkas di dalam direktori uploads/products
  if (!relativePath.startsWith("/uploads/products/")) return;

  try {
    const filename = path.basename(relativePath);
    const fullPath = path.resolve(process.cwd(), UPLOAD_DIR_RELATIVE, filename);
    const uploadDirPath = path.resolve(process.cwd(), UPLOAD_DIR_RELATIVE);

    if (fullPath.startsWith(uploadDirPath)) {
      await fs.unlink(fullPath);
    }
  } catch {
    // Abaikan jika berkas sudah tidak ada
  }
}

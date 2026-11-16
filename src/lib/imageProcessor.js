import sharp from "sharp";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { put, del } from "@vercel/blob";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);
const UPLOAD_DIR_RELATIVE = "public/uploads/products";

/**
 * Memproses, mengubah ukuran, mengompresi, dan menyimpan gambar produk.
 * Mendukung penyimpanan Vercel Blob Storage di cloud dan penyimpanan disk lokal saat development.
 * 
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

  // 2. Validasi ukuran berkas (Maksimal 2 MB)
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
    // 3. Validasi tipe berkas berdasarkan metadata biner via Sharp (Anti Ekstensi Palsu)
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
      return {
        success: false,
        error: "Jenis berkas tidak didukung. Harap unggah gambar JPG, PNG, atau WebP.",
      };
    }

    // 4. Buat nama berkas acak yang aman dan unik
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const safeFileName = `prod_${Date.now()}_${uniqueId}.webp`;

    // 5. Kompresi dan resize ke 500x500 (rasio 1:1) WebP kualitas 80 dalam memori
    const webpBuffer = await image
      .resize(500, 500, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: 80 })
      .toBuffer();

    // 6. Mode Penyimpanan: Vercel Blob di Serverless/Cloud ATAU Local Storage di Dev Offline
    if (process.env.VERCEL || process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      // Unggah langsung ke Vercel Blob Storage (mendukung OIDC otomatis maupun static token)
      const blob = await put(`products/${safeFileName}`, webpBuffer, {
        access: "public",
        contentType: "image/webp",
      });

      return {
        success: true,
        imagePath: blob.url,
      };
    }

    // Mode Fallback: Penyimpanan lokal di folder public/uploads/products/ (Development)
    const uploadDirPath = path.resolve(process.cwd(), UPLOAD_DIR_RELATIVE);
    await fs.mkdir(uploadDirPath, { recursive: true });

    const targetFilePath = path.join(uploadDirPath, safeFileName);

    // Verifikasi kembali path tujuan berada di dalam direktori uploads (Anti Path Traversal)
    if (!targetFilePath.startsWith(uploadDirPath)) {
      return { success: false, error: "Upaya path traversal terdeteksi." };
    }

    await fs.writeFile(targetFilePath, webpBuffer);

    return {
      success: true,
      imagePath: `/uploads/products/${safeFileName}`,
    };
  } catch (err) {
    console.error("Kesalahan pemrosesan berkas gambar:", err);
    return {
      success: false,
      error: `Gagal menyimpan gambar: ${err?.message || "Format tidak valid"}. Pastikan Blob Store di Vercel bertipe Public.`,
    };
  }
}

/**
 * Menghapus berkas gambar produk lama saat diperbarui atau dihapus.
 * Mendukung penghapusan dari Vercel Blob Storage maupun berkas lokal.
 * 
 * @param {string|null} relativePathOrUrl - URL Vercel Blob atau path relatif gambar lokal
 */
export async function deleteProductImage(relativePathOrUrl) {
  if (!relativePathOrUrl || typeof relativePathOrUrl !== "string") return;

  try {
    // 1. Penghapusan Vercel Blob Storage (Cloud)
    if (
      relativePathOrUrl.includes("blob.vercel-storage.com") ||
      relativePathOrUrl.startsWith("http://") ||
      relativePathOrUrl.startsWith("https://")
    ) {
      await del(relativePathOrUrl);
      return;
    }

    // 2. Penghapusan Berkas Lokal (Development)
    if (!relativePathOrUrl.startsWith("/uploads/products/")) return;

    const filename = path.basename(relativePathOrUrl);
    const fullPath = path.resolve(process.cwd(), UPLOAD_DIR_RELATIVE, filename);
    const uploadDirPath = path.resolve(process.cwd(), UPLOAD_DIR_RELATIVE);

    if (fullPath.startsWith(uploadDirPath)) {
      await fs.unlink(fullPath);
    }
  } catch {
    // Abaikan jika berkas sudah tidak ada atau terjadi kendala jaringan saat delete lama
  }
}

"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { productSchema, categorySchema } from "@/lib/validations";
import { processAndSaveProductImage, deleteProductImage } from "@/lib/imageProcessor";
import { revalidatePath } from "next/cache";

/**
 * Mengambil daftar produk dengan filter pencarian, kategori, dan status aktif.
 * Mengonversi tipe Decimal ke Number agar aman dikirim ke Client Components.
 */
export async function getProducts({ search = "", categoryId = "", statusAktif = "" } = {}) {
  const where = {};

  // Filter pencarian nama produk atau barcode/SKU
  if (search && search.trim() !== "") {
    const query = search.trim();
    where.OR = [
      { nama_produk: { contains: query, mode: "insensitive" } },
      { barcode: { contains: query, mode: "insensitive" } },
    ];
  }

  // Filter kategori
  if (categoryId && categoryId !== "ALL") {
    const catIdNum = Number(categoryId);
    if (!isNaN(catIdNum) && catIdNum > 0) {
      where.category_id = catIdNum;
    }
  }

  // Filter status aktif
  if (statusAktif === "true") {
    where.status_aktif = true;
  } else if (statusAktif === "false") {
    where.status_aktif = false;
  }

  const products = await db.product.findMany({
    where,
    include: {
      category: {
        select: { id: true, nama: true },
      },
    },
    orderBy: { created_at: "desc" },
  });

  return products.map((p) => ({
    ...p,
    harga_beli: Number(p.harga_beli),
    harga_jual: Number(p.harga_jual),
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  }));
}

/**
 * Mengambil daftar seluruh kategori produk beserta jumlah produk terkait.
 */
export async function getCategories() {
  const categories = await db.category.findMany({
    include: {
      _count: {
        select: { products: true },
      },
    },
    orderBy: { nama: "asc" },
  });

  return categories.map((c) => ({
    ...c,
    product_count: c._count.products,
    created_at: c.created_at.toISOString(),
    updated_at: c.updated_at.toISOString(),
  }));
}

/**
 * Server Action: Menambahkan produk baru (Khusus Role PEMILIK).
 */
export async function createProductAction(prevState, formData) {
  // 1. Guard Otorisasi Server-Side: Hanya PEMILIK yang diizinkan
  let session;
  try {
    session = await requireAuth(["PEMILIK"]);
  } catch {
    return {
      success: false,
      error: "Akses ditolak. Hanya Pemilik toko yang memiliki izin menambah produk.",
    };
  }

  // 2. Ekstrak dan validasi data menggunakan Zod
  const rawData = {
    nama_produk: formData.get("nama_produk")?.toString(),
    barcode: formData.get("barcode")?.toString(),
    category_id: formData.get("category_id"),
    harga_beli: formData.get("harga_beli"),
    harga_jual: formData.get("harga_jual"),
    stok: formData.get("stok"),
    stok_minimum: formData.get("stok_minimum") || 5,
    satuan: formData.get("satuan")?.toString() || "pcs",
    status_aktif: formData.get("status_aktif") === "true" || formData.get("status_aktif") === "on",
  };

  const validation = productSchema.safeParse(rawData);
  if (!validation.success) {
    const firstErrorMessage = validation.error.errors[0]?.message || "Data input tidak valid.";
    return { success: false, error: firstErrorMessage };
  }

  const validData = validation.data;

  try {
    // 3. Verifikasi ketiadaan duplikasi Barcode / SKU
    const existing = await db.product.findUnique({
      where: { barcode: validData.barcode },
    });

    if (existing) {
      return {
        success: false,
        error: `Barcode/SKU "${validData.barcode}" sudah terdaftar pada produk "${existing.nama_produk}".`,
      };
    }

    // 4. Verifikasi keberadaan Kategori
    const categoryExists = await db.category.findUnique({
      where: { id: validData.category_id },
    });

    if (!categoryExists) {
      return { success: false, error: "Kategori yang dipilih tidak ditemukan." };
    }

    // 5. Pemrosesan Gambar (jika ada file diunggah)
    let gambarPath = null;
    const imageFile = formData.get("gambar");
    if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
      const imageResult = await processAndSaveProductImage(imageFile);
      if (!imageResult.success) {
        return { success: false, error: imageResult.error };
      }
      gambarPath = imageResult.imagePath;
    }

    // 6. Simpan ke Database PostgreSQL dalam Transaksi Atomik beserta Mutasi Stok Awal
    await db.$transaction(async (tx) => {
      const newProduct = await tx.product.create({
        data: {
          nama_produk: validData.nama_produk,
          barcode: validData.barcode,
          category_id: validData.category_id,
          harga_beli: validData.harga_beli,
          harga_jual: validData.harga_jual,
          stok: validData.stok,
          stok_minimum: validData.stok_minimum,
          satuan: validData.satuan,
          gambar_path: gambarPath,
          status_aktif: validData.status_aktif,
        },
      });

      // Audit mutasi stok: Jika stok awal > 0, catat mutasi masuk
      if (validData.stok > 0) {
        await tx.stockMovement.create({
          data: {
            product_id: newProduct.id,
            user_id: session.userId,
            tipe_mutasi: "MASUK",
            jumlah: validData.stok,
            stok_awal: 0,
            stok_akhir: validData.stok,
            keterangan: "Stok awal produk baru",
          },
        });
      }
    });

    revalidatePath("/produk");
    revalidatePath("/pos");

    return { success: true, message: `Produk "${validData.nama_produk}" berhasil disimpan.` };
  } catch (error) {
    console.error("Gagal menyimpan produk:", error.message);
    return {
      success: false,
      error: "Terjadi gangguan sistem saat menyimpan produk. Silakan coba kembali.",
    };
  }
}

/**
 * Server Action: Memperbarui produk (Khusus Role PEMILIK).
 */
export async function updateProductAction(productId, prevState, formData) {
  // 1. Guard Otorisasi Server-Side
  let session;
  try {
    session = await requireAuth(["PEMILIK"]);
  } catch {
    return {
      success: false,
      error: "Akses ditolak. Hanya Pemilik toko yang memiliki izin mengubah produk.",
    };
  }

  const idNum = Number(productId);
  if (isNaN(idNum) || idNum <= 0) {
    return { success: false, error: "ID produk tidak valid." };
  }

  // 2. Ekstrak dan validasi data dengan Zod
  const rawData = {
    nama_produk: formData.get("nama_produk")?.toString(),
    barcode: formData.get("barcode")?.toString(),
    category_id: formData.get("category_id"),
    harga_beli: formData.get("harga_beli"),
    harga_jual: formData.get("harga_jual"),
    stok: formData.get("stok"),
    stok_minimum: formData.get("stok_minimum") || 5,
    satuan: formData.get("satuan")?.toString() || "pcs",
    status_aktif: formData.get("status_aktif") === "true" || formData.get("status_aktif") === "on",
  };

  const validation = productSchema.safeParse(rawData);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message };
  }

  const validData = validation.data;

  try {
    // 3. Pastikan produk yang ingin diubah benar-benar ada
    const currentProduct = await db.product.findUnique({
      where: { id: idNum },
    });

    if (!currentProduct) {
      return { success: false, error: "Produk tidak ditemukan." };
    }

    // 4. Verifikasi duplikasi Barcode / SKU terhadap produk lain
    const conflict = await db.product.findFirst({
      where: {
        barcode: validData.barcode,
        NOT: { id: idNum },
      },
    });

    if (conflict) {
      return {
        success: false,
        error: `Barcode/SKU "${validData.barcode}" sudah digunakan oleh produk lain.`,
      };
    }

    // 5. Penanganan Penggantian Gambar
    let gambarPath = currentProduct.gambar_path;
    const imageFile = formData.get("gambar");
    if (imageFile && typeof imageFile === "object" && imageFile.size > 0) {
      const imageResult = await processAndSaveProductImage(imageFile);
      if (!imageResult.success) {
        return { success: false, error: imageResult.error };
      }
      // Hapus berkas gambar lama jika sebelumnya ada
      if (currentProduct.gambar_path) {
        await deleteProductImage(currentProduct.gambar_path);
      }
      gambarPath = imageResult.imagePath;
    }

    // 6. Simpan perubahan ke PostgreSQL dalam Transaksi Atomik beserta Audit Mutasi Stok
    await db.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: idNum },
        data: {
          nama_produk: validData.nama_produk,
          barcode: validData.barcode,
          category_id: validData.category_id,
          harga_beli: validData.harga_beli,
          harga_jual: validData.harga_jual,
          stok: validData.stok,
          stok_minimum: validData.stok_minimum,
          satuan: validData.satuan,
          gambar_path: gambarPath,
          status_aktif: validData.status_aktif,
        },
      });

      // Audit mutasi stok: Pastikan perubahan stok via edit produk tidak pernah lolos tanpa mutasi
      if (validData.stok !== currentProduct.stok) {
        const diff = validData.stok - currentProduct.stok;
        await tx.stockMovement.create({
          data: {
            product_id: idNum,
            user_id: session.userId,
            tipe_mutasi: diff > 0 ? "MASUK" : "PENYESUAIAN",
            jumlah: Math.abs(diff),
            stok_awal: currentProduct.stok,
            stok_akhir: validData.stok,
            keterangan: `Penyesuaian stok via pembaruan data produk (${diff > 0 ? "+" : ""}${diff} ${validData.satuan})`,
          },
        });
      }
    });

    revalidatePath("/produk");
    revalidatePath("/pos");

    return { success: true, message: `Produk "${validData.nama_produk}" berhasil diperbarui.` };
  } catch (error) {
    console.error("Gagal memperbarui produk:", error.message);
    return { success: false, error: "Terjadi gangguan sistem saat memperbarui produk." };
  }
}

/**
 * Server Action: Menonaktifkan atau mengaktifkan produk (Soft Delete / Status Toggle).
 * Produk tidak dihapus fisik agar riwayat transaksi masa lalu tetap konsisten.
 */
export async function toggleProductStatusAction(productId) {
  try {
    await requireAuth(["PEMILIK"]);
  } catch {
    return { success: false, error: "Akses ditolak. Hanya Pemilik yang dapat mengubah status produk." };
  }

  const idNum = Number(productId);
  if (isNaN(idNum) || idNum <= 0) {
    return { success: false, error: "ID produk tidak valid." };
  }

  try {
    const product = await db.product.findUnique({
      where: { id: idNum },
    });

    if (!product) {
      return { success: false, error: "Produk tidak ditemukan." };
    }

    const updated = await db.product.update({
      where: { id: idNum },
      data: { status_aktif: !product.status_aktif },
    });

    revalidatePath("/produk");
    revalidatePath("/pos");

    const statusText = updated.status_aktif ? "diaktifkan" : "dinonaktifkan";
    return {
      success: true,
      status_aktif: updated.status_aktif,
      message: `Produk "${product.nama_produk}" berhasil ${statusText}.`,
    };
  } catch (error) {
    console.error("Gagal mengubah status produk:", error.message);
    return { success: false, error: "Gagal mengubah status produk." };
  }
}

/**
 * Server Action: Menambahkan kategori baru (Khusus Role PEMILIK).
 */
export async function createCategoryAction(prevState, formData) {
  try {
    await requireAuth(["PEMILIK"]);
  } catch {
    return { success: false, error: "Akses ditolak. Hanya Pemilik yang dapat menambah kategori." };
  }

  const rawData = {
    nama: formData.get("nama")?.toString(),
    deskripsi: formData.get("deskripsi")?.toString() || null,
  };

  const validation = categorySchema.safeParse(rawData);
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0]?.message };
  }

  const validData = validation.data;

  try {
    // Verifikasi duplikasi nama kategori
    const existing = await db.category.findUnique({
      where: { nama: validData.nama },
    });

    if (existing) {
      return {
        success: false,
        error: `Kategori dengan nama "${validData.nama}" sudah tersedia.`,
      };
    }

    await db.category.create({
      data: {
        nama: validData.nama,
        deskripsi: validData.deskripsi,
      },
    });

    revalidatePath("/produk");

    return { success: true, message: `Kategori "${validData.nama}" berhasil ditambahkan.` };
  } catch (error) {
    console.error("Gagal menambahkan kategori:", error.message);
    return { success: false, error: "Gagal menyimpan kategori baru." };
  }
}

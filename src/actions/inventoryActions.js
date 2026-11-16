"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { addStockSchema, adjustStockSchema } from "@/lib/validations";
import { calculateReorderPoint } from "@/lib/algorithms";
import { revalidatePath } from "next/cache";

/**
 * Mengambil ringkasan inventori, produk, status stok, dan kalkulasi ROP.
 */
export async function getInventoryData({
  search = "",
  categoryId = "",
  statusFilter = "ALL",
} = {}) {
  await requireAuth(["PEMILIK", "KASIR"]);

  const [categories, storeSettings, rawProducts, salesSummary] = await Promise.all([
    db.category.findMany({
      orderBy: { nama: "asc" },
      select: { id: true, nama: true },
    }),
    db.storeSetting.findFirst(),
    db.product.findMany({
      where: {
        status_aktif: true,
      },
      include: {
        category: {
          select: { id: true, nama: true },
        },
      },
      orderBy: {
        nama_produk: "asc",
      },
    }),
    // Hitung riwayat penjualan riil 30 hari terakhir dari transaksi selesai
    db.transactionItem.groupBy({
      by: ["product_id"],
      _sum: {
        kuantitas: true,
      },
      where: {
        transaction: {
          status_pembayaran: "SELESAI",
          tanggal_transaksi: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    }),
  ]);

  const defaultLeadTime = storeSettings?.default_lead_time_days || 3;
  const defaultSafetyPercent = Number(storeSettings?.default_safety_stock_percent) || 20;

  // Map kuantitas terjual riil
  const salesMap = new Map();
  for (const row of salesSummary) {
    salesMap.set(row.product_id, row._sum.kuantitas || 0);
  }

  // Hitung ROP dan status stok per produk
  let productsWithRop = rawProducts.map((p) => {
    const totalSold = salesMap.get(p.id) || 0;
    const ropInfo = calculateReorderPoint({
      currentStock: p.stok,
      totalSold,
      periodDays: 30,
      productLeadTime: p.lead_time_hari,
      defaultLeadTime,
      productSafetyStock: p.safety_stock,
      defaultSafetyStockPercent: defaultSafetyPercent,
      stokMinimum: p.stok_minimum,
    });

    let stockStatus = "AMAN";
    if (p.stok <= 0) {
      stockStatus = "HABIS";
    } else if (p.stok <= p.stok_minimum || p.stok <= ropInfo.rop) {
      stockStatus = "MENIPIS";
    }

    return {
      id: p.id,
      barcode: p.barcode,
      nama_produk: p.nama_produk,
      category_id: p.category_id,
      category_name: p.category?.nama || "-",
      satuan: p.satuan,
      stok: p.stok,
      stok_minimum: p.stok_minimum,
      harga_beli: Number(p.harga_beli),
      harga_jual: Number(p.harga_jual),
      lead_time_hari: p.lead_time_hari,
      safety_stock: p.safety_stock,
      stockStatus,
      ropInfo,
    };
  });

  // Terapkan filter pencarian nama atau barcode
  if (search && search.trim() !== "") {
    const q = search.trim().toLowerCase();
    productsWithRop = productsWithRop.filter(
      (p) =>
        p.nama_produk.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
    );
  }

  // Filter kategori
  if (categoryId && categoryId !== "ALL") {
    const catIdNum = Number(categoryId);
    if (!isNaN(catIdNum) && catIdNum > 0) {
      productsWithRop = productsWithRop.filter((p) => p.category_id === catIdNum);
    }
  }

  // Filter status stok (ALL, AMAN, MENIPIS, HABIS)
  if (statusFilter && statusFilter !== "ALL") {
    productsWithRop = productsWithRop.filter((p) => p.stockStatus === statusFilter);
  }

  return {
    products: productsWithRop,
    categories,
    storeSettings: {
      nama_toko: storeSettings?.nama_toko || "KasirKita",
      default_lead_time_days: defaultLeadTime,
      default_safety_stock_percent: defaultSafetyPercent,
    },
  };
}

/**
 * Server Action: Menambah stok barang masuk (Restok / Pembelian).
 * Khusus Role PEMILIK. Menggunakan transaksi atomik PostgreSQL.
 */
export async function addStockAction(payload) {
  let session;
  try {
    session = await requireAuth(["PEMILIK"]);
  } catch {
    return {
      success: false,
      error: "Akses ditolak. Hanya Pemilik toko yang berwenang menambah stok barang masuk.",
    };
  }

  const parseResult = addStockSchema.safeParse(payload);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.errors[0]?.message || "Data penambahan stok tidak valid.",
    };
  }

  const { productId, jumlah, keterangan } = parseResult.data;

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Ambil produk saat ini dan kunci baris untuk konsistensi konkurensi
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error(`Produk dengan ID #${productId} tidak ditemukan.`);
      }

      if (!product.status_aktif) {
        throw new Error(`Produk "${product.nama_produk}" saat ini tidak aktif.`);
      }

      const stokAwal = product.stok;
      const stokAkhir = stokAwal + jumlah;

      // 2. Tambah stok secara atomik
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          stok: { increment: jumlah },
          updated_at: new Date(),
        },
      });

      // 3. Catat audit log pada tabel stock_movements
      const note = keterangan?.trim() || "Penambahan stok barang masuk (Restok)";
      const movement = await tx.stockMovement.create({
        data: {
          product_id: productId,
          user_id: session.userId,
          tipe_mutasi: "MASUK",
          jumlah,
          stok_awal: stokAwal,
          stok_akhir: stokAkhir,
          keterangan: note,
        },
      });

      return {
        product: updatedProduct,
        movement,
      };
    });

    revalidatePath("/stok");
    revalidatePath("/produk");
    revalidatePath("/pos");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Berhasil menambahkan +${jumlah} ${result.product.satuan} stok untuk "${result.product.nama_produk}". Stok sekarang: ${result.product.stok} ${result.product.satuan}.`,
      stokBaru: result.product.stok,
    };
  } catch (error) {
    console.error("Gagal menambah stok:", error);
    return {
      success: false,
      error: error.message || "Terjadi kesalahan internal saat menambah stok.",
    };
  }
}

/**
 * Server Action: Melakukan penyesuaian stok fisik (Opname / Rusak / Hilang / Koreksi).
 * Khusus Role PEMILIK. Menggunakan transaksi atomik PostgreSQL.
 */
export async function adjustStockAction(payload) {
  let session;
  try {
    session = await requireAuth(["PEMILIK"]);
  } catch {
    return {
      success: false,
      error: "Akses ditolak. Hanya Pemilik toko yang berwenang melakukan penyesuaian stok.",
    };
  }

  const parseResult = adjustStockSchema.safeParse(payload);
  if (!parseResult.success) {
    return {
      success: false,
      error: parseResult.error.errors[0]?.message || "Data penyesuaian stok tidak valid.",
    };
  }

  const { productId, stokFisik, alasan, kategoriAlasan } = parseResult.data;

  try {
    const result = await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        throw new Error(`Produk dengan ID #${productId} tidak ditemukan.`);
      }

      const stokAwal = product.stok;
      const stokAkhir = stokFisik;
      const selisih = stokAkhir - stokAwal;

      // Jika stok fisik sama persis dengan stok tercatat (selisih 0),
      // tidak perlu mencatat mutasi fiktif yang menyesatkan.
      if (selisih === 0) {
        return {
          product,
          selisih: 0,
          noChange: true,
        };
      }

      // 1. Perbarui stok fisik aktual
      const updatedProduct = await tx.product.update({
        where: { id: productId },
        data: {
          stok: stokFisik,
          updated_at: new Date(),
        },
      });

      // 2. Catat riwayat mutasi penyesuaian
      const labelKategori = {
        STOK_OPNAME: "Stok Opname",
        BARANG_RUSAK: "Barang Rusak",
        BARANG_HILANG: "Barang Hilang / Expired",
        KOREKSI_CATATAN: "Koreksi Catatan",
        LAINNYA: "Penyesuaian Fisik",
      }[kategoriAlasan] || "Penyesuaian Fisik";

      const signStr = selisih > 0 ? `+${selisih}` : `${selisih}`;
      const keteranganLengkap = `[${labelKategori}] ${alasan.trim()} (${signStr} ${product.satuan})`;

      const movement = await tx.stockMovement.create({
        data: {
          product_id: productId,
          user_id: session.userId,
          tipe_mutasi: "PENYESUAIAN",
          jumlah: Math.abs(selisih),
          stok_awal: stokAwal,
          stok_akhir: stokAkhir,
          keterangan: keteranganLengkap,
        },
      });

      return {
        product: updatedProduct,
        movement,
        selisih,
        noChange: false,
      };
    });

    if (result.noChange) {
      return {
        success: true,
        message: `Stok fisik "${result.product.nama_produk}" sudah sesuai (${result.product.stok} ${result.product.satuan}). Tidak ada perubahan stok atau mutasi baru yang dicatat.`,
        stokBaru: result.product.stok,
      };
    }

    revalidatePath("/stok");
    revalidatePath("/produk");
    revalidatePath("/pos");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `Stok fisik "${result.product.nama_produk}" berhasil disesuaikan dari ${result.movement.stok_awal} menjadi ${result.movement.stok_akhir} ${result.product.satuan} (${result.selisih >= 0 ? "+" : ""}${result.selisih}).`,
      stokBaru: result.product.stok,
    };
  } catch (error) {
    console.error("Gagal menyesuaikan stok:", error);
    return {
      success: false,
      error: error.message || "Terjadi kesalahan internal saat menyesuaikan stok.",
    };
  }
}

/**
 * Server Action: Mengambil riwayat mutasi stok dari tabel stock_movements.
 * Khusus Role PEMILIK (Kasir tidak memiliki hak akses data audit mutasi).
 */
export async function getStockMovementsAction({
  productId = "ALL",
  tipeMutasi = "ALL",
  limit = 100,
} = {}) {
  await requireAuth(["PEMILIK"]);

  const where = {};

  if (productId && productId !== "ALL") {
    const pIdNum = Number(productId);
    if (!isNaN(pIdNum) && pIdNum > 0) {
      where.product_id = pIdNum;
    }
  }

  if (tipeMutasi && tipeMutasi !== "ALL") {
    where.tipe_mutasi = tipeMutasi;
  }

  const movements = await db.stockMovement.findMany({
    where,
    include: {
      product: {
        select: {
          id: true,
          barcode: true,
          nama_produk: true,
          satuan: true,
        },
      },
      user: {
        select: {
          id: true,
          nama: true,
          username: true,
          role: true,
        },
      },
    },
    orderBy: {
      created_at: "desc",
    },
    take: limit,
  });

  return movements.map((m) => ({
    id: m.id,
    product_id: m.product_id,
    nama_produk: m.product?.nama_produk || "Produk Dihapus",
    barcode: m.product?.barcode || "-",
    satuan: m.product?.satuan || "pcs",
    user_nama: m.user?.nama || "Sistem",
    user_role: m.user?.role || "-",
    tipe_mutasi: m.tipe_mutasi,
    jumlah: m.jumlah,
    stok_awal: m.stok_awal,
    stok_akhir: m.stok_akhir,
    referensi_nomor: m.referensi_nomor,
    keterangan: m.keterangan || "-",
    created_at: m.created_at.toISOString(),
  }));
}

/**
 * Server Action: Mengambil seluruh rekomendasi restok ROP yang diurutkan berdasarkan urgensi.
 * Khusus Role PEMILIK (Kasir tidak berwenang mengelola pembelian / restok barang).
 */
export async function getRestockRecommendationsAction() {
  await requireAuth(["PEMILIK"]);

  const [products, storeSettings, salesSummary] = await Promise.all([
    db.product.findMany({
      where: { status_aktif: true },
      include: { category: { select: { nama: true } } },
      orderBy: { nama_produk: "asc" },
    }),
    db.storeSetting.findFirst(),
    db.transactionItem.groupBy({
      by: ["product_id"],
      _sum: { kuantitas: true },
      where: {
        transaction: {
          status_pembayaran: "SELESAI",
          tanggal_transaksi: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      },
    }),
  ]);

  const defaultLeadTime = storeSettings?.default_lead_time_days || 3;
  const defaultSafetyPercent = Number(storeSettings?.default_safety_stock_percent) || 20;

  const salesMap = new Map();
  for (const s of salesSummary) {
    salesMap.set(s.product_id, s._sum.kuantitas || 0);
  }

  const recommendations = products.map((p) => {
    const totalSold = salesMap.get(p.id) || 0;
    const ropInfo = calculateReorderPoint({
      currentStock: p.stok,
      totalSold,
      periodDays: 30,
      productLeadTime: p.lead_time_hari,
      defaultLeadTime,
      productSafetyStock: p.safety_stock,
      defaultSafetyStockPercent: defaultSafetyPercent,
      stokMinimum: p.stok_minimum,
    });

    return {
      productId: p.id,
      barcode: p.barcode,
      nama_produk: p.nama_produk,
      category_name: p.category?.nama || "-",
      satuan: p.satuan,
      stok_aktual: p.stok,
      stok_minimum: p.stok_minimum,
      total_terjual_30hr: totalSold,
      harga_beli: Number(p.harga_beli),
      ...ropInfo,
    };
  });

  // Urutkan berdasarkan level urgensi tertinggi (3 = Habis, 2 = Perlu Restok, dst.)
  recommendations.sort((a, b) => b.urgencyLevel - a.urgencyLevel || a.currentStock - b.currentStock);

  return recommendations;
}

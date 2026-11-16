"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { checkoutSchema } from "@/lib/validations";
import { calculateChangeBreakdown } from "@/lib/algorithms";
import { revalidatePath } from "next/cache";

/**
 * Serialisasi data transaksi dan items agar aman dikirim ke Client Component (konversi Prisma Decimal ke Number).
 */
function serializeTransaction(tx) {
  return {
    ...tx,
    subtotal: Number(tx.subtotal),
    discount_amount: Number(tx.discount_amount),
    total_belanja: Number(tx.total_belanja),
    nominal_bayar: Number(tx.nominal_bayar),
    kembalian: Number(tx.kembalian),
    items: tx.items
      ? tx.items.map((item) => ({
          ...item,
          harga_beli_snapshot: Number(item.harga_beli_snapshot),
          harga_jual_snapshot: Number(item.harga_jual_snapshot),
          subtotal: Number(item.subtotal),
        }))
      : [],
  };
}

/**
 * Mengambil daftar seluruh produk yang aktif untuk ditampilkan di katalog POS.
 */
export async function getActiveProductsForPOS() {
  await requireAuth(["PEMILIK", "KASIR"]);

  const products = await db.product.findMany({
    where: {
      status_aktif: true,
    },
    include: {
      category: {
        select: {
          id: true,
          nama: true,
        },
      },
    },
    orderBy: {
      nama_produk: "asc",
    },
  });

  return products.map((p) => ({
    ...p,
    harga_beli: Number(p.harga_beli),
    harga_jual: Number(p.harga_jual),
  }));
}

/**
 * Mengambil pengaturan toko untuk ditampilkan pada kop struk nota dan dialog QRIS.
 */
export async function getStoreSettings() {
  await requireAuth(["PEMILIK", "KASIR"]);

  let settings = await db.storeSetting.findFirst();

  if (!settings) {
    settings = await db.storeSetting.create({
      data: {
        nama_toko: "KasirKita Retail UMKM",
        alamat: "Jl. Margonda Raya No. 123, Depok, Jawa Barat",
        no_telepon: "0812-3456-7890",
        pesan_kaki_struk: "Terima kasih atas kunjungan Anda! Barang yang sudah dibeli tidak dapat ditukar kembali.",
      },
    });
  }

  return {
    ...settings,
    qris_image_path: settings.qris_image_path || "/images/qris-toko.png",
    default_safety_stock_percent: Number(settings.default_safety_stock_percent),
  };
}

/**
 * Menghasilkan invoice number unik harian.
 * Format: INV-YYYYMMDD-XXXX (4 karakter angka/alfanumerik unik).
 */
function generateInvoiceNumber() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}${month}${date}-${randomPart}`;
}

/**
 * Server Action untuk memproses transaksi kasir (Checkout POS).
 * Menjamin sifat ACID melalui Prisma interactive transaction ($transaction),
 * idempotency key untuk mencegah double-charge, snapshot harga riil, dan pemotongan stok atomik.
 */
export async function checkoutAction(payload) {
  const session = await requireAuth(["PEMILIK", "KASIR"]);

  const parseResult = checkoutSchema.safeParse(payload);
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues[0]?.message || "Data checkout tidak valid.";
    return { success: false, error: errorMsg };
  }

  const { idempotencyKey, items, discountAmount, paymentMethod, cashReceived, notes } =
    parseResult.data;

  try {
    // 1. Cek Idempotency Key Sebelum Memulai Transaksi Baru
    const existingTx = await db.transaction.findUnique({
      where: { idempotency_key: idempotencyKey },
      include: {
        items: true,
        user: { select: { id: true, nama: true, username: true } },
      },
    });

    if (existingTx) {
      // Transaksi sudah pernah berhasil dieksekusi sebelumnya.
      // Mengembalikan data transaksi sebelumnya tanpa memotong stok lagi (Idempotent Safe).
      return {
        success: true,
        isIdempotentReplay: true,
        transaction: serializeTransaction(existingTx),
        changeBreakdown: calculateChangeBreakdown(Number(existingTx.kembalian)),
      };
    }

    // 2. Jalankan Transaksi Atomik Database (ACID)
    const result = await db.$transaction(async (tx) => {
      // Double check idempotency dalam scope transaksi terisolasi
      const checkInsideTx = await tx.transaction.findUnique({
        where: { idempotency_key: idempotencyKey },
        include: {
          items: true,
          user: { select: { id: true, nama: true, username: true } },
        },
      });

      if (checkInsideTx) {
        return {
          isIdempotentReplay: true,
          transaction: serializeTransaction(checkInsideTx),
        };
      }

      // Ambil seluruh data produk yang dibeli
      const productIds = items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
        },
      });

      const productMap = new Map(products.map((p) => [p.id, p]));

      let calculatedSubtotal = 0;
      let totalQty = 0;
      const itemsToInsert = [];
      const stockMovementsToInsert = [];

      for (const item of items) {
        const product = productMap.get(item.productId);

        if (!product) {
          throw new Error(`Produk dengan ID #${item.productId} tidak ditemukan.`);
        }

        if (!product.status_aktif) {
          throw new Error(`Produk "${product.nama_produk}" saat ini tidak aktif.`);
        }

        if (product.stok < item.quantity) {
          throw new Error(
            `Stok untuk "${product.nama_produk}" tidak mencukupi (Tersedia: ${product.stok}, Diminta: ${item.quantity}).`
          );
        }

        // Pemotongan stok atomik dengan kondisi `WHERE id = ... AND stok >= ...`
        // Menjamin anti-negative stock dan aman dari race condition konkurensi kasir ganda
        const rowsAffected = await tx.$executeRaw`
          UPDATE "products"
          SET "stok" = "stok" - ${item.quantity}, "updated_at" = NOW()
          WHERE "id" = ${item.productId} AND "stok" >= ${item.quantity}
        `;

        if (rowsAffected === 0) {
          throw new Error(
            `Gagal memotong stok untuk "${product.nama_produk}". Stok mungkin telah berubah secara bersamaan.`
          );
        }

        const itemSubtotal = Number(product.harga_jual) * item.quantity;
        calculatedSubtotal += itemSubtotal;
        totalQty += item.quantity;

        itemsToInsert.push({
          product_id: product.id,
          nama_produk_snapshot: product.nama_produk,
          harga_beli_snapshot: product.harga_beli,
          harga_jual_snapshot: product.harga_jual,
          kuantitas: item.quantity,
          subtotal: itemSubtotal,
        });

        stockMovementsToInsert.push({
          productId: product.id,
          stokAwal: product.stok,
          stokAkhir: product.stok - item.quantity,
          quantity: item.quantity,
        });
      }

      // Perhitungan diskon dan total belanja
      const validDiscount = Math.min(discountAmount, calculatedSubtotal);
      const calculatedTotalBelanja = calculatedSubtotal - validDiscount;

      let finalNominalBayar = cashReceived;
      let calculatedKembalian = 0;

      if (paymentMethod === "TUNAI") {
        if (cashReceived < calculatedTotalBelanja) {
          throw new Error(
            `Nominal bayar tunai (Rp ${cashReceived.toLocaleString("id-ID")}) kurang dari total belanja (Rp ${calculatedTotalBelanja.toLocaleString("id-ID")}).`
          );
        }
        calculatedKembalian = cashReceived - calculatedTotalBelanja;
      } else if (paymentMethod === "QRIS") {
        // Pembayaran non-tunai QRIS menerima nominal pas
        finalNominalBayar = calculatedTotalBelanja;
        calculatedKembalian = 0;
      }

      // Buat nomor invoice unik (retry sekali jika terjadi kebetulan nomor sama)
      let invoiceNumber = generateInvoiceNumber();
      const existingInvoice = await tx.transaction.findUnique({
        where: { invoice_number: invoiceNumber },
      });
      if (existingInvoice) {
        invoiceNumber = `${generateInvoiceNumber()}-${Math.floor(10 + Math.random() * 90)}`;
      }

      // Simpan Header Transaksi dan Item Transaksi
      const newTransaction = await tx.transaction.create({
        data: {
          invoice_number: invoiceNumber,
          idempotency_key: idempotencyKey,
          user_id: session.userId,
          total_item: totalQty,
          subtotal: calculatedSubtotal,
          discount_amount: validDiscount,
          total_belanja: calculatedTotalBelanja,
          nominal_bayar: finalNominalBayar,
          kembalian: calculatedKembalian,
          metode_pembayaran: paymentMethod,
          status_pembayaran: "SELESAI",
          catatan: notes?.trim() || null,
          items: {
            create: itemsToInsert,
          },
        },
        include: {
          items: true,
          user: { select: { id: true, nama: true, username: true } },
        },
      });

      // Simpan Audit Log Mutasi Stok (Stock Movement)
      for (const sm of stockMovementsToInsert) {
        await tx.stockMovement.create({
          data: {
            product_id: sm.productId,
            user_id: session.userId,
            tipe_mutasi: "PENJUALAN",
            jumlah: sm.quantity,
            stok_awal: sm.stokAwal,
            stok_akhir: sm.stokAkhir,
            referensi_nomor: invoiceNumber,
            keterangan: `Penjualan Kasir - Invoice ${invoiceNumber}`,
          },
        });
      }

      return {
        isIdempotentReplay: false,
        transaction: serializeTransaction(newTransaction),
      };
    });

    // Revalidasi cache halaman Next.js
    revalidatePath("/pos");
    revalidatePath("/produk");
    revalidatePath("/dashboard");

    const changeBreakdown = calculateChangeBreakdown(result.transaction.kembalian);

    return {
      success: true,
      isIdempotentReplay: result.isIdempotentReplay,
      transaction: result.transaction,
      changeBreakdown,
    };
  } catch (error) {
    console.error("Kesalahan pada checkoutAction:", error);
    return {
      success: false,
      error: error.message || "Terjadi kesalahan internal saat memproses transaksi.",
    };
  }
}

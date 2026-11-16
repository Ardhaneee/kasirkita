import { z } from "zod";

/**
 * Skema validasi untuk data produk retail UMKM.
 */
export const productSchema = z.object({
  nama_produk: z
    .string({ required_error: "Nama produk wajib diisi." })
    .trim()
    .min(3, { message: "Nama produk minimal 3 karakter." })
    .max(150, { message: "Nama produk maksimal 150 karakter." }),

  barcode: z
    .string({ required_error: "Barcode/SKU wajib diisi." })
    .trim()
    .min(3, { message: "Barcode/SKU minimal 3 karakter." })
    .max(50, { message: "Barcode/SKU maksimal 50 karakter." })
    .regex(/^[A-Za-z0-9_-]+$/, {
      message: "Barcode/SKU hanya boleh berupa huruf, angka, garis bawah, atau strip.",
    }),

  category_id: z.coerce
    .number({ required_error: "Kategori produk wajib dipilih." })
    .int({ message: "ID kategori harus berupa bilangan bulat." })
    .positive({ message: "Kategori yang dipilih tidak valid." }),

  harga_beli: z.coerce
    .number({ required_error: "Harga beli wajib diisi." })
    .min(0, { message: "Harga beli tidak boleh bernilai negatif." }),

  harga_jual: z.coerce
    .number({ required_error: "Harga jual wajib diisi." })
    .min(0, { message: "Harga jual tidak boleh bernilai negatif." }),

  stok: z.coerce
    .number({ required_error: "Stok produk wajib diisi." })
    .int({ message: "Stok harus berupa bilangan bulat." })
    .min(0, { message: "Stok tidak boleh bernilai negatif." }),

  stok_minimum: z.coerce
    .number()
    .int({ message: "Batas minimum stok harus berupa bilangan bulat." })
    .min(0, { message: "Batas minimum stok tidak boleh negatif." })
    .default(5),

  satuan: z
    .string()
    .trim()
    .min(1, { message: "Satuan produk wajib diisi." })
    .max(20, { message: "Satuan maksimal 20 karakter." })
    .default("pcs"),

  status_aktif: z.coerce.boolean().default(true),
});

/**
 * Skema validasi untuk data kategori produk.
 */
export const categorySchema = z.object({
  nama: z
    .string({ required_error: "Nama kategori wajib diisi." })
    .trim()
    .min(2, { message: "Nama kategori minimal 2 karakter." })
    .max(50, { message: "Nama kategori maksimal 50 karakter." }),

  deskripsi: z
    .string()
    .trim()
    .max(255, { message: "Deskripsi maksimal 255 karakter." })
    .optional()
    .nullable(),
});

/**
 * Skema validasi untuk transaksi checkout kasir (POS).
 */
export const checkoutItemSchema = z.object({
  productId: z.coerce.number().int().positive({ message: "ID produk tidak valid." }),
  quantity: z.coerce.number().int().positive({ message: "Kuantitas minimal 1." }),
});

export const checkoutSchema = z.object({
  idempotencyKey: z
    .string({ required_error: "Idempotency key wajib disertakan." })
    .min(5, { message: "Idempotency key tidak valid." })
    .max(100),
  items: z
    .array(checkoutItemSchema)
    .min(1, { message: "Keranjang belanja tidak boleh kosong." }),
  discountAmount: z.coerce
    .number()
    .min(0, { message: "Diskon tidak boleh bernilai negatif." })
    .default(0),
  paymentMethod: z.enum(["TUNAI", "QRIS"], {
    errorMap: () => ({ message: "Metode pembayaran harus TUNAI atau QRIS." }),
  }),
  cashReceived: z.coerce
    .number()
    .min(0, { message: "Nominal bayar tidak boleh bernilai negatif." }),
  notes: z
    .string()
    .max(500, { message: "Catatan maksimal 500 karakter." })
    .optional()
    .nullable(),
});

/**
 * Skema validasi untuk penambahan stok barang masuk (Restok / Pembelian).
 */
export const addStockSchema = z.object({
  productId: z.coerce
    .number({ required_error: "Produk wajib dipilih." })
    .int({ message: "ID produk harus berupa bilangan bulat." })
    .positive({ message: "Produk yang dipilih tidak valid." }),

  jumlah: z.coerce
    .number({ required_error: "Jumlah stok masuk wajib diisi." })
    .int({ message: "Jumlah stok harus berupa bilangan bulat." })
    .positive({ message: "Jumlah stok masuk harus berupa bilangan bulat positif (lebih dari 0)." }),

  keterangan: z
    .string()
    .trim()
    .max(255, { message: "Keterangan maksimal 255 karakter." })
    .optional()
    .nullable(),
});

/**
 * Skema validasi untuk penyesuaian stok fisik (Opname / Rusak / Hilang / Koreksi).
 */
export const adjustStockSchema = z.object({
  productId: z.coerce
    .number({ required_error: "Produk wajib dipilih." })
    .int({ message: "ID produk harus berupa bilangan bulat." })
    .positive({ message: "Produk yang dipilih tidak valid." }),

  stokFisik: z.coerce
    .number({ required_error: "Stok fisik aktual wajib diisi." })
    .int({ message: "Stok fisik harus berupa bilangan bulat." })
    .min(0, { message: "Stok fisik tidak boleh bernilai negatif." }),

  alasan: z
    .string({ required_error: "Alasan penyesuaian wajib diisi." })
    .trim()
    .min(3, { message: "Alasan penyesuaian minimal 3 karakter." })
    .max(255, { message: "Alasan penyesuaian maksimal 255 karakter." }),

  kategoriAlasan: z
    .enum(["STOK_OPNAME", "BARANG_RUSAK", "BARANG_HILANG", "KOREKSI_CATATAN", "LAINNYA"], {
      errorMap: () => ({ message: "Kategori alasan penyesuaian tidak valid." }),
    })
    .optional()
    .default("STOK_OPNAME"),
});

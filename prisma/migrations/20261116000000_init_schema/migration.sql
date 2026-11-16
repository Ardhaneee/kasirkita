-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "nama" VARCHAR(100) NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "status_aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "nama" VARCHAR(50) NOT NULL,
    "deskripsi" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "barcode" VARCHAR(50) NOT NULL,
    "nama_produk" VARCHAR(150) NOT NULL,
    "harga_beli" DECIMAL(12,2) NOT NULL,
    "harga_jual" DECIMAL(12,2) NOT NULL,
    "stok" INTEGER NOT NULL DEFAULT 0,
    "stok_minimum" INTEGER NOT NULL DEFAULT 5,
    "lead_time_hari" INTEGER,
    "safety_stock" INTEGER,
    "satuan" VARCHAR(20) NOT NULL DEFAULT 'pcs',
    "gambar_path" VARCHAR(255),
    "status_aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" SERIAL NOT NULL,
    "invoice_number" VARCHAR(50) NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tanggal_transaksi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_item" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "total_belanja" DECIMAL(12,2) NOT NULL,
    "nominal_bayar" DECIMAL(12,2) NOT NULL,
    "kembalian" DECIMAL(12,2) NOT NULL,
    "metode_pembayaran" VARCHAR(20) NOT NULL,
    "status_pembayaran" VARCHAR(20) NOT NULL DEFAULT 'SELESAI',
    "catatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" SERIAL NOT NULL,
    "transaction_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "nama_produk_snapshot" VARCHAR(150) NOT NULL,
    "harga_beli_snapshot" DECIMAL(12,2) NOT NULL,
    "harga_jual_snapshot" DECIMAL(12,2) NOT NULL,
    "kuantitas" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "tipe_mutasi" VARCHAR(20) NOT NULL,
    "jumlah" INTEGER NOT NULL,
    "stok_awal" INTEGER NOT NULL,
    "stok_akhir" INTEGER NOT NULL,
    "referensi_nomor" VARCHAR(50),
    "keterangan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" SERIAL NOT NULL,
    "nama_toko" VARCHAR(100) NOT NULL,
    "alamat" TEXT NOT NULL,
    "no_telepon" VARCHAR(30) NOT NULL,
    "pesan_kaki_struk" VARCHAR(255),
    "qris_image_path" VARCHAR(255),
    "default_lead_time_days" INTEGER NOT NULL DEFAULT 3,
    "default_safety_stock_percent" DECIMAL(5,2) NOT NULL DEFAULT 20.00,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_metrics" (
    "id" SERIAL NOT NULL,
    "cpu_usage_percent" DECIMAL(5,2) NOT NULL,
    "memory_rss_mb" DECIMAL(8,2) NOT NULL,
    "memory_heap_used_mb" DECIMAL(8,2) NOT NULL,
    "uptime_seconds" INTEGER NOT NULL,
    "avg_response_time_ms" DECIMAL(8,2) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_logs" (
    "id" SERIAL NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "status_code" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "details_json" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "categories_nama_key" ON "categories"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_invoice_number_key" ON "transactions"("invoice_number");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL Engine Check Constraints (BNSP Proof & ACID Guarantees)
ALTER TABLE "products" ADD CONSTRAINT "chk_product_stock_non_negative" CHECK ("stok" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_product_harga_beli_non_negative" CHECK ("harga_beli" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "chk_product_harga_jual_non_negative" CHECK ("harga_jual" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "chk_transaction_total_item_positive" CHECK ("total_item" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "chk_transaction_subtotal_non_negative" CHECK ("subtotal" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "chk_transaction_discount_non_negative" CHECK ("discount_amount" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "chk_transaction_total_belanja_non_negative" CHECK ("total_belanja" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "chk_transaction_nominal_bayar_non_negative" CHECK ("nominal_bayar" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT "chk_transaction_kembalian_non_negative" CHECK ("kembalian" >= 0);
ALTER TABLE "transaction_items" ADD CONSTRAINT "chk_item_kuantitas_positive" CHECK ("kuantitas" > 0);
ALTER TABLE "transaction_items" ADD CONSTRAINT "chk_item_subtotal_non_negative" CHECK ("subtotal" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "chk_user_role" CHECK ("role" IN ('PEMILIK', 'KASIR'));
ALTER TABLE "transactions" ADD CONSTRAINT "chk_transaction_metode" CHECK ("metode_pembayaran" IN ('TUNAI', 'QRIS'));
ALTER TABLE "stock_movements" ADD CONSTRAINT "chk_stock_movement_tipe" CHECK ("tipe_mutasi" IN ('MASUK', 'KELUAR', 'PENYESUAIAN', 'PENJUALAN'));

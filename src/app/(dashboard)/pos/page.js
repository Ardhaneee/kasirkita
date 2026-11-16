import { requireAuth } from "@/lib/auth";
import { getActiveProductsForPOS, getStoreSettings } from "@/actions/posActions";
import { getCategories } from "@/actions/productActions";
import PosClient from "./PosClient";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  // Guard Otentikasi & Otorisasi Sisi Server (Bisa diakses Kasir dan Pemilik)
  const session = await requireAuth(["PEMILIK", "KASIR"]);

  // Ambil data produk aktif, kategori, dan pengaturan toko secara paralel
  const [products, categories, storeSettings] = await Promise.all([
    getActiveProductsForPOS(),
    getCategories(),
    getStoreSettings(),
  ]);

  return (
    <div className="space-y-4">
      {/* Header Halaman POS */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 no-print">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Kasir (Point of Sale)
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Pencatatan transaksi ritel, kalkulasi otomatis, dan cetak struk nota UMKM.
          </p>
        </div>
      </div>

      {/* Komponen Utama Interaktif POS */}
      <PosClient
        initialProducts={products}
        initialCategories={categories}
        storeSettings={storeSettings}
        currentUser={session}
      />
    </div>
  );
}

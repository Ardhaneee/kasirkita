import { requireAuth } from "@/lib/auth";
import { getProducts, getCategories } from "@/actions/productActions";
import ProductClient from "./ProductClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Katalog Produk & Kategori — KasirKita",
  description: "Manajemen produk retail UMKM, harga, kategori, dan stok barang dagangan",
};

export default async function ProductPage() {
  // 1. Guard Autentikasi Server: Dapat diakses Pemilik (CRUD penuh) dan Kasir (Read-Only)
  const session = await requireAuth(["PEMILIK", "KASIR"]);

  // 2. Ambil data produk dan kategori dari PostgreSQL
  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
  ]);

  return (
    <ProductClient
      initialProducts={products}
      categories={categories}
      userRole={session.role}
    />
  );
}

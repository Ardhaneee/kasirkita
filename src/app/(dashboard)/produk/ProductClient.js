"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from "react";
import { formatRupiah } from "@/lib/utils";
import {
  createProductAction,
  updateProductAction,
  toggleProductStatusAction,
  createCategoryAction,
} from "@/actions/productActions";

export default function ProductClient({
  initialProducts = [],
  categories = [],
  userRole = "KASIR",
}) {
  const isPemilik = userRole === "PEMILIK";

  // State Filter & Pencarian
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL | ACTIVE | INACTIVE

  // State Modal Produk (Add / Edit)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null); // null = mode tambah
  const [productFormError, setProductFormError] = useState("");
  const [imagePreview, setImagePreview] = useState(null);

  // State Modal Kategori
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryFormError, setCategoryFormError] = useState("");

  // Transition & Notification State
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState(null);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  // Filter Produk di Client
  const filteredProducts = initialProducts.filter((product) => {
    // 1. Filter Kasir: Kasir hanya melihat produk yang aktif secara default (kecuali pemilik)
    if (!isPemilik && !product.status_aktif) {
      return false;
    }

    // 2. Filter Status (untuk Pemilik)
    if (statusFilter === "ACTIVE" && !product.status_aktif) return false;
    if (statusFilter === "INACTIVE" && product.status_aktif) return false;

    // 3. Filter Kategori
    if (selectedCategory !== "ALL" && product.category_id !== Number(selectedCategory)) {
      return false;
    }

    // 4. Filter Pencarian Nama atau Barcode
    if (search.trim() !== "") {
      const q = search.toLowerCase();
      const matchName = product.nama_produk.toLowerCase().includes(q);
      const matchBarcode = product.barcode.toLowerCase().includes(q);
      if (!matchName && !matchBarcode) return false;
    }

    return true;
  });

  // Handler Buka Modal Tambah Produk
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProductFormError("");
    setImagePreview(null);
    setIsProductModalOpen(true);
  };

  // Handler Buka Modal Edit Produk
  const handleOpenEditProduct = (product) => {
    setEditingProduct(product);
    setProductFormError("");
    setImagePreview(product.gambar_path || null);
    setIsProductModalOpen(true);
  };

  // Handler Perubahan File Gambar untuk Preview
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
        setProductFormError(`Ukuran gambar (${sizeMb} MB) melebihi batas. Maksimal 2 MB.`);
        e.target.value = "";
        setImagePreview(editingProduct?.gambar_path || null);
        return;
      }
      setProductFormError("");
      const objectUrl = URL.createObjectURL(file);
      setImagePreview(objectUrl);
    }
  };

  // Handler Submit Produk (Tambah atau Edit)
  const handleProductSubmit = (e) => {
    e.preventDefault();
    setProductFormError("");

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        let result;
        if (editingProduct) {
          result = await updateProductAction(editingProduct.id, null, formData);
        } else {
          result = await createProductAction(null, formData);
        }

        if (result && result.success) {
          setIsProductModalOpen(false);
          showNotification("success", result.message);
        } else {
          setProductFormError(result?.error || "Gagal menyimpan produk.");
        }
      } catch (err) {
        console.error("Gagal mengirim data produk:", err);
        setProductFormError("Terjadi kendala saat mengirim data. Pastikan berkas gambar tidak melebihi 2 MB.");
      }
    });
  };

  // Handler Toggle Status Aktif Produk
  const handleToggleStatus = (product) => {
    startTransition(async () => {
      const result = await toggleProductStatusAction(product.id);
      if (result.success) {
        showNotification("success", result.message);
      } else {
        showNotification("error", result.error || "Gagal mengubah status.");
      }
    });
  };

  // Handler Submit Kategori Baru
  const handleCategorySubmit = (e) => {
    e.preventDefault();
    setCategoryFormError("");

    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await createCategoryAction(null, formData);
      if (result.success) {
        setIsCategoryModalOpen(false);
        showNotification("success", result.message);
      } else {
        setCategoryFormError(result.error || "Gagal menyimpan kategori.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-md border text-xs flex items-center gap-2 transition-all ${
            notification.type === "success"
              ? "bg-[#F2F7F4] border-[#CDE0D4] text-[#2F614A]"
              : "bg-[#FDF3F2] border-[#E0B4B0] text-[#B85248]"
          }`}
        >
          <span>{notification.type === "success" ? "✓" : "⚠️"}</span>
          <span className="font-medium">{notification.message}</span>
        </div>
      )}

      {/* Header Halaman & Aksi Utama */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Katalog Produk &amp; Kategori
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Kelola data master barang dagangan, barcode/SKU, dan tingkat ketersediaan stok
          </p>
        </div>

        {isPemilik ? (
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="px-3.5 py-2 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[#F2EFE9] text-xs font-medium text-[var(--text-primary)] transition-colors"
            >
              + Kategori
            </button>
            <button
              type="button"
              onClick={handleOpenAddProduct}
              className="px-4 py-2 rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-xs font-medium text-white shadow-sm transition-colors flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Tambah Produk</span>
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--primary-accent)] border border-[#CDE0D4] text-xs font-medium text-[var(--primary)]">
            <span>ℹ️</span>
            <span>Mode Kasir: Hanya Melihat Stok &amp; Harga</span>
          </div>
        )}
      </div>

      {/* Baris Kontrol: Pencarian & Filter */}
      <div className="p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
          {/* Kolom Pencarian */}
          <div className="sm:col-span-6">
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Cari Nama atau Barcode/SKU
            </label>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Ketik nama produk atau scan barcode..."
                className="w-full pl-8 pr-3 py-2 text-xs rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[#9A9B93] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              />
              <span className="absolute left-2.5 top-2 text-[#9A9B93]">🔍</span>
            </div>
          </div>

          {/* Filter Kategori */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Kategori
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="ALL">Semua Kategori ({categories.length})</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama} ({c.product_count || 0})
                </option>
              ))}
            </select>
          </div>

          {/* Filter Status Aktif (Khusus Pemilik) */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
              Status Produk
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              disabled={!isPemilik}
              className="w-full px-3 py-2 text-xs rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-60"
            >
              <option value="ALL">Semua Status</option>
              <option value="ACTIVE">Hanya Aktif</option>
              <option value="INACTIVE">Hanya Nonaktif</option>
            </select>
          </div>
        </div>

        {/* Info Ringkasan Jumlah Produk */}
        <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>
            Menampilkan <strong className="text-[var(--text-primary)]">{filteredProducts.length}</strong> dari{" "}
            {initialProducts.length} produk
          </span>
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-[var(--primary)] hover:underline font-medium"
            >
              Reset Pencarian
            </button>
          )}
        </div>
      </div>

      {/* Tabel Data Produk Warm Minimalist */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[var(--background)] border-b border-[var(--border)] text-[var(--text-secondary)] font-semibold">
                <th className="py-3 px-4 w-12 text-center">Foto</th>
                <th className="py-3 px-4">Nama Produk &amp; Barcode</th>
                <th className="py-3 px-4">Kategori</th>
                {isPemilik && <th className="py-3 px-4 text-right">Harga Beli</th>}
                <th className="py-3 px-4 text-right">Harga Jual</th>
                {isPemilik && <th className="py-3 px-4 text-right">Margin</th>}
                <th className="py-3 px-4 text-center">Stok</th>
                <th className="py-3 px-4 text-center">Status</th>
                {isPemilik && <th className="py-3 px-4 text-center w-28">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={isPemilik ? 9 : 6}
                    className="py-12 text-center text-xs text-[var(--text-secondary)]"
                  >
                    Tidak ada produk yang sesuai dengan kriteria filter.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const margin = p.harga_jual - p.harga_beli;
                  const isOutOfStock = p.stok <= 0;
                  const isLowStock = p.stok > 0 && p.stok <= p.stok_minimum;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-[#FAF9F5] transition-colors ${
                        !p.status_aktif ? "opacity-60 bg-[#FBFBFA]" : ""
                      }`}
                    >
                      {/* Foto Thumbnail */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="w-10 h-10 rounded-md border border-[var(--border)] bg-[var(--background)] flex items-center justify-center overflow-hidden mx-auto">
                          {p.gambar_path ? (
                            <img
                              src={p.gambar_path}
                              alt={p.nama_produk}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-sm opacity-40">📦</span>
                          )}
                        </div>
                      </td>

                      {/* Nama & Barcode */}
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-sm text-[var(--text-primary)]">
                          {p.nama_produk}
                        </div>
                        <div className="font-mono text-xs text-[#55564E] mt-0.5">
                          {p.barcode} • {p.satuan}
                        </div>
                      </td>

                      {/* Kategori */}
                      <td className="py-2.5 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded text-xs font-medium bg-[var(--primary-accent)] text-[var(--primary)] border border-[#CDE0D4]">
                          {p.category?.nama || "-"}
                        </span>
                      </td>

                      {/* Harga Beli (Pemilik) */}
                      {isPemilik && (
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-[#55564E]">
                          {formatRupiah(p.harga_beli)}
                        </td>
                      )}

                      {/* Harga Jual */}
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-xs text-[var(--text-primary)]">
                        {formatRupiah(p.harga_jual)}
                      </td>

                      {/* Margin Profit (Pemilik) */}
                      {isPemilik && (
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-[#2F614A]">
                          +{formatRupiah(margin)}
                        </td>
                      )}

                      {/* Status Stok */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="font-mono font-semibold text-xs text-[var(--text-primary)]">
                          {p.stok}
                        </div>
                        {isOutOfStock ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FDF3F2] text-[#B85248] border border-[#E0B4B0]">
                            Habis
                          </span>
                        ) : isLowStock ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FAF6E9] text-[#B87D35] border border-[#EDE4C8]">
                            Menipis
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F2F7F4] text-[#34785B] border border-[#CDE0D4]">
                            Aman
                          </span>
                        )}
                      </td>

                      {/* Status Aktif */}
                      <td className="py-2.5 px-4 text-center">
                        {p.status_aktif ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2F614A]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#34785B]" />
                            Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[#77786F]">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                            Nonaktif
                          </span>
                        )}
                      </td>

                      {/* Aksi (Khusus Pemilik) */}
                      {isPemilik && (
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditProduct(p)}
                              className="px-2.5 py-1 rounded border border-[var(--border)] hover:bg-[#F2EFE9] text-xs font-medium text-[var(--text-primary)] transition-colors"
                              title="Edit data produk"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(p)}
                              disabled={isPending}
                              className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                                p.status_aktif
                                  ? "border-[#E0B4B0] text-[#B85248] hover:bg-[#FDF3F2]"
                                  : "border-[#CDE0D4] text-[#2F614A] hover:bg-[#F2F7F4]"
                              }`}
                              title={p.status_aktif ? "Nonaktifkan produk" : "Aktifkan produk"}
                            >
                              {p.status_aktif ? "Off" : "On"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL TAMBAH / EDIT PRODUK ================= */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  {editingProduct ? "Edit Informasi Produk" : "Tambah Produk Baru"}
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {editingProduct
                    ? `Perbarui data untuk SKU: ${editingProduct.barcode}`
                    : "Lengkapi data barang dagangan UMKM"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="w-7 h-7 rounded-md border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:bg-[var(--background)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Error Banner */}
            {productFormError && (
              <div className="mx-6 mt-4 p-3 rounded-md bg-[#FDF3F2] border border-[#E0B4B0] text-[#B85248] text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{productFormError}</span>
              </div>
            )}

            {/* Form Body */}
            <form onSubmit={handleProductSubmit} className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nama Produk */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Nama Produk <span className="text-[#B85248]">*</span>
                  </label>
                  <input
                    name="nama_produk"
                    type="text"
                    required
                    defaultValue={editingProduct?.nama_produk || ""}
                    placeholder="Contoh: Beras Ramos Premium 5kg"
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {/* Barcode / SKU */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Barcode / SKU <span className="text-[#B85248]">*</span>
                  </label>
                  <input
                    name="barcode"
                    type="text"
                    required
                    defaultValue={editingProduct?.barcode || ""}
                    placeholder="Contoh: 8992741912014"
                    className="w-full px-3 py-2 text-xs font-mono rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {/* Kategori */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Kategori <span className="text-[#B85248]">*</span>
                  </label>
                  <select
                    name="category_id"
                    required
                    defaultValue={editingProduct?.category_id || categories[0]?.id || ""}
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nama}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Satuan */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Satuan Barang <span className="text-[#B85248]">*</span>
                  </label>
                  <input
                    name="satuan"
                    type="text"
                    required
                    defaultValue={editingProduct?.satuan || "pcs"}
                    placeholder="Contoh: pcs, bungkus, sak, botol"
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {/* Stok Minimum (Peringatan) */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Batas Minimum Stok
                  </label>
                  <input
                    name="stok_minimum"
                    type="number"
                    min="0"
                    defaultValue={editingProduct?.stok_minimum ?? 5}
                    className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {/* Harga Beli */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Harga Beli (Modal) Rp <span className="text-[#B85248]">*</span>
                  </label>
                  <input
                    name="harga_beli"
                    type="number"
                    min="0"
                    step="100"
                    required
                    defaultValue={editingProduct?.harga_beli ?? ""}
                    placeholder="Contoh: 15000"
                    className="w-full px-3 py-2 text-xs font-mono rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {/* Harga Jual */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Harga Jual Rp <span className="text-[#B85248]">*</span>
                  </label>
                  <input
                    name="harga_jual"
                    type="number"
                    min="0"
                    step="100"
                    required
                    defaultValue={editingProduct?.harga_jual ?? ""}
                    placeholder="Contoh: 17500"
                    className="w-full px-3 py-2 text-xs font-mono rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {/* Stok Saat Ini */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                    Jumlah Stok Saat Ini <span className="text-[#B85248]">*</span>
                  </label>
                  <input
                    name="stok"
                    type="number"
                    min="0"
                    required
                    defaultValue={editingProduct?.stok ?? 0}
                    className="w-full px-3 py-2 text-xs font-mono rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>

                {/* Status Aktif */}
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="status_aktif_input"
                    name="status_aktif"
                    type="checkbox"
                    defaultChecked={editingProduct ? editingProduct.status_aktif : true}
                    className="w-4 h-4 rounded text-[var(--primary)] focus:ring-[var(--primary)] border-[var(--border)]"
                  />
                  <label
                    htmlFor="status_aktif_input"
                    className="text-xs font-medium text-[var(--text-primary)] cursor-pointer"
                  >
                    Produk aktif dan dapat dijual di kasir
                  </label>
                </div>

                {/* Upload Foto Produk dengan Sharp Kompresi */}
                <div className="sm:col-span-2 pt-2 border-t border-[var(--border)]">
                  <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                    Foto Produk (Opsional - Dikompresi Otomatis ke WebP 500x500)
                  </label>
                  <div className="flex items-center gap-4">
                    {/* Preview Kotak */}
                    <div className="w-16 h-16 rounded-md border border-[var(--border)] bg-[var(--background)] flex items-center justify-center overflow-hidden shrink-0">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs text-[var(--text-secondary)]">No Pic</span>
                      )}
                    </div>

                    <div className="flex-1">
                      <input
                        name="gambar"
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleImageChange}
                        className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-[var(--border)] file:text-xs file:bg-[var(--surface)] hover:file:bg-[var(--background)] file:text-[var(--text-primary)] file:cursor-pointer"
                      />
                      <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                        Format didukung: JPG, PNG, WebP. Maksimal 2 MB.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-[var(--border)] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[#F2EFE9] text-[var(--text-primary)] transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>{editingProduct ? "Simpan Perubahan" : "Simpan Produk"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH KATEGORI ================= */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-xs">
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
            {/* Header Modal */}
            <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)]">
                  Tambah Kategori Baru
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Kelompokkan barang dagangan agar mudah dicari
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="w-7 h-7 rounded-md border border-[var(--border)] text-xs text-[var(--text-secondary)] hover:bg-[var(--background)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Error Banner */}
            {categoryFormError && (
              <div className="mx-6 mt-4 p-3 rounded-md bg-[#FDF3F2] border border-[#E0B4B0] text-[#B85248] text-xs flex items-center gap-2">
                <span>⚠️</span>
                <span>{categoryFormError}</span>
              </div>
            )}

            {/* Form Body */}
            <form onSubmit={handleCategorySubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Nama Kategori <span className="text-[#B85248]">*</span>
                </label>
                <input
                  name="nama"
                  type="text"
                  required
                  placeholder="Contoh: Alat Tulis, Roti & Kue"
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1">
                  Deskripsi Singkat (Opsional)
                </label>
                <textarea
                  name="deskripsi"
                  rows={3}
                  placeholder="Deskripsi singkat mengenai jenis barang dalam kategori ini..."
                  className="w-full px-3 py-2 text-xs rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[var(--border)] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-medium rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[#F2EFE9] text-[var(--text-primary)] transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-medium rounded-md bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <span>Simpan Kategori</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

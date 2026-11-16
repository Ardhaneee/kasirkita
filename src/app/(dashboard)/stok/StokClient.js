"use client";

import { useState, useTransition } from "react";
import {
  addStockAction,
  adjustStockAction,
  getStockMovementsAction,
  getRestockRecommendationsAction,
} from "@/actions/inventoryActions";

function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

function formatTanggal(isoString) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export default function StokClient({
  initialProducts = [],
  categories = [],
  storeSettings = {},
  initialMovements = [],
  initialRecommendations = [],
  currentUser = {},
}) {
  const isPemilik = currentUser.role === "PEMILIK";

  // Tab navigasi: Kasir selalu berada pada tab 'stok' (tab mutasi & rop disembunyikan total)
  const [activeTab, setActiveTab] = useState("stok"); // 'stok' | 'mutasi' | 'rop'

  // State Produk & Filter
  const [products, setProducts] = useState(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [stockStatusFilter, setStockStatusFilter] = useState("ALL");

  // State Mutasi Stok (Hanya dimuat untuk Pemilik)
  const [movements, setMovements] = useState(initialMovements);
  const [movementProductFilter, setMovementProductFilter] = useState("ALL");
  const [movementTypeFilter, setMovementTypeFilter] = useState("ALL");
  const [isMovementsLoading, setIsMovementsLoading] = useState(false);

  // State Rekomendasi ROP (Hanya dimuat untuk Pemilik)
  const [recommendations, setRecommendations] = useState(initialRecommendations);

  // Modals (Hanya untuk Pemilik)
  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [isAdjustStockModalOpen, setIsAdjustStockModalOpen] = useState(false);
  const [targetProduct, setTargetProduct] = useState(null);

  // Form State Tambah Stok
  const [addQty, setAddQty] = useState("");
  const [addNotes, setAddNotes] = useState("");

  // Form State Penyesuaian Stok
  const [adjustPhysicalStock, setAdjustPhysicalStock] = useState("");
  const [adjustCategory, setAdjustCategory] = useState("STOK_OPNAME");
  const [adjustReason, setAdjustReason] = useState("");

  // Alert Feedback
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }
  const [isPending, startTransition] = useTransition();

  // Hitung ringkasan status stok
  const totalSku = products.length;
  const countAman = products.filter((p) => p.stockStatus === "AMAN").length;
  const countMenipis = products.filter((p) => p.stockStatus === "MENIPIS").length;
  const countHabis = products.filter((p) => p.stockStatus === "HABIS").length;

  // Filter daftar produk aktif
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      p.nama_produk.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory =
      selectedCategory === "ALL" || p.category_id === Number(selectedCategory);

    const matchesStatus =
      stockStatusFilter === "ALL" || p.stockStatus === stockStatusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Handler reload mutasi dengan filter (Hanya Pemilik)
  async function handleFilterMovements(productId, tipeMutasi) {
    if (!isPemilik) return;
    setIsMovementsLoading(true);
    try {
      const res = await getStockMovementsAction({
        productId,
        tipeMutasi,
        limit: 100,
      });
      setMovements(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsMovementsLoading(false);
    }
  }

  // Handler buka modal Tambah Stok
  function openAddStockModal(prod = null) {
    if (!isPemilik) return;
    setFeedback(null);
    setTargetProduct(prod || products[0] || null);
    setAddQty("");
    setAddNotes("");
    setIsAddStockModalOpen(true);
  }

  // Handler buka modal Penyesuaian Stok
  function openAdjustStockModal(prod = null) {
    if (!isPemilik) return;
    setFeedback(null);
    const chosen = prod || products[0] || null;
    setTargetProduct(chosen);
    setAdjustPhysicalStock(chosen ? String(chosen.stok) : "0");
    setAdjustCategory("STOK_OPNAME");
    setAdjustReason("");
    setIsAdjustStockModalOpen(true);
  }

  // Submit Penambahan Stok Masuk
  function handleAddStockSubmit(e) {
    e.preventDefault();
    if (!isPemilik || !targetProduct) return;

    const qtyNum = parseInt(addQty, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setFeedback({
        type: "error",
        message: "Jumlah stok masuk harus bilangan bulat positif (> 0).",
      });
      return;
    }

    startTransition(async () => {
      const res = await addStockAction({
        productId: targetProduct.id,
        jumlah: qtyNum,
        keterangan: addNotes,
      });

      if (res.success) {
        setFeedback({ type: "success", message: res.message });
        setIsAddStockModalOpen(false);

        // Update local state secara responsif
        setProducts((prev) =>
          prev.map((p) =>
            p.id === targetProduct.id
              ? {
                  ...p,
                  stok: res.stokBaru,
                  stockStatus:
                    res.stokBaru <= 0
                      ? "HABIS"
                      : res.stokBaru <= p.stok_minimum || res.stokBaru <= p.ropInfo.rop
                      ? "MENIPIS"
                      : "AMAN",
                }
              : p
          )
        );

        // Refresh mutasi & rekomendasi jika Pemilik
        if (isPemilik) {
          const [mRes, rRes] = await Promise.all([
            getStockMovementsAction({ limit: 100 }),
            getRestockRecommendationsAction(),
          ]);
          setMovements(mRes);
          setRecommendations(rRes);
        }
      } else {
        setFeedback({ type: "error", message: res.error });
      }
    });
  }

  // Submit Penyesuaian Stok Fisik
  function handleAdjustStockSubmit(e) {
    e.preventDefault();
    if (!isPemilik || !targetProduct) return;

    const stockNum = parseInt(adjustPhysicalStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setFeedback({
        type: "error",
        message: "Stok fisik aktual tidak boleh bernilai negatif.",
      });
      return;
    }

    if (!adjustReason.trim() || adjustReason.trim().length < 3) {
      setFeedback({
        type: "error",
        message: "Alasan penyesuaian wajib diisi (minimal 3 karakter).",
      });
      return;
    }

    startTransition(async () => {
      const res = await adjustStockAction({
        productId: targetProduct.id,
        stokFisik: stockNum,
        alasan: adjustReason,
        kategoriAlasan: adjustCategory,
      });

      if (res.success) {
        setFeedback({ type: "success", message: res.message });
        setIsAdjustStockModalOpen(false);

        setProducts((prev) =>
          prev.map((p) =>
            p.id === targetProduct.id
              ? {
                  ...p,
                  stok: res.stokBaru,
                  stockStatus:
                    res.stokBaru <= 0
                      ? "HABIS"
                      : res.stokBaru <= p.stok_minimum || res.stokBaru <= p.ropInfo.rop
                      ? "MENIPIS"
                      : "AMAN",
                }
              : p
          )
        );

        if (isPemilik) {
          const [mRes, rRes] = await Promise.all([
            getStockMovementsAction({ limit: 100 }),
            getRestockRecommendationsAction(),
          ]);
          setMovements(mRes);
          setRecommendations(rRes);
        }
      } else {
        setFeedback({ type: "error", message: res.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Manajemen Inventori &amp; Stok
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            {isPemilik
              ? "Monitoring stok fisik, audit riwayat mutasi, dan rekomendasi Reorder Point (ROP)."
              : "Daftar ketersediaan stok produk untuk kebutuhan operasional kasir."}
          </p>
        </div>

        {/* Tombol Aksi Cepat (Khusus Pemilik) */}
        {isPemilik ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAddStockModal()}
              className="px-4 py-2 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-[0.99]"
            >
              <span>+ Barang Masuk</span>
            </button>
            <button
              type="button"
              onClick={() => openAdjustStockModal()}
              className="px-4 py-2 bg-[var(--surface)] hover:bg-[#F2EFE9] border border-[var(--border)] text-[var(--text-primary)] text-xs font-semibold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <span>Penyesuaian Fisik</span>
            </button>
          </div>
        ) : (
          <div className="px-3 py-1.5 bg-[var(--background)] border border-[var(--border)] rounded-lg text-xs text-[var(--text-secondary)]">
            Role: <strong className="text-[var(--primary)]">KASIR</strong> (Mode Baca)
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between border ${
            feedback.type === "success"
              ? "bg-[#EAF3EC] border-[#C5DDCB] text-[#204E35]"
              : "bg-[#FDF2F2] border-[#F8D2D2] text-[#9A2C2C]"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline ml-3 font-semibold hover:opacity-80"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Ringkasan Indikator Stok (Minimalis & Proporsional) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <div className="text-xs text-[var(--text-secondary)] font-medium">Total SKU Aktif</div>
          <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{totalSku}</div>
        </div>
        <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <div className="text-xs text-[#244837] font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#315C49]"></span>
            Stok Aman
          </div>
          <div className="text-xl font-bold text-[#244837] mt-0.5">{countAman}</div>
        </div>
        <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <div className="text-xs text-[#8C5D0D] font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D9822B]"></span>
            Stok Menipis
          </div>
          <div className="text-xl font-bold text-[#8C5D0D] mt-0.5">{countMenipis}</div>
        </div>
        <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl">
          <div className="text-xs text-[#9E2A2B] font-medium flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#C93B3B]"></span>
            Stok Habis
          </div>
          <div className="text-xl font-bold text-[#9E2A2B] mt-0.5">{countHabis}</div>
        </div>
      </div>

      {/* Tab Navigasi Inventori (Kasir hanya melihat Daftar Stok Produk) */}
      {isPemilik ? (
        <div className="flex border-b border-[var(--border)] gap-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("stok")}
            className={`pb-2.5 px-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "stok"
                ? "border-[var(--primary)] text-[var(--primary)] font-bold"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Daftar Stok Produk
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("mutasi")}
            className={`pb-2.5 px-3 border-b-2 transition-all cursor-pointer ${
              activeTab === "mutasi"
                ? "border-[var(--primary)] text-[var(--primary)] font-bold"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Riwayat Mutasi Stok ({movements.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("rop")}
            className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === "rop"
                ? "border-[var(--primary)] text-[var(--primary)] font-bold"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <span>Rekomendasi Restok (ROP)</span>
            {countMenipis + countHabis > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-[#FEF6E7] text-[#8C5D0D] border border-[#F6E1B6]">
                {countMenipis + countHabis}
              </span>
            )}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
          <div className="text-xs font-bold text-[var(--primary)] pb-1 border-b-2 border-[var(--primary)]">
            Daftar Stok Produk
          </div>
          <span className="text-xs text-[var(--text-secondary)] italic">
            Mode Kasir: Hanya Melihat Ketersediaan Stok Produk
          </span>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: DAFTAR STOK PRODUK */}
      {/* =================================================================== */}
      {activeTab === "stok" && (
        <div className="space-y-4">
          {/* Bar Filter & Pencarian */}
          <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex-1 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Cari nama produk atau barcode/SKU..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-72 px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              >
                <option value="ALL">Semua Kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nama}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Status Stok Pill */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-[var(--text-secondary)] mr-1 hidden sm:inline">Status:</span>
              {["ALL", "AMAN", "MENIPIS", "HABIS"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStockStatusFilter(st)}
                  className={`px-3 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                    stockStatusFilter === st
                      ? "bg-[var(--primary-accent)] border-[var(--primary)] text-[var(--primary)] font-bold"
                      : "bg-[var(--background)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {st === "ALL" ? "Semua" : st === "AMAN" ? "Aman" : st === "MENIPIS" ? "Menipis" : "Habis"}
                </button>
              ))}
            </div>
          </div>

          {/* Tabel Stok Produk (Tipografi Diperbaiki) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF9F5] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase text-xs font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Barcode / SKU</th>
                    <th className="py-3 px-4">Nama Produk</th>
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4 text-right">Stok Saat Ini</th>
                    <th className="py-3 px-4 text-center">Batas Min.</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Harga Jual</th>
                    <th className="py-3 px-4 text-center">Aksi Inventori</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-[var(--text-secondary)]">
                        Tidak ada data produk yang cocok dengan kriteria pencarian.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const isZero = p.stok <= 0;
                      const isLow = p.stok <= p.stok_minimum || p.stok <= p.ropInfo.rop;

                      return (
                        <tr key={p.id} className="hover:bg-[#FAF9F6] transition-colors">
                          <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">
                            {p.barcode}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-xs sm:text-sm text-[var(--text-primary)] block">
                              {p.nama_produk}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-[var(--text-secondary)]">
                            {p.category_name}
                          </td>
                          <td className="py-3 px-4 text-right font-bold tabular-nums">
                            <span
                              className={`text-sm ${
                                isZero
                                  ? "text-[#C93B3B]"
                                  : isLow
                                  ? "text-[#D9822B]"
                                  : "text-[#244837]"
                              }`}
                            >
                              {p.stok}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] ml-1 font-normal">
                              {p.satuan}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-xs text-[var(--text-secondary)] tabular-nums">
                            {p.stok_minimum} {p.satuan}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isZero ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#FDF2F2] text-[#9E2A2B] border border-[#F7CACA]">
                                Habis
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#FEF6E7] text-[#8C5D0D] border border-[#F6E1B6]">
                                Menipis
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E8F0EB] text-[#244837] border border-[#C5D9CC]">
                                Aman
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-xs font-mono text-[var(--text-secondary)]">
                            {formatRupiah(p.harga_jual)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {isPemilik ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openAddStockModal(p)}
                                  title="Tambah stok barang masuk"
                                  className="px-2.5 py-1 rounded bg-[var(--primary-accent)] hover:bg-[#D2DFD4] text-[var(--primary)] text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  + Masuk
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAdjustStockModal(p)}
                                  title="Penyesuaian stok fisik (Opname/Koreksi)"
                                  className="px-2.5 py-1 rounded bg-[var(--background)] hover:bg-[#ECEAE4] border border-[var(--border)] text-[var(--text-primary)] text-xs font-medium transition-colors cursor-pointer"
                                >
                                  Sesuaikan
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-[var(--text-secondary)] italic">
                                Hanya Baca
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: RIWAYAT MUTASI STOK (KHUSUS PEMILIK) */}
      {/* =================================================================== */}
      {isPemilik && activeTab === "mutasi" && (
        <div className="space-y-4">
          {/* Bar Filter Mutasi */}
          <div className="p-3.5 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-[var(--text-secondary)] font-medium">Filter:</span>
              <select
                value={movementProductFilter}
                onChange={(e) => {
                  setMovementProductFilter(e.target.value);
                  handleFilterMovements(e.target.value, movementTypeFilter);
                }}
                className="px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="ALL">Semua Produk</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama_produk}
                  </option>
                ))}
              </select>

              <select
                value={movementTypeFilter}
                onChange={(e) => {
                  setMovementTypeFilter(e.target.value);
                  handleFilterMovements(movementProductFilter, e.target.value);
                }}
                className="px-3 py-1.5 text-xs bg-[var(--background)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="ALL">Semua Jenis Mutasi</option>
                <option value="MASUK">MASUK (Barang Masuk / Restok)</option>
                <option value="PENJUALAN">PENJUALAN (Checkout Kasir)</option>
                <option value="PENYESUAIAN">PENYESUAIAN (Opname / Koreksi)</option>
                <option value="KELUAR">KELUAR</option>
              </select>
            </div>

            <div className="text-xs text-[var(--text-secondary)]">
              Menampilkan {movements.length} riwayat mutasi terbaru
            </div>
          </div>

          {/* Tabel Mutasi Stok (Tipografi Diperbaiki) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF9F5] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase text-xs font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Waktu Mutasi</th>
                    <th className="py-3 px-4">Nama Produk &amp; Barcode</th>
                    <th className="py-3 px-4 text-center">Tipe Mutasi</th>
                    <th className="py-3 px-4 text-right">Perubahan</th>
                    <th className="py-3 px-4 text-center">Stok (Awal &rarr; Akhir)</th>
                    <th className="py-3 px-4">Pengguna</th>
                    <th className="py-3 px-4">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  {isMovementsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-[var(--text-secondary)]">
                        Memuat riwayat mutasi...
                      </td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-[var(--text-secondary)]">
                        Belum ada catatan mutasi stok untuk filter yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    movements.map((m) => {
                      const isPositive = m.tipe_mutasi === "MASUK" || m.stok_akhir > m.stok_awal;
                      const isNegative = m.tipe_mutasi === "PENJUALAN" || m.stok_akhir < m.stok_awal;

                      return (
                        <tr key={m.id} className="hover:bg-[#FAF9F6] transition-colors">
                          <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)] whitespace-nowrap">
                            {formatTanggal(m.created_at)}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-xs sm:text-sm text-[var(--text-primary)]">{m.nama_produk}</div>
                            <div className="text-xs font-mono text-[var(--text-secondary)]">
                              SKU: {m.barcode}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${
                                m.tipe_mutasi === "MASUK"
                                  ? "bg-[#E8F0EB] text-[#244837] border-[#C5D9CC]"
                                  : m.tipe_mutasi === "PENJUALAN"
                                  ? "bg-[#EBF1F5] text-[#274B64] border-[#C2D7E5]"
                                  : "bg-[#FEF6E7] text-[#8C5D0D] border-[#F6E1B6]"
                              }`}
                            >
                              {m.tipe_mutasi}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold">
                            <span
                              className={
                                isPositive
                                  ? "text-[#315C49]"
                                  : isNegative
                                  ? "text-[#C93B3B]"
                                  : "text-[var(--text-primary)]"
                              }
                            >
                              {isPositive ? `+${m.jumlah}` : isNegative ? `-${m.jumlah}` : `0`}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] ml-1 font-normal">
                              {m.satuan}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums text-xs">
                            <span className="text-[var(--text-secondary)]">{m.stok_awal}</span>
                            <span className="mx-1 text-[var(--border)] font-bold">&rarr;</span>
                            <span className="font-bold text-[var(--text-primary)]">{m.stok_akhir}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-xs">{m.user_nama}</div>
                            <div className="text-[11px] text-[var(--text-secondary)]">
                              Role: {m.user_role}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-[var(--text-secondary)] max-w-xs break-words">
                            {m.keterangan}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: REKOMENDASI RESTOK (REORDER POINT / ROP) — KHUSUS PEMILIK */}
      {/* =================================================================== */}
      {isPemilik && activeTab === "rop" && (
        <div className="space-y-4">
          {/* Card Info Rumus ROP (Rumus Riil & Fallback Eksplisit) */}
          <div className="p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-[var(--text-primary)]">
                Algoritma Reorder Point (ROP) &amp; Buffer Safety Stock
              </div>
              <div className="text-xs text-[var(--text-secondary)] mt-1.5 space-y-1 font-mono">
                <div>
                  <strong className="text-[var(--text-primary)]">Rumus Utama (Data Riil):</strong> ROP = (Penjualan Harian &times; Lead Time) + Safety Stock
                </div>
                <div>
                  <strong className="text-[var(--text-primary)]">Rumus Fallback (Estimasi Awal):</strong> ROP Estimasi Awal = Stok Minimum + Safety Stock
                </div>
              </div>
            </div>
            <div className="text-right text-xs text-[var(--text-secondary)] bg-[var(--background)] px-3.5 py-2.5 rounded-lg border border-[var(--border)] space-y-0.5">
              <div>Lead Time Default: <strong className="text-[var(--text-primary)]">{storeSettings.default_lead_time_days || 3} hari</strong></div>
              <div>Safety Stock Default: <strong className="text-[var(--text-primary)]">{storeSettings.default_safety_stock_percent || 20}%</strong></div>
            </div>
          </div>

          {/* Tabel Analisa ROP (Tipografi Diperbaiki & Penjelasan Formula Eksplisit) */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAF9F5] border-b border-[var(--border)] text-[var(--text-secondary)] uppercase text-xs font-semibold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Nama Produk &amp; Metode ROP</th>
                    <th className="py-3 px-4 text-right">Terjual (30 Hari)</th>
                    <th className="py-3 px-4 text-right">Rata-rata/Hari</th>
                    <th className="py-3 px-4 text-center">Lead Time</th>
                    <th className="py-3 px-4 text-center">Safety Stock</th>
                    <th className="py-3 px-4 text-center font-bold text-[var(--primary)]">Nilai ROP</th>
                    <th className="py-3 px-4 text-right font-bold">Stok Aktual</th>
                    <th className="py-3 px-4 text-center">Status Urgensi</th>
                    <th className="py-3 px-4 text-right">Saran Restok</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text-primary)]">
                  {recommendations.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-xs text-[var(--text-secondary)]">
                        Belum ada data produk untuk dianalisis.
                      </td>
                    </tr>
                  ) : (
                    recommendations.map((r) => {
                      return (
                        <tr
                          key={r.productId}
                          className={`hover:bg-[#FAF9F6] transition-colors ${
                            r.status === "HABIS"
                              ? "bg-[#FFF9F9]"
                              : r.status === "PERLU_RESTOK"
                              ? "bg-[#FFFDF7]"
                              : ""
                          }`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-xs sm:text-sm text-[var(--text-primary)]">
                              {r.nama_produk}
                            </div>
                            <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                              Kategori: {r.category_name} &bull; Min: {r.stok_minimum} {r.satuan}
                            </div>
                            <div className="mt-1">
                              {r.calculationType === "ESTIMASI_AWAL" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FEF6E7] text-[#8C5D0D] border border-[#F6E1B6]">
                                  ROP Estimasi Awal ({r.formulaDetail})
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E8F0EB] text-[#244837] border border-[#C5D9CC]">
                                  ROP Riil ({r.formulaDetail})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums text-xs text-[var(--text-secondary)]">
                            {r.total_terjual_30hr} {r.satuan}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-mono text-xs">
                            {r.averageDailySales} /hari
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums text-xs text-[var(--text-secondary)]">
                            {r.leadTimeDays} hari
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums text-xs text-[var(--text-secondary)]">
                            {r.safetyStock} {r.satuan}
                          </td>
                          <td className="py-3 px-4 text-center tabular-nums font-bold text-sm text-[var(--primary)]">
                            {r.rop}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-sm">
                            <span
                              className={
                                r.currentStock <= 0
                                  ? "text-[#C93B3B]"
                                  : r.currentStock <= r.rop
                                  ? "text-[#D9822B]"
                                  : "text-[#244837]"
                              }
                            >
                              {r.currentStock}
                            </span>
                            <span className="text-[11px] text-[var(--text-secondary)] ml-1 font-normal">
                              {r.satuan}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {r.status === "HABIS" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#FDF2F2] text-[#9E2A2B] border border-[#F7CACA]">
                                Restok Segera (Habis)
                              </span>
                            ) : r.status === "PERLU_RESTOK" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#FEF6E7] text-[#8C5D0D] border border-[#F6E1B6]">
                                Restok Segera (&le; ROP)
                              </span>
                            ) : r.status === "MENDEKATI_ROP" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]">
                                Waspada (&le; 125% ROP)
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-[#E8F0EB] text-[#244837] border border-[#C5D9CC]">
                                Aman (&gt; ROP)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-xs">
                            {r.isRestockNeeded ? (
                              <span className="text-[#315C49]">
                                +{r.recommendedOrderQty} {r.satuan}
                              </span>
                            ) : (
                              <span className="text-[var(--text-secondary)] font-normal text-xs">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {r.isRestockNeeded ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const matched = products.find((p) => p.id === r.productId);
                                  if (matched) openAddStockModal(matched);
                                }}
                                className="px-3 py-1 rounded bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                              >
                                Restok
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--text-secondary)]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 1: TAMBAH STOK BARANG MASUK (RESTOK) — KHUSUS PEMILIK */}
      {/* =================================================================== */}
      {isPemilik && isAddStockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-scale-in">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Tambah Stok Barang Masuk
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Pencatatan barang masuk dari supplier ke inventori toko.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddStockModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAddStockSubmit} className="p-5 space-y-4">
              {/* Dropdown Pilih Produk */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Pilih Produk <span className="text-red-500">*</span>
                </label>
                <select
                  value={targetProduct?.id || ""}
                  onChange={(e) => {
                    const found = products.find((p) => p.id === Number(e.target.value));
                    setTargetProduct(found || null);
                  }}
                  className="w-full px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama_produk} (Stok Saat Ini: {p.stok} {p.satuan})
                    </option>
                  ))}
                </select>
              </div>

              {/* Input Jumlah Stok Masuk */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Jumlah Stok Masuk <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="Contoh: 24"
                  value={addQty}
                  onChange={(e) => setAddQty(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              {/* Keterangan Tambahan */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Keterangan / Faktur Supplier (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Faktur No. DO-202611-01 dari Distributor Utama"
                  value={addNotes}
                  onChange={(e) => setAddNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              {/* Simulasi Stok Baru */}
              {targetProduct && (
                <div className="p-3 bg-[var(--background)] border border-[var(--border)] rounded-xl text-xs space-y-1">
                  <div className="text-xs text-[var(--text-secondary)]">Simulasi Perubahan:</div>
                  <div className="flex justify-between font-medium">
                    <span>Stok Saat Ini:</span>
                    <span>{targetProduct.stok} {targetProduct.satuan}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[var(--primary)]">
                    <span>Stok Setelah Ditambah:</span>
                    <span>
                      {targetProduct.stok + (parseInt(addQty, 10) || 0)} {targetProduct.satuan}
                    </span>
                  </div>
                </div>
              )}

              {/* Aksi Form */}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsAddStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[#EFECE6] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Menyimpan..." : "Simpan Stok Masuk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: PENYESUAIAN STOK FISIK (OPNAME / KOREKSI) — KHUSUS PEMILIK */}
      {/* =================================================================== */}
      {isPemilik && isAdjustStockModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-scale-in">
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Penyesuaian Stok Fisik
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Stok opname, barang rusak, barang hilang, atau koreksi catatan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAdjustStockModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAdjustStockSubmit} className="p-5 space-y-4">
              {/* Dropdown Pilih Produk */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Pilih Produk <span className="text-red-500">*</span>
                </label>
                <select
                  value={targetProduct?.id || ""}
                  onChange={(e) => {
                    const found = products.find((p) => p.id === Number(e.target.value));
                    setTargetProduct(found || null);
                    setAdjustPhysicalStock(found ? String(found.stok) : "0");
                  }}
                  className="w-full px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama_produk} (Tercatat: {p.stok} {p.satuan})
                    </option>
                  ))}
                </select>
              </div>

              {/* Input Stok Fisik Aktual */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Stok Fisik Nyata Saat Ini <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  placeholder="0"
                  value={adjustPhysicalStock}
                  onChange={(e) => setAdjustPhysicalStock(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              {/* Kategori Alasan */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Kategori Penyesuaian <span className="text-red-500">*</span>
                </label>
                <select
                  value={adjustCategory}
                  onChange={(e) => setAdjustCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="STOK_OPNAME">Hasil Stok Opname Rutin</option>
                  <option value="BARANG_RUSAK">Barang Rusak / Cacat Kemasan</option>
                  <option value="BARANG_HILANG">Barang Hilang / Kadaluarsa</option>
                  <option value="KOREKSI_CATATAN">Koreksi Kesalahan Input Sebelumnya</option>
                  <option value="LAINNYA">Lainnya</option>
                </select>
              </div>

              {/* Alasan / Keterangan Wajib */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[var(--text-primary)] block">
                  Alasan Detail Penyesuaian <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="Contoh: Ditemukan 1 botol bocor saat opname mingguan."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--background)] border border-[var(--border)] rounded-xl text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                />
              </div>

              {/* Kalkulasi Selisih Otomatis */}
              {targetProduct && (
                <div className="p-3 bg-[var(--background)] border border-[var(--border)] rounded-xl text-xs space-y-1">
                  {(() => {
                    const newStock = parseInt(adjustPhysicalStock, 10) || 0;
                    const diff = newStock - targetProduct.stok;
                    return (
                      <>
                        <div className="flex justify-between font-medium">
                          <span>Stok Tercatat:</span>
                          <span>{targetProduct.stok} {targetProduct.satuan}</span>
                        </div>
                        <div className="flex justify-between font-medium">
                          <span>Stok Fisik Baru:</span>
                          <span>{newStock} {targetProduct.satuan}</span>
                        </div>
                        <div
                          className={`flex justify-between font-bold pt-1 border-t border-[var(--border)] ${
                            diff > 0
                              ? "text-[#315C49]"
                              : diff < 0
                              ? "text-[#C93B3B]"
                              : "text-[var(--text-secondary)]"
                          }`}
                        >
                          <span>Selisih Mutasi:</span>
                          <span>
                            {diff > 0 ? `+${diff}` : `${diff}`} {targetProduct.satuan}
                            {diff === 0 && " (Tidak ada selisih)"}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Aksi Form */}
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsAdjustStockModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[#EFECE6] text-xs font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Menyimpan..." : "Simpan Penyesuaian"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

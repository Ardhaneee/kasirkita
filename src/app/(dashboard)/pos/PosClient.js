"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { formatRupiah, formatTanggal } from "@/lib/utils";
import { calculateChangeBreakdown } from "@/lib/algorithms";
import { checkoutAction } from "@/actions/posActions";

/**
 * Menghasilkan kunci idempoten unik berbasis peramban (UUID v4 atau fallback acak).
 */
function generateIdempotencyKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Komponen reusable untuk mencetak dan menampilkan struk nota thermal.
 * Digunakan baik untuk tampilan layar (preview di dalam modal) maupun media cetak (@media print).
 */
function ThermalReceiptContent({
  transaction,
  storeSettings = {},
  cashierName = "Kasir",
  paperWidth = "58mm",
  isPrintVersion = false,
}) {
  const is58 = paperWidth === "58mm";

  return (
    <div
      className={`bg-white text-black font-mono select-none ${
        isPrintVersion
          ? is58
            ? "receipt-paper-58mm"
            : "receipt-paper-80mm"
          : is58
          ? "w-[240px] text-xs p-3 shadow-sm border border-gray-200"
          : "w-[320px] text-xs p-4 shadow-sm border border-gray-200"
      }`}
      style={{
        fontFamily: "'Courier New', Courier, monospace",
        boxSizing: "border-box",
      }}
    >
      {/* KOP TOKO */}
      <div className="text-center pb-0.5">
        <div
          className="font-bold uppercase tracking-wide break-words"
          style={{ fontSize: is58 ? "11.5px" : "13.5px", letterSpacing: "0.3px" }}
        >
          {storeSettings.nama_toko || "KASIRKITA RETAIL"}
        </div>
        <div
          className="leading-tight break-words mt-0.5"
          style={{ fontSize: is58 ? "8.5px" : "9.5px" }}
        >
          {storeSettings.alamat || "Jl. Margonda Raya No. 123"}
        </div>
        <div style={{ fontSize: is58 ? "8.5px" : "9.5px" }}>
          Telp: {storeSettings.no_telepon || "0812-3456-7890"}
        </div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

      {/* METADATA TRANSAKSI */}
      <div style={{ fontSize: is58 ? "9px" : "10px" }}>
        <div className="flex justify-between items-baseline my-0.5">
          <span className="text-left">No. Faktur</span>
          <span className="text-right font-bold">{transaction.invoice_number}</span>
        </div>
        <div className="flex justify-between items-baseline my-0.5">
          <span className="text-left">Tanggal</span>
          <span className="text-right">{formatTanggal(transaction.tanggal_transaksi)}</span>
        </div>
        <div className="flex justify-between items-baseline my-0.5">
          <span className="text-left">Kasir</span>
          <span className="text-right truncate max-w-[140px]">
            {cashierName || transaction.user?.nama || "Kasir"}
          </span>
        </div>
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

      {/* DAFTAR ITEM TRANSAKSI */}
      <div style={{ fontSize: is58 ? "9px" : "10px" }}>
        {transaction.items?.map((item, idx) => (
          <div key={idx} className="my-0.5" style={{ breakInside: "avoid" }}>
            <div className="font-bold break-words leading-tight mb-0.5">
              {item.nama_produk_snapshot}
            </div>
            <div className="flex justify-between items-baseline text-gray-800">
              <span className="text-left">
                {item.kuantitas} x {formatRupiah(item.harga_jual_snapshot)}
              </span>
              <span className="text-right font-bold text-black">
                {formatRupiah(item.subtotal)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

      {/* RINCIAN TOTAL & PEMBAYARAN */}
      <div style={{ fontSize: is58 ? "9px" : "10px" }}>
        <div className="flex justify-between items-baseline my-0.5">
          <span className="text-left">Subtotal</span>
          <span className="text-right">{formatRupiah(transaction.subtotal)}</span>
        </div>
        {transaction.discount_amount > 0 && (
          <div className="flex justify-between items-baseline text-gray-800 my-0.5">
            <span className="text-left">Diskon</span>
            <span className="text-right">- {formatRupiah(transaction.discount_amount)}</span>
          </div>
        )}
        <div
          className="flex justify-between items-baseline font-bold my-0.5 pt-0.5"
          style={{
            fontSize: is58 ? "11px" : "12.5px",
            borderTop: "1px dotted #000",
          }}
        >
          <span className="text-left">TOTAL</span>
          <span className="text-right">{formatRupiah(transaction.total_belanja)}</span>
        </div>
        <div className="flex justify-between items-baseline mt-0.5 my-0.5">
          <span className="text-left">Metode Pembayaran</span>
          <span className="text-right font-bold">{transaction.metode_pembayaran}</span>
        </div>
        {transaction.metode_pembayaran === "TUNAI" ? (
          <>
            <div className="flex justify-between items-baseline my-0.5">
              <span className="text-left">Nominal Diterima</span>
              <span className="text-right">{formatRupiah(transaction.nominal_bayar)}</span>
            </div>
            <div className="flex justify-between items-baseline font-bold my-0.5">
              <span className="text-left">Kembalian</span>
              <span className="text-right">{formatRupiah(transaction.kembalian)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between items-baseline text-gray-800 my-0.5">
            <span className="text-left">Status</span>
            <span className="text-right font-bold text-black">LUNAS</span>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

      {/* PESAN KAKI STRUK (FOOTER RINGKAS & HEMAT KERTAS) */}
      <div
        className="text-center leading-tight"
        style={{ fontSize: is58 ? "8.5px" : "9.5px" }}
      >
        <p className="break-words">Terima kasih telah berbelanja!</p>
        <p className="mt-0.5 break-words">Semoga harimu menyenangkan.</p>
      </div>
    </div>
  );
}

export default function PosClient({
  initialProducts = [],
  initialCategories = [],
  storeSettings = {},
  currentUser = {},
}) {
  // State Katalog & Filter
  const [products, setProducts] = useState(initialProducts);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);

  // State Keranjang Belanja
  const [cart, setCart] = useState([]);
  const [discountAmount, setDiscountAmount] = useState(0);

  // State Idempotensi & Checkout (Inisialisasi lazy function, tanpa effect)
  const [idempotencyKey, setIdempotencyKey] = useState(() => generateIdempotencyKey());
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("TUNAI");
  const [cashReceived, setCashReceived] = useState("");
  const [qrisConfirmed, setQrisConfirmed] = useState(false);
  const [transactionNotes, setTransactionNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // State Struk Thermal & Modal Sukses
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [lastChangeBreakdown, setLastChangeBreakdown] = useState([]);
  const [receiptPaperWidth, setReceiptPaperWidth] = useState("58mm");

  // State Notifikasi Singkat (Toast)
  const [toastMessage, setToastMessage] = useState(null);

  // Ref Input Pencarian
  const searchInputRef = useRef(null);

  // Tampilkan toast singkat
  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2500);
  }, []);

  // Fungsi Reset Transaksi Baru
  const handleResetForNewTransaction = useCallback(() => {
    setIsReceiptModalOpen(false);
    setIsPaymentModalOpen(false);
    setLastTransaction(null);
    setLastChangeBreakdown([]);
    setCart([]);
    setDiscountAmount(0);
    setCashReceived("");
    setQrisConfirmed(false);
    setTransactionNotes("");
    setFormError(null);
    // Hasilkan idempotency key baru yang segar
    setIdempotencyKey(generateIdempotencyKey());
    // Kembalikan fokus ke pencarian
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  }, []);

  // Filter Produk Berdasarkan Pencarian dan Kategori
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory = selectedCategory === null || p.category_id === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.nama_produk.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q);
      return matchCategory && matchSearch;
    });
  }, [products, searchQuery, selectedCategory]);

  // Kalkulasi Nilai Keranjang
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.harga_jual * item.quantity, 0);
  }, [cart]);

  const validDiscount = useMemo(() => {
    const disc = Number(discountAmount) || 0;
    return Math.max(0, Math.min(disc, subtotal));
  }, [discountAmount, subtotal]);

  const totalBelanja = useMemo(() => {
    return Math.max(0, subtotal - validDiscount);
  }, [subtotal, validDiscount]);

  const totalItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Kalkulasi Kembalian dan Rincian Algoritma Pecahan Uang (Greedy)
  const cashNum = Number(cashReceived) || 0;
  const changeAmount = paymentMethod === "TUNAI" ? Math.max(0, cashNum - totalBelanja) : 0;
  const isCashInsufficient = paymentMethod === "TUNAI" && cashNum < totalBelanja;
  const liveChangeBreakdown = useMemo(() => {
    if (paymentMethod === "TUNAI" && changeAmount > 0) {
      return calculateChangeBreakdown(changeAmount);
    }
    return [];
  }, [paymentMethod, changeAmount]);

  // Fungsi Tambah Produk ke Keranjang
  const addToCart = useCallback(
    (product) => {
      if (product.stok <= 0) {
        showToast(`Stok "${product.nama_produk}" habis.`);
        return;
      }

      setCart((prevCart) => {
        const existingIndex = prevCart.findIndex((item) => item.product.id === product.id);

        if (existingIndex > -1) {
          const currentQty = prevCart[existingIndex].quantity;
          if (currentQty >= product.stok) {
            showToast(`Stok maksimal untuk "${product.nama_produk}" telah tercapai (${product.stok}).`);
            return prevCart;
          }
          const updated = [...prevCart];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: currentQty + 1,
          };
          return updated;
        } else {
          return [...prevCart, { product, quantity: 1 }];
        }
      });
    },
    [showToast]
  );

  // Fungsi Ubah Kuantitas di Keranjang
  const updateQuantity = useCallback((productId, nextQty) => {
    setCart((prevCart) => {
      if (nextQty <= 0) {
        return prevCart.filter((item) => item.product.id !== productId);
      }
      return prevCart.map((item) => {
        if (item.product.id === productId) {
          const safeQty = Math.min(nextQty, item.product.stok);
          return { ...item, quantity: safeQty };
        }
        return item;
      });
    });
  }, []);

  // Fungsi Hapus Item dari Keranjang
  const removeFromCart = useCallback((productId) => {
    setCart((prevCart) => prevCart.filter((item) => item.product.id !== productId));
  }, []);

  // Fungsi Kosongkan Keranjang
  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountAmount(0);
    setFormError(null);
  }, []);

  // Tangani Scanner Barcode pada Input Pencarian
  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = searchQuery.trim().toLowerCase();
      if (!code) return;

      // Cari produk dengan barcode atau nama yang sama persis
      const exactMatch = products.find(
        (p) => p.barcode.toLowerCase() === code || p.nama_produk.toLowerCase() === code
      );

      if (exactMatch) {
        addToCart(exactMatch);
        setSearchQuery("");
        showToast(`Ditambahkan: ${exactMatch.nama_produk}`);
      } else if (filteredProducts.length === 1) {
        addToCart(filteredProducts[0]);
        setSearchQuery("");
        showToast(`Ditambahkan: ${filteredProducts[0].nama_produk}`);
      } else {
        showToast(`Produk dengan kode "${searchQuery}" tidak ditemukan.`);
      }
    }
  };

  // Shortcut Keyboard Global: F1 (Cari), F2 (Bayar), Esc (Tutup)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // F1: Fokus ke kolom pencarian produk
      if (e.key === "F1") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
      // F2: Buka dialog pembayaran jika ada item di keranjang
      else if (e.key === "F2") {
        e.preventDefault();
        if (cart.length > 0 && !isReceiptModalOpen) {
          setIsPaymentModalOpen(true);
          setFormError(null);
        }
      }
      // Esc: Tutup dialog pembayaran atau struk nota
      else if (e.key === "Escape") {
        if (isPaymentModalOpen && !isSubmitting) {
          setIsPaymentModalOpen(false);
          setFormError(null);
        } else if (isReceiptModalOpen) {
          handleResetForNewTransaction();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [cart.length, isPaymentModalOpen, isReceiptModalOpen, isSubmitting, handleResetForNewTransaction]);

  // Tombol Cepat Nominal Uang (Quick Cash Buttons)
  const setQuickCash = (nominal) => {
    setCashReceived(nominal.toString());
  };

  // Tangani Submit Transaksi Checkout
  const handleProcessCheckout = async () => {
    if (cart.length === 0) {
      setFormError("Keranjang belanja masih kosong.");
      return;
    }

    if (paymentMethod === "TUNAI" && isCashInsufficient) {
      setFormError(
        `Nominal tunai yang diterima (${formatRupiah(cashNum)}) kurang dari total belanja (${formatRupiah(totalBelanja)}).`
      );
      return;
    }

    if (paymentMethod === "QRIS" && !qrisConfirmed) {
      setFormError("Silakan konfirmasi bahwa dana pembayaran QRIS telah berhasil masuk.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload = {
      idempotencyKey,
      items: cart.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
      })),
      discountAmount: validDiscount,
      paymentMethod,
      cashReceived: paymentMethod === "TUNAI" ? cashNum : totalBelanja,
      notes: transactionNotes,
    };

    try {
      const res = await checkoutAction(payload);

      if (!res.success) {
        setFormError(res.error || "Gagal memproses transaksi kasir.");
        setIsSubmitting(false);
        return;
      }

      // Transaksi Berhasil!
      setLastTransaction(res.transaction);
      setLastChangeBreakdown(res.changeBreakdown || []);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);

      // Mutasikan sisa stok pada katalog lokal
      setProducts((prev) =>
        prev.map((p) => {
          const itemInCart = cart.find((c) => c.product.id === p.id);
          if (itemInCart) {
            return {
              ...p,
              stok: Math.max(0, p.stok - itemInCart.quantity),
            };
          }
          return p;
        })
      );
    } catch (err) {
      setFormError(err.message || "Terjadi kesalahan sistem saat checkout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tombol Cetak Struk
  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <>
      {/* ELEMEN ANTARMUKA LAYAR (Hanya tampil di monitor, disembunyikan saat window.print) */}
      <div className="space-y-4 no-print">
        {/* Toast Notifikasi Singkat */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-[var(--text-primary)] text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 animate-fade-in no-print">
            <span className="w-2 h-2 rounded-full bg-[var(--primary-accent)]" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Baris Pintasan Keyboard & Status Sistem */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-xs text-[var(--text-secondary)] no-print">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[var(--text-primary)]">Kasir Aktif:</span>
            <span className="text-[var(--primary)] font-medium">
              {currentUser.nama} ({currentUser.role})
            </span>
            <span className="text-[var(--border)]">|</span>
            <span className="hidden sm:inline">Pintasan Keyboard:</span>
            <span className="hidden sm:inline bg-[var(--background)] border border-[var(--border)] px-1.5 py-0.5 rounded font-mono text-[11px] text-[var(--text-primary)]">
              F1: Cari
            </span>
            <span className="hidden sm:inline bg-[var(--background)] border border-[var(--border)] px-1.5 py-0.5 rounded font-mono text-[11px] text-[var(--text-primary)]">
              F2: Bayar
            </span>
            <span className="hidden sm:inline bg-[var(--background)] border border-[var(--border)] px-1.5 py-0.5 rounded font-mono text-[11px] text-[var(--text-primary)]">
              Esc: Tutup
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
            <span>Sistem POS Siap Melayani</span>
          </div>
        </div>

        {/* Grid Utama POS: Katalog Kiri & Keranjang Kanan */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start no-print">
          {/* Kolom Kiri: Katalog & Pencarian (7 Kolom pada Desktop) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            {/* Bar Kontrol Pencarian & Barcode */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3 shadow-xs">
              <div className="relative">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Cari nama produk atau scan barcode SKU... (Tekan Enter / F1)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg pl-9 pr-16 py-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)] transition-colors"
                  autoFocus
                />
                <span className="absolute left-3 top-2.5 text-[var(--text-secondary)] text-sm">
                  🔍
                </span>
                <span className="absolute right-3 top-2.5 text-[10px] bg-[var(--surface)] border border-[var(--border)] px-1.5 py-0.5 rounded font-mono text-[var(--text-secondary)]">
                  F1
                </span>
              </div>

              {/* Filter Pill Kategori */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap text-xs ${
                    selectedCategory === null
                      ? "bg-[var(--primary)] text-white shadow-xs"
                      : "bg-[var(--background)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
                  }`}
                >
                  Semua Kategori
                </button>
                {initialCategories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap text-xs ${
                      selectedCategory === cat.id
                        ? "bg-[var(--primary)] text-white shadow-xs"
                        : "bg-[var(--background)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border)]"
                    }`}
                  >
                    {cat.nama}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid Produk */}
            {filteredProducts.length === 0 ? (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center text-xs text-[var(--text-secondary)]">
                <div className="text-3xl mb-2">📦</div>
                <p className="font-medium text-[var(--text-primary)]">Produk Tidak Ditemukan</p>
                <p className="mt-1">
                  Tidak ada produk aktif yang sesuai dengan kata kunci pencarian atau kategori ini.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {filteredProducts.map((p) => {
                  const isOutOfStock = p.stok <= 0;
                  const isLowStock = !isOutOfStock && p.stok <= p.stok_minimum;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !isOutOfStock && addToCart(p)}
                      disabled={isOutOfStock}
                      className={`group bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3 text-left transition-all relative flex flex-col justify-between ${
                        isOutOfStock
                          ? "opacity-50 cursor-not-allowed bg-[#FAF9F7]"
                          : "hover:border-[var(--primary)] hover:shadow-sm active:scale-[0.99] cursor-pointer"
                      }`}
                    >
                      {/* Gambar Thumbnail Produk */}
                      <div className="w-full h-28 bg-[var(--background)] rounded-lg mb-2.5 overflow-hidden flex items-center justify-center border border-[var(--border)] relative">
                        {p.gambar_path ? (
                          <img
                            src={p.gambar_path}
                            alt={p.nama_produk}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <span className="text-2xl opacity-60">🛍️</span>
                        )}

                        {/* Badge Status Stok */}
                        <div className="absolute top-1.5 right-1.5">
                          {isOutOfStock ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FCE8E6] text-[var(--danger)] border border-[#F5C2BE]">
                              Habis
                            </span>
                          ) : isLowStock ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#FEF3D6] text-[var(--warning)] border border-[#FCE39E]">
                              Sisa {p.stok}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EBF3ED] text-[var(--primary)] border border-[#D4E5D8]">
                              Stok {p.stok}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Informasi Produk */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-[var(--text-secondary)] truncate">
                          {p.barcode}
                        </div>
                        <h3 className="font-semibold text-xs text-[var(--text-primary)] line-clamp-2 leading-tight group-hover:text-[var(--primary)] transition-colors">
                          {p.nama_produk}
                        </h3>
                      </div>

                      {/* Harga Jual */}
                      <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex items-center justify-between">
                        <span className="font-bold text-xs text-[var(--primary)]">
                          {formatRupiah(p.harga_jual)}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)]">
                          /{p.satuan}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Kolom Kanan: Keranjang Belanja & Ringkasan Pembayaran (5 Kolom pada Desktop) */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4 sticky top-18">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xs overflow-hidden flex flex-col">
              {/* Header Keranjang */}
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-xs text-[var(--text-primary)]">
                    Keranjang Belanja
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--primary-accent)] text-[var(--primary)]">
                    {totalItemCount} item
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-[11px] text-[var(--danger)] hover:underline font-medium"
                  >
                    Kosongkan
                  </button>
                )}
              </div>

              {/* Daftar Item Keranjang */}
              <div className="p-3 divide-y divide-[var(--border)] max-h-[380px] overflow-y-auto">
                {cart.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[var(--text-secondary)] space-y-1">
                    <div className="text-2xl mb-1">🛒</div>
                    <p className="font-medium text-[var(--text-primary)]">Keranjang Kosong</p>
                    <p className="text-[11px]">
                      Klik produk di sebelah kiri atau pindai barcode untuk menambahkan.
                    </p>
                  </div>
                ) : (
                  cart.map((item) => {
                    const itemSubtotal = item.product.harga_jual * item.quantity;
                    const isMaxStockReached = item.quantity >= item.product.stok;

                    return (
                      <div key={item.product.id} className="py-2.5 first:pt-1 last:pb-1 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-xs text-[var(--text-primary)] truncate">
                              {item.product.nama_produk}
                            </h4>
                            <span className="text-[11px] text-[var(--text-secondary)]">
                              {formatRupiah(item.product.harga_jual)} / {item.product.satuan}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.product.id)}
                            className="text-[var(--text-secondary)] hover:text-[var(--danger)] p-1 text-xs"
                            title="Hapus item"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          {/* Stepper Kuantitas */}
                          <div className="flex items-center border border-[var(--border)] rounded-md bg-[var(--background)]">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                              className="w-7 h-6 flex items-center justify-center text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)] transition-colors rounded-l"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={item.product.stok}
                              value={item.quantity}
                              onChange={(e) =>
                                updateQuantity(item.product.id, parseInt(e.target.value) || 1)
                              }
                              className="w-9 h-6 text-center text-xs font-semibold text-[var(--text-primary)] bg-transparent focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                              disabled={isMaxStockReached}
                              className={`w-7 h-6 flex items-center justify-center text-xs font-bold transition-colors rounded-r ${
                                isMaxStockReached
                                  ? "text-gray-300 cursor-not-allowed"
                                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface)]"
                              }`}
                            >
                              +
                            </button>
                          </div>

                          {/* Subtotal Item */}
                          <span className="font-bold text-xs text-[var(--text-primary)]">
                            {formatRupiah(itemSubtotal)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Ringkasan Subtotal, Diskon, & Total Belanja */}
              <div className="p-4 bg-[var(--background)] border-t border-[var(--border)] space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Subtotal</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {formatRupiah(subtotal)}
                    </span>
                  </div>

                  {/* Input Diskon */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="text-[var(--text-secondary)]">Diskon (Rp)</span>
                    <div className="w-32">
                      <input
                        type="number"
                        min="0"
                        max={subtotal}
                        placeholder="0"
                        value={discountAmount || ""}
                        onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                        disabled={cart.length === 0}
                        className="w-full text-right bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                      />
                    </div>
                  </div>

                  {validDiscount > 0 && (
                    <div className="flex justify-between text-[11px] text-[var(--success)]">
                      <span>Hemat</span>
                      <span>- {formatRupiah(validDiscount)}</span>
                    </div>
                  )}
                </div>

                {/* Total Akhir yang Sangat Mencolok */}
                <div className="pt-2 border-t border-[var(--border)] flex items-baseline justify-between">
                  <div>
                    <span className="text-xs font-bold text-[var(--text-primary)] block">
                      Total Belanja
                    </span>
                  </div>
                  <span className="text-xl font-black text-[var(--primary)]">
                    {formatRupiah(totalBelanja)}
                  </span>
                </div>

                {/* Tombol Utama Bayar (F2) */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPaymentModalOpen(true);
                    setFormError(null);
                  }}
                  disabled={cart.length === 0}
                  className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all ${
                    cart.length === 0
                      ? "bg-[#D6D4CE] text-[#8C8B84] cursor-not-allowed"
                      : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white cursor-pointer active:scale-[0.99]"
                  }`}
                >
                  <span>Proses Pembayaran</span>
                  <span className="bg-black/20 px-2 py-0.5 rounded text-[10px] font-mono">
                    F2
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL PEMBAYARAN (TUNAI / QRIS) */}
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 backdrop-blur-xs no-print">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-scale-in">
              {/* Header Modal */}
              <div className="px-6 py-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
                <div>
                  <h3 className="font-bold text-sm text-[var(--text-primary)]">
                    Pembayaran Kasir
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Total Tagihan:{" "}
                    <span className="font-bold text-[var(--primary)]">
                      {formatRupiah(totalBelanja)}
                    </span>{" "}
                    ({totalItemCount} item)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !isSubmitting && setIsPaymentModalOpen(false)}
                  className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Body Modal */}
              <div className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 bg-[#FCE8E6] border border-[#F5C2BE] text-[var(--danger)] text-xs rounded-lg">
                    {formError}
                  </div>
                )}

                {/* Tab Pilihan Metode Pembayaran */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-[var(--background)] border border-[var(--border)] rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("TUNAI");
                      setFormError(null);
                    }}
                    className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                      paymentMethod === "TUNAI"
                        ? "bg-[var(--surface)] text-[var(--primary)] shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    💵 Pembayaran Tunai (Cash)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod("QRIS");
                      setFormError(null);
                    }}
                    className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                      paymentMethod === "QRIS"
                        ? "bg-[var(--surface)] text-[var(--primary)] shadow-xs"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    📱 QRIS Manual
                  </button>
                </div>

                {/* TAMPILAN JIKA METODE TUNAI */}
                {paymentMethod === "TUNAI" && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                        Nominal Uang Diterima dari Pelanggan (Rp)
                      </label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Masukkan nominal uang tunai..."
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                        autoFocus
                      />
                    </div>

                    {/* Tombol Cepat Uang (Quick Cash) */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-[var(--text-secondary)] block">
                        Pilihan Cepat Uang Tunai:
                      </span>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setQuickCash(totalBelanja)}
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface)] font-medium text-[var(--text-primary)] transition-colors"
                        >
                          Uang Pas
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickCash(20000)}
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface)] font-medium text-[var(--text-primary)] transition-colors"
                        >
                          Rp 20.000
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickCash(50000)}
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface)] font-medium text-[var(--text-primary)] transition-colors"
                        >
                          Rp 50.000
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickCash(100000)}
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface)] font-medium text-[var(--text-primary)] transition-colors"
                        >
                          Rp 100.000
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickCash(200000)}
                          className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] hover:bg-[var(--surface)] font-medium text-[var(--text-primary)] transition-colors"
                        >
                          Rp 200.000
                        </button>
                      </div>
                    </div>

                    {/* Kalkulasi Kembalian & Rincian Algoritma Greedy */}
                    <div className="p-3.5 bg-[var(--background)] border border-[var(--border)] rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-secondary)]">Kembalian:</span>
                        <span
                          className={`text-base font-bold ${
                            isCashInsufficient ? "text-[var(--danger)]" : "text-[var(--primary)]"
                          }`}
                        >
                          {isCashInsufficient
                            ? `Kurang ${formatRupiah(totalBelanja - cashNum)}`
                            : formatRupiah(changeAmount)}
                        </span>
                      </div>

                      {/* Penerapan Algoritma Greedy Pecahan Uang (Bukti BNSP) */}
                      {liveChangeBreakdown.length > 0 && (
                        <div className="pt-2 border-t border-[var(--border)] space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-primary)]">
                            <span>Rekomendasi Pecahan Kembalian (Algoritma Greedy):</span>
                            <span className="text-[10px] font-normal text-[var(--text-secondary)]">
                              {liveChangeBreakdown.reduce((sum, d) => sum + d.count, 0)} keping/lembar
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-[11px]">
                            {liveChangeBreakdown.map((denom, idx) => (
                              <div
                                key={idx}
                                className="px-2 py-1 rounded bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between"
                              >
                                <span className="text-[var(--text-secondary)]">{denom.label}</span>
                                <span className="font-bold text-[var(--primary)]">
                                  {denom.count}x
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAMPILAN JIKA METODE QRIS */}
                {paymentMethod === "QRIS" && (
                  <div className="space-y-4 text-center">
                    <div className="p-4 bg-[var(--background)] border border-[var(--border)] rounded-xl space-y-3">
                      {/* Kartu QR Code QRIS Standar */}
                      <div className="w-56 h-56 mx-auto bg-white p-3 rounded-xl border border-[var(--border)] flex flex-col items-center justify-center shadow-xs">
                        <img
                          src={storeSettings.qris_image_path || "/images/qris-toko.png"}
                          alt="QRIS Pembayaran KasirKita"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-[11px] text-[var(--text-secondary)] block">
                          Nominal Transfer QRIS:
                        </span>
                        <span className="text-xl font-black text-[var(--primary)]">
                          {formatRupiah(totalBelanja)}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] block">
                          Tunjukkan QR Code ini kepada pelanggan untuk dipindai melalui e-wallet / m-banking.
                        </span>
                      </div>
                    </div>

                    {/* Checkbox Konfirmasi Kasir */}
                    <label className="flex items-start gap-2.5 text-left p-3 rounded-lg border border-[#D2DFD4] bg-[var(--primary-accent)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qrisConfirmed}
                        onChange={(e) => setQrisConfirmed(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
                      />
                      <span className="text-xs text-[var(--text-primary)] font-medium leading-tight">
                        Saya memastikan dana sebesar {formatRupiah(totalBelanja)} telah berhasil masuk
                        ke mutasi/notifikasi QRIS toko.
                      </span>
                    </label>
                  </div>
                )}

                {/* Catatan Transaksi Opsional */}
                <div>
                  <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                    Catatan Transaksi (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="Misal: Nama pelanggan atau permintaan khusus..."
                    value={transactionNotes}
                    onChange={(e) => setTransactionNotes(e.target.value)}
                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              {/* Footer Modal Pembayaran */}
              <div className="px-6 py-3.5 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Batal (Esc)
                </button>
                <button
                  type="button"
                  onClick={handleProcessCheckout}
                  disabled={
                    isSubmitting ||
                    (paymentMethod === "TUNAI" && isCashInsufficient) ||
                    (paymentMethod === "QRIS" && !qrisConfirmed)
                  }
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 ${
                    isSubmitting ||
                    (paymentMethod === "TUNAI" && isCashInsufficient) ||
                    (paymentMethod === "QRIS" && !qrisConfirmed)
                      ? "bg-[#D6D4CE] text-[#8C8B84] cursor-not-allowed"
                      : "bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white cursor-pointer active:scale-[0.99]"
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Memproses Transaksi...</span>
                    </>
                  ) : (
                    <span>Selesaikan &amp; Cetak Struk</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL SUKSES & PREVIEW STRUK THERMAL LAYAR */}
        {isReceiptModalOpen && lastTransaction && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-xs no-print">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              {/* Header Modal Struk */}
              <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between bg-[var(--background)]">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--success)]" />
                  <h3 className="font-bold text-xs text-[var(--text-primary)]">
                    Transaksi Berhasil
                  </h3>
                </div>

                {/* Opsi Ukuran Kertas Thermal */}
                <div className="flex items-center gap-1 text-[11px]">
                  <span className="text-[var(--text-secondary)]">Kertas:</span>
                  <button
                    type="button"
                    onClick={() => setReceiptPaperWidth("58mm")}
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      receiptPaperWidth === "58mm"
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]"
                    }`}
                  >
                    58mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiptPaperWidth("80mm")}
                    className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      receiptPaperWidth === "80mm"
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)]"
                    }`}
                  >
                    80mm
                  </button>
                </div>
              </div>

              {/* Container Preview Struk Thermal di Layar Komputer */}
              <div className="p-4 overflow-y-auto flex-1 flex justify-center bg-[#F4F3EF]">
                <ThermalReceiptContent
                  transaction={lastTransaction}
                  storeSettings={storeSettings}
                  cashierName={currentUser.nama}
                  paperWidth={receiptPaperWidth}
                  isPrintVersion={false}
                />
              </div>

              {/* Rincian Algoritma Kembalian (Layar Kasir) */}
              {lastChangeBreakdown.length > 0 && (
                <div className="px-5 py-2.5 bg-[var(--background)] border-t border-[var(--border)] text-xs space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--text-primary)]">
                    <span>Pecahan Uang Kembalian (Greedy):</span>
                    <span className="text-[10px] text-[var(--primary)] font-bold">
                      Total {formatRupiah(lastTransaction.kembalian)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    {lastChangeBreakdown.map((d, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] font-medium text-[var(--text-primary)]"
                      >
                        {d.count}x {d.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer Aksi Modal Struk */}
              <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleResetForNewTransaction}
                  className="px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--background)] hover:bg-[#EFECE6] text-xs font-semibold text-[var(--text-primary)] transition-colors"
                >
                  Transaksi Baru (Esc)
                </button>
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span>🖨️ Cetak Struk (Enter)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ELEMEN KHUSUS CETAK STRUK THERMAL (HANYA AKTIF SAAT WINDOW.PRINT) */}
      {lastTransaction && (() => {
        const itemCount = lastTransaction.items?.length || 1;
        const estimatedPageHeightMm = Math.max(85, Math.ceil(75 + itemCount * 9));
        const printPageWidth = receiptPaperWidth === "80mm" ? "80mm" : "58mm";

        return (
          <>
            {/* Injeksi spesifikasi @page dinamis sesuai pilihan kertas (58mm vs 80mm) & tinggi konten */}
            <style>{`
              @media print {
                @page {
                  size: ${printPageWidth} ${estimatedPageHeightMm}mm;
                  margin: 0mm;
                }
              }
            `}</style>
            <div id="thermal-receipt-print-area" className="print-only">
              <ThermalReceiptContent
                transaction={lastTransaction}
                storeSettings={storeSettings}
                cashierName={currentUser.nama}
                paperWidth={receiptPaperWidth}
                isPrintVersion={true}
              />
            </div>
          </>
        );
      })()}
    </>
  );
}

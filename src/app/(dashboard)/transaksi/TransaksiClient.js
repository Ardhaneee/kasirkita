"use client";

import { useState, useTransition } from "react";
import { getTransactionsAction } from "@/actions/reportActions";

function formatRupiah(val) {
  return "Rp " + Number(val || 0).toLocaleString("id-ID");
}

export default function TransaksiClient({
  initialData,
  cashiers,
  isPemilik,
  storeSettings,
}) {
  const [transactions, setTransactions] = useState(initialData.transactions);
  const [pagination, setPagination] = useState(initialData.pagination);
  const [isPending, startTransition] = useTransition();

  // State Filter
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALL");
  const [cashierId, setCashierId] = useState("ALL");

  // State Modal Detail & Cetak Ulang
  const [selectedTrx, setSelectedTrx] = useState(null);
  const [paperWidth, setPaperWidth] = useState("58mm");
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleApplyFilter = (page = 1) => {
    startTransition(async () => {
      const res = await getTransactionsAction({
        page,
        limit: pagination.limit || 15,
        search,
        dateRange,
        startDate,
        endDate,
        paymentMethod,
        cashierId,
      });

      setTransactions(res.transactions);
      setPagination(res.pagination);
    });
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    handleApplyFilter(newPage);
  };

  const handlePrintReceipt = () => {
    if (!selectedTrx) return;
    showToast(`Membuka dialog cetak nota #${selectedTrx.invoiceNumber}...`);
    window.print();
  };

  const is58 = paperWidth === "58mm";

  return (
    <div className="space-y-6">
      {/* Toast Notifikasi */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[var(--text-primary)] text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 no-print">
          <span className="w-2 h-2 rounded-full bg-[var(--primary-accent)]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Halaman (no-print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Riwayat Transaksi Penjualan
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Daftar faktur, detail belanja pelanggan, dan fasilitas cetak ulang nota kasir
          </p>
        </div>
        <div className="text-xs font-medium text-[var(--text-secondary)] bg-[var(--surface)] border border-[var(--border)] rounded-lg px-3 py-1.5 self-start">
          Total Transaksi:{" "}
          <span className="font-bold text-[var(--primary)]">{pagination.totalCount}</span>
        </div>
      </div>

      {/* FILTER PANEL (no-print) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* 1. Pencarian Faktur */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Cari No. Faktur
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleApplyFilter(1)}
              placeholder="Contoh: INV-20261116..."
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-hidden focus:ring-1 focus:ring-[var(--primary)] text-xs"
            />
          </div>

          {/* 2. Rentang Tanggal */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Rentang Tanggal
            </label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-hidden focus:ring-1 focus:ring-[var(--primary)] text-xs"
            >
              <option value="ALL">Semua Waktu</option>
              <option value="TODAY">Hari Ini (WIB)</option>
              <option value="7DAYS">7 Hari Terakhir</option>
              <option value="30DAYS">30 Hari Terakhir</option>
              <option value="CUSTOM">Rentang Kustom...</option>
            </select>
          </div>

          {/* 3. Metode Pembayaran */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Metode Pembayaran
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-hidden focus:ring-1 focus:ring-[var(--primary)] text-xs"
            >
              <option value="ALL">Semua Metode</option>
              <option value="TUNAI">💵 Tunai (Cash)</option>
              <option value="QRIS">📱 QRIS</option>
            </select>
          </div>

          {/* 4. Filter Kasir */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Operator Kasir
            </label>
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] focus:outline-hidden focus:ring-1 focus:ring-[var(--primary)] text-xs"
            >
              <option value="ALL">Semua Kasir</option>
              {cashiers?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama} ({c.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Input Tanggal Kustom (Jika dipilih) */}
        {dateRange === "CUSTOM" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--border)] text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs"
              />
            </div>
          </div>
        )}

        {/* Tombol Terapkan */}
        <div className="flex items-center justify-between pt-1">
          <div className="text-[11px] text-[var(--text-secondary)]">
            {isPending ? "Memuat transaksi..." : `Menampilkan ${transactions.length} dari ${pagination.totalCount} transaksi`}
          </div>
          <button
            type="button"
            onClick={() => handleApplyFilter(1)}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isPending ? "Menyaring..." : "Terapkan Filter"}
          </button>
        </div>
      </div>

      {/* TABEL TRANSAKSI (no-print) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xs overflow-hidden no-print">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--background)] border-b border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                <th className="py-3 px-4">No. Faktur</th>
                <th className="py-3 px-4">Waktu Transaksi</th>
                <th className="py-3 px-4">Kasir</th>
                <th className="py-3 px-4 text-center">Metode</th>
                <th className="py-3 px-4 text-center">Item</th>
                <th className="py-3 px-4 text-right">Total Belanja</th>
                {isPemilik && <th className="py-3 px-4 text-right">Estimasi Laba</th>}
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-xs">
              {transactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={isPemilik ? 8 : 7}
                    className="py-12 text-center text-xs text-[var(--text-secondary)]"
                  >
                    Tidak ditemukan data transaksi yang sesuai filter.
                  </td>
                </tr>
              ) : (
                transactions.map((trx) => (
                  <tr key={trx.id} className="hover:bg-[var(--background)] transition-colors">
                    {/* No Faktur */}
                    <td className="py-3 px-4 font-mono font-bold text-[var(--text-primary)]">
                      {trx.invoiceNumber}
                    </td>

                    {/* Waktu */}
                    <td className="py-3 px-4 text-[var(--text-secondary)]">
                      <div className="font-medium text-[var(--text-primary)]">
                        {trx.tanggalFormat}
                      </div>
                      <div className="text-[11px]">{trx.waktuJam} WIB</div>
                    </td>

                    {/* Kasir */}
                    <td className="py-3 px-4 font-medium text-[var(--text-primary)]">
                      {trx.kasirNama}
                    </td>

                    {/* Metode */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          trx.metodePembayaran === "QRIS"
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {trx.metodePembayaran}
                      </span>
                    </td>

                    {/* Total Item */}
                    <td className="py-3 px-4 text-center font-bold text-[var(--text-primary)] tabular-nums">
                      {trx.totalItem}
                    </td>

                    {/* Total Belanja */}
                    <td className="py-3 px-4 text-right font-black text-[var(--primary)] tabular-nums">
                      {formatRupiah(trx.totalBelanja)}
                    </td>

                    {/* Laba Kotor (Khusus Pemilik) */}
                    {isPemilik && (
                      <td className="py-3 px-4 text-right font-bold text-emerald-800 tabular-nums">
                        {formatRupiah(trx.labaKotor)}
                      </td>
                    )}

                    {/* Aksi */}
                    <td className="py-3 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedTrx(trx)}
                        className="px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[#EFECE6] text-xs font-semibold text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>🧾</span>
                        <span>Detail & Cetak</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--background)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <div>
              Halaman <span className="font-bold text-[var(--text-primary)]">{pagination.page}</span> dari{" "}
              <span className="font-bold text-[var(--text-primary)]">{pagination.totalPages}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || isPending}
                className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[#F2EFE9] disabled:opacity-40 font-medium"
              >
                ← Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || isPending}
                className="px-2.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] hover:bg-[#F2EFE9] disabled:opacity-40 font-medium"
              >
                Selanjutnya →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DETAIL & CETAK ULANG STRUK (no-print) */}
      {selectedTrx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs no-print">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header Modal */}
            <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">
                  Detail Transaksi #{selectedTrx.invoiceNumber}
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  {selectedTrx.tanggalFormat} • Kasir: {selectedTrx.kasirNama}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Opsi Kertas Cetak */}
                <div className="flex items-center bg-[var(--background)] p-0.5 rounded-lg border border-[var(--border)] text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPaperWidth("58mm")}
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      paperWidth === "58mm"
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    58mm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaperWidth("80mm")}
                    className={`px-2 py-0.5 rounded font-mono font-bold ${
                      paperWidth === "80mm"
                        ? "bg-[var(--primary)] text-white"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    80mm
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTrx(null)}
                  className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-black hover:bg-[var(--background)]"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Konten Scrollable */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Tabel Rincian Produk */}
              <div>
                <div className="text-[11px] font-bold text-[var(--text-secondary)] uppercase mb-2">
                  Daftar Barang Belanja ({selectedTrx.items?.length} item)
                </div>
                <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-[var(--background)] border-b border-[var(--border)] text-[10px] font-semibold text-[var(--text-secondary)]">
                        <th className="py-2 px-3">Produk</th>
                        <th className="py-2 px-3 text-center">Qty</th>
                        <th className="py-2 px-3 text-right">Harga Jual</th>
                        <th className="py-2 px-3 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-xs">
                      {selectedTrx.items?.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 px-3 font-medium text-[var(--text-primary)]">
                            {item.namaProduk}
                          </td>
                          <td className="py-2 px-3 text-center tabular-nums font-bold">
                            {item.kuantitas}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums text-[var(--text-secondary)]">
                            {formatRupiah(item.hargaJual)}
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-bold text-[var(--text-primary)]">
                            {formatRupiah(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Rincian Pembayaran */}
              <div className="bg-[var(--background)] border border-[var(--border)] rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Subtotal Item</span>
                  <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                    {formatRupiah(selectedTrx.subtotal)}
                  </span>
                </div>
                {selectedTrx.diskon > 0 && (
                  <div className="flex justify-between text-emerald-800 font-medium">
                    <span>Potongan Diskon</span>
                    <span className="tabular-nums">- {formatRupiah(selectedTrx.diskon)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black text-[var(--primary)] pt-1 border-t border-[var(--border)]">
                  <span>TOTAL BELANJA</span>
                  <span className="tabular-nums">{formatRupiah(selectedTrx.totalBelanja)}</span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)] pt-1">
                  <span>Metode Pembayaran</span>
                  <span className="font-bold text-[var(--text-primary)]">
                    {selectedTrx.metodePembayaran}
                  </span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Nominal Diterima</span>
                  <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                    {formatRupiah(selectedTrx.nominalBayar)}
                  </span>
                </div>
                <div className="flex justify-between text-[var(--text-secondary)]">
                  <span>Kembalian</span>
                  <span className="font-semibold text-[var(--text-primary)] tabular-nums">
                    {formatRupiah(selectedTrx.kembalian)}
                  </span>
                </div>
              </div>

              {/* Catatan Info Cetak Ulang */}
              <div className="text-[11px] text-[var(--text-secondary)] bg-[#FDFEFC] border border-[#E3ECE5] rounded-lg p-3">
                <span className="font-bold text-[var(--primary)]">ℹ️ Info Cetak Ulang:</span> Tindakan cetak ulang nota ini bersifat *read-only* (tidak memodifikasi database atau stok barang toko).
              </div>
            </div>

            {/* Footer Modal */}
            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedTrx(null)}
                className="px-3.5 py-2 rounded-xl border border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--background)] transition-colors"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="px-4 py-2 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span>🖨️</span>
                <span>Cetak Ulang Nota</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ELEMEN KHUSUS CETAK STRUK THERMAL (HANYA AKTIF SAAT WINDOW.PRINT) */}
      {selectedTrx && (() => {
        const itemCount = selectedTrx.items?.length || 1;
        const estimatedPageHeightMm = Math.max(85, Math.ceil(75 + itemCount * 9));
        const printPageWidth = paperWidth === "80mm" ? "80mm" : "58mm";

        return (
          <>
            <style>{`
              @media print {
                @page {
                  size: ${printPageWidth} ${estimatedPageHeightMm}mm;
                  margin: 0mm;
                }
              }
            `}</style>
            <div id="thermal-receipt-print-area" className="print-only">
              <div
                className={`bg-white text-black mx-auto leading-tight ${
                  is58 ? "w-[240px] text-xs p-3" : "w-[320px] text-xs p-4"
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
                    {storeSettings?.nama_toko || "KASIRKITA RETAIL"}
                  </div>
                  <div
                    className="leading-tight break-words mt-0.5"
                    style={{ fontSize: is58 ? "8.5px" : "9.5px" }}
                  >
                    {storeSettings?.alamat || "Jl. Margonda Raya No. 123"}
                  </div>
                  <div style={{ fontSize: is58 ? "8.5px" : "9.5px" }}>
                    Telp: {storeSettings?.no_telepon || "0812-3456-7890"}
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

                {/* METADATA NOTA */}
                <div style={{ fontSize: is58 ? "9px" : "10px" }}>
                  <div className="flex justify-between items-baseline my-0.5">
                    <span>No. Faktur</span>
                    <span className="font-bold">{selectedTrx.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between items-baseline my-0.5">
                    <span>Tanggal</span>
                    <span>{selectedTrx.tanggalFormat}</span>
                  </div>
                  <div className="flex justify-between items-baseline my-0.5">
                    <span>Kasir</span>
                    <span className="truncate max-w-[140px]">{selectedTrx.kasirNama}</span>
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

                {/* DAFTAR ITEM */}
                <div style={{ fontSize: is58 ? "9px" : "10px" }}>
                  {selectedTrx.items?.map((item, idx) => (
                    <div key={idx} className="my-0.5" style={{ breakInside: "avoid" }}>
                      <div className="font-bold break-words leading-tight mb-0.5">
                        {item.namaProduk}
                      </div>
                      <div className="flex justify-between items-baseline text-gray-800">
                        <span>
                          {item.kuantitas} x {formatRupiah(item.hargaJual)}
                        </span>
                        <span className="font-bold text-black">{formatRupiah(item.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

                {/* RINCIAN PEMBAYARAN */}
                <div style={{ fontSize: is58 ? "9px" : "10px" }}>
                  <div className="flex justify-between items-baseline my-0.5">
                    <span>Subtotal</span>
                    <span>{formatRupiah(selectedTrx.subtotal)}</span>
                  </div>
                  {selectedTrx.diskon > 0 && (
                    <div className="flex justify-between items-baseline my-0.5">
                      <span>Diskon</span>
                      <span>- {formatRupiah(selectedTrx.diskon)}</span>
                    </div>
                  )}
                  <div
                    className="flex justify-between items-baseline font-bold my-0.5 pt-0.5"
                    style={{ fontSize: is58 ? "11px" : "12.5px", borderTop: "1px dotted #000" }}
                  >
                    <span>TOTAL</span>
                    <span>{formatRupiah(selectedTrx.totalBelanja)}</span>
                  </div>
                  <div className="flex justify-between items-baseline my-0.5">
                    <span>Bayar ({selectedTrx.metodePembayaran})</span>
                    <span>{formatRupiah(selectedTrx.nominalBayar)}</span>
                  </div>
                  <div className="flex justify-between items-baseline my-0.5">
                    <span>Kembalian</span>
                    <span>{formatRupiah(selectedTrx.kembalian)}</span>
                  </div>
                </div>

                <div style={{ borderTop: "1px dashed #000", margin: "1.2mm 0" }}></div>

                {/* FOOTER NOTA */}
                <div
                  className="text-center pt-0.5"
                  style={{ fontSize: is58 ? "8px" : "9px" }}
                >
                  <p>Terima kasih telah berbelanja!</p>
                  <p>Semoga harimu menyenangkan.</p>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

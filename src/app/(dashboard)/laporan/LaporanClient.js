"use client";

import { useState, useTransition } from "react";
import { getSalesReportAction, exportSalesReportCsvAction } from "@/actions/reportActions";

function formatRupiah(val) {
  return "Rp " + Number(val || 0).toLocaleString("id-ID");
}

export default function LaporanClient({ initialData }) {
  const [data, setData] = useState(initialData);
  const [startDate, setStartDate] = useState(initialData.period.startDate);
  const [endDate, setEndDate] = useState(initialData.period.endDate);
  const [isPending, startTransition] = useTransition();
  const [toastMessage, setToastMessage] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 4000);
  };

  // Helper Preset Tanggal (WIB)
  const applyPreset = (daysBack) => {
    const now = new Date();
    // Gunakan tanggal WIB
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const endStr = formatter.format(now);
    let startStr = endStr;

    if (daysBack === "THIS_MONTH") {
      const parts = endStr.split("-");
      startStr = `${parts[0]}-${parts[1]}-01`;
    } else if (daysBack > 0) {
      const pastDate = new Date(now.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000);
      startStr = formatter.format(pastDate);
    }

    setStartDate(startStr);
    setEndDate(endStr);

    startTransition(async () => {
      const res = await getSalesReportAction({ startDate: startStr, endDate: endStr });
      setData(res);
      showToast(`Laporan diperbarui: ${startStr} s/d ${endStr}`);
    });
  };

  const handleApplyFilter = () => {
    if (!startDate || !endDate) {
      showToast("Silakan pilih tanggal awal dan tanggal akhir.");
      return;
    }

    startTransition(async () => {
      const res = await getSalesReportAction({ startDate, endDate });
      setData(res);
      showToast(`Filter laporan diterapkan.`);
    });
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await exportSalesReportCsvAction({ startDate, endDate });
      if (res.success && res.csvContent) {
        // Trigger browser download via Blob
        const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", res.filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(`File ${res.filename} berhasil diunduh.`);
      } else {
        showToast("Gagal mengunduh file laporan CSV.");
      }
    } catch (err) {
      showToast("Terjadi kesalahan saat mengekspor CSV: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const { summary, paymentMethods, dailyTrends, topSellingProducts, period } = data;

  // Nilai maksimum untuk skala visualisasi grafik harian
  const maxDayOmzet = Math.max(...(dailyTrends.map((d) => d.omzet) || [0]), 50000);

  return (
    <div className="space-y-6">
      {/* Toast Notifikasi */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-[var(--text-primary)] text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--primary-accent)]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Laporan Analisis Penjualan & Keuangan
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Perhitungan omzet riil, harga pokok penjualan historis, dan estimasi laba kotor toko
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={isExporting}
          className="px-4 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer self-start disabled:opacity-50"
        >
          <span>📥</span>
          <span>{isExporting ? "Mengekspor..." : "Ekspor CSV (Excel)"}</span>
        </button>
      </div>

      {/* FILTER PERIODE & PRESET TOOLBAR */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
          <span className="text-xs font-bold text-[var(--text-primary)]">Pilihan Cepat Rentang Waktu:</span>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => applyPreset(1)}
              className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[#EFECE6] font-medium text-[var(--text-primary)] transition-colors"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => applyPreset(7)}
              className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[#EFECE6] font-medium text-[var(--text-primary)] transition-colors"
            >
              7 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[#EFECE6] font-medium text-[var(--text-primary)] transition-colors"
            >
              30 Hari Terakhir
            </button>
            <button
              type="button"
              onClick={() => applyPreset("THIS_MONTH")}
              className="px-2.5 py-1 rounded-md border border-[var(--border)] bg-[var(--background)] hover:bg-[#EFECE6] font-medium text-[var(--text-primary)] transition-colors"
            >
              Bulan Ini
            </button>
          </div>
        </div>

        {/* Date Inputs & Apply Button */}
        <div className="flex flex-wrap items-end gap-3 text-xs pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Tanggal Mulai (WIB)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
              Tanggal Selesai (WIB)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-mono"
            />
          </div>
          <button
            type="button"
            onClick={handleApplyFilter}
            disabled={isPending}
            className="px-4 py-2 rounded-lg bg-[var(--surface)] hover:bg-[#F2EFE9] border border-[var(--border)] text-xs font-bold text-[var(--text-primary)] transition-colors disabled:opacity-50"
          >
            {isPending ? "Memuat..." : "Terapkan Rentang"}
          </button>
          <span className="text-[11px] text-[var(--text-secondary)] self-center ml-auto">
            Periode aktif: <span className="font-semibold text-[var(--text-primary)]">{period.startDate}</span> s/d{" "}
            <span className="font-semibold text-[var(--text-primary)]">{period.endDate}</span>
          </span>
        </div>
      </div>

      {/* 1. KARTU METRIK KEUANGAN UTAMA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Omzet */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] font-medium mb-1">
            Total Omzet Penjualan
          </div>
          <div className="text-2xl font-black text-[var(--primary)] tabular-nums">
            {formatRupiah(summary.omzet)}
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Dari {summary.totalTransaksi} transaksi selesai
          </p>
        </div>

        {/* Total HPP */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] font-medium mb-1">
            Harga Pokok Penjualan (HPP)
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
            {formatRupiah(summary.hpp)}
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Total modal barang dari snapshot transaksi
          </p>
        </div>

        {/* Estimasi Laba Kotor */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium mb-1">
            <span>Estimasi Laba Kotor</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              {summary.marginLabaPersen}% margin
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-800 tabular-nums">
            {formatRupiah(summary.labaKotor)}
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Omzet dikurangi HPP Historis
          </p>
        </div>

        {/* Ringkasan Item & Diskon */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="text-xs text-[var(--text-secondary)] font-medium mb-1">
            Volume & Rata-rata Belanja
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
            {summary.totalItemTerjual}{" "}
            <span className="text-sm font-semibold text-[var(--text-secondary)]">item</span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex justify-between">
            <span>Basket Size: {formatRupiah(summary.basketSize)}</span>
            <span>Diskon: {formatRupiah(summary.totalDiskon)}</span>
          </div>
        </div>
      </div>

      {/* 2. DUA KARTU: REKAP METODE PEMBAYARAN & GRAFIK TREN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rekap Metode Pembayaran (1 Kolom) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="pb-3 border-b border-[var(--border)]">
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Rekap Metode Pembayaran
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Perbandingan penerimaan Tunai vs QRIS Manual
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {/* Tunai */}
            <div className="p-3.5 rounded-lg bg-[var(--background)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <span>💵</span>
                  <span>Tunai (Cash)</span>
                </span>
                <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                  {paymentMethods.tunai.count} transaksi · {paymentMethods.tunai.percent}% omzet
                </span>
              </div>
              <div className="text-lg font-black text-[var(--primary)] tabular-nums">
                {formatRupiah(paymentMethods.tunai.omzet)}
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div
                  style={{ width: `${paymentMethods.tunai.percent}%` }}
                  className="bg-[var(--primary)] h-full transition-all duration-300"
                />
              </div>
            </div>

            {/* QRIS */}
            <div className="p-3.5 rounded-lg bg-[var(--background)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                  <span>📱</span>
                  <span>QRIS Manual</span>
                </span>
                <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                  {paymentMethods.qris.count} transaksi · {paymentMethods.qris.percent}% omzet
                </span>
              </div>
              <div className="text-lg font-black text-purple-700 tabular-nums">
                {formatRupiah(paymentMethods.qris.omzet)}
              </div>
              <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                <div
                  style={{ width: `${paymentMethods.qris.percent}%` }}
                  className="bg-purple-600 h-full transition-all duration-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Grafik Tren Harian (2 Kolom) */}
        <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Tren Penjualan Harian Pada Periode Ini
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Agregasi omzet harian berdasarkan transaksi selesai
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[var(--primary)]" />
                <span className="text-[var(--text-secondary)]">Omzet</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400" />
                <span className="text-[var(--text-secondary)]">Laba Kotor</span>
              </span>
            </div>
          </div>

          {dailyTrends.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-[var(--text-secondary)]">
              Tidak ada data penjualan pada rentang tanggal ini.
            </div>
          ) : (
            <div className="pt-2">
              <div className="flex items-end gap-2 h-44 overflow-x-auto pb-2 px-1">
                {dailyTrends.map((d) => {
                  const omzetPct = Math.min(
                    100,
                    Math.max(6, Math.round((d.omzet / maxDayOmzet) * 100))
                  );
                  const labaPct = Math.min(
                    omzetPct,
                    Math.max(3, Math.round((d.labaKotor / maxDayOmzet) * 100))
                  );

                  return (
                    <div
                      key={d.dateString}
                      className="flex-1 min-w-[36px] flex flex-col items-center h-full justify-end group"
                    >
                      {/* Bars */}
                      <div className="w-full flex items-end justify-center gap-0.5 h-full pb-1">
                        <div
                          style={{ height: `${omzetPct}%` }}
                          className="w-1/2 bg-[var(--primary)] rounded-t-xs transition-all group-hover:opacity-85"
                          title={`Omzet: ${formatRupiah(d.omzet)}`}
                        />
                        <div
                          style={{ height: `${labaPct}%` }}
                          className="w-1/2 bg-emerald-400 rounded-t-xs transition-all group-hover:opacity-85"
                          title={`Laba: ${formatRupiah(d.labaKotor)}`}
                        />
                      </div>
                      {/* Label */}
                      <div className="text-[10px] text-center font-semibold text-[var(--text-secondary)] truncate w-full pt-1 border-t border-[var(--border)]">
                        {d.dateString.slice(5)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. TABEL PRODUK TERLARIS DALAM PERIODE */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Peringkat Produk Terlaris (Top Selling Products)
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Dihitung dari total kuantitas unit terjual pada rentang waktu yang dipilih
            </p>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">
            Total {topSellingProducts.length} produk berkontribusi
          </span>
        </div>

        {topSellingProducts.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
            Belum ada penjualan produk pada rentang tanggal ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--background)] border-b border-[var(--border)] text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                  <th className="py-3 px-3 w-10 text-center">Rank</th>
                  <th className="py-3 px-3">Barcode</th>
                  <th className="py-3 px-3">Nama Produk</th>
                  <th className="py-3 px-3">Kategori</th>
                  <th className="py-3 px-3 text-center">Terjual</th>
                  <th className="py-3 px-3 text-right">Total Omzet</th>
                  <th className="py-3 px-3 text-right">Total HPP</th>
                  <th className="py-3 px-3 text-right">Estimasi Laba Kotor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] text-xs">
                {topSellingProducts.map((p) => (
                  <tr key={p.productId} className="hover:bg-[var(--background)] transition-colors">
                    <td className="py-3 px-3 text-center font-bold text-[var(--text-secondary)]">
                      {p.rank <= 3 ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--primary-accent)] text-[var(--primary)] text-[11px] font-black">
                          {p.rank}
                        </span>
                      ) : (
                        p.rank
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[var(--text-secondary)]">
                      {p.barcode}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[var(--text-primary)]">
                      {p.namaProduk}
                    </td>
                    <td className="py-3 px-3 text-[var(--text-secondary)]">
                      {p.kategori}
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-[var(--text-primary)] tabular-nums">
                      {p.qtyTerjual}
                    </td>
                    <td className="py-3 px-3 text-right font-black text-[var(--primary)] tabular-nums">
                      {formatRupiah(p.totalOmzet)}
                    </td>
                    <td className="py-3 px-3 text-right text-[var(--text-secondary)] tabular-nums">
                      {formatRupiah(p.totalHpp)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-800 tabular-nums">
                      {formatRupiah(p.totalLabaKotor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

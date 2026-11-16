"use client";

import { useState } from "react";
import Link from "next/link";

function formatRupiah(val) {
  return "Rp " + Number(val || 0).toLocaleString("id-ID");
}

export default function DashboardClient({ initialData }) {
  const { today, inventoryStatus, chart7Hari, top5Products, recent5Transactions } =
    initialData;

  const [activeTooltip, setActiveTooltip] = useState(null);

  // Cari nilai omzet tertinggi untuk scaling tinggi grafik SVG
  const maxOmzet = Math.max(...chart7Hari.map((d) => d.omzet), 50000);

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            Dashboard Pemilik Usaha
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Ikhtisar analitik penjualan harian, estimasi margin laba, dan kondisi inventori
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/laporan"
            className="px-3.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[#F2EFE9] text-xs font-medium text-[var(--text-primary)] transition-colors inline-flex items-center gap-1.5"
          >
            📊 Buka Laporan Detail
          </Link>
          <Link
            href="/pos"
            className="px-3.5 py-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
          >
            🛒 Buka Kasir POS
          </Link>
        </div>
      </div>

      {/* 1. KARTU METRIK UTAMA HARI INI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Omzet Hari Ini */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
            <span className="font-medium">Omzet Hari Ini</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--primary-accent)] text-[var(--primary)]">
              WIB
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--primary)] tabular-nums">
            {formatRupiah(today.omzet)}
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center justify-between">
            <span>Diskon: {formatRupiah(today.diskon)}</span>
            <span>Rata-rata: {formatRupiah(today.basketSize)}</span>
          </div>
        </div>

        {/* Estimasi Laba Kotor Hari Ini */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
            <span className="font-medium">Estimasi Laba Kotor</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              {today.omzet > 0
                ? `${((today.labaKotor / today.omzet) * 100).toFixed(1)}%`
                : "0%"}
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-800 tabular-nums">
            {formatRupiah(today.labaKotor)}
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Dihitung dari Omzet dikurangi HPP Snapshot
          </p>
        </div>

        {/* Transaksi Hari Ini */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
            <span className="font-medium">Transaksi Hari Ini</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
              Selesai
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
            {today.jumlahTransaksi}{" "}
            <span className="text-sm font-semibold text-[var(--text-secondary)]">
              nota
            </span>
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
            Total {today.totalItem} barang terjual hari ini
          </p>
        </div>

        {/* Status Stok Menipis / Habis */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1.5">
            <span className="font-medium">Peringatan Inventori</span>
            <Link
              href="/stok"
              className="text-[10px] font-semibold text-[var(--primary)] hover:underline"
            >
              Lihat Stok →
            </Link>
          </div>
          <div className="text-2xl font-black text-[#B87D35] tabular-nums">
            {inventoryStatus.totalKritis}{" "}
            <span className="text-sm font-semibold text-[var(--text-secondary)]">
              produk
            </span>
          </div>
          <div className="mt-2 text-[11px] text-[var(--text-secondary)] flex items-center gap-2">
            <span className="text-[#B85248] font-medium">
              ● {inventoryStatus.stokHabis} Habis
            </span>
            <span className="text-[#B87D35] font-medium">
              ● {inventoryStatus.stokMenipis} Menipis
            </span>
          </div>
        </div>
      </div>

      {/* 2. GRAFIK OMZET 7 HARI TERAKHIR */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Tren Omzet & Laba Kotor 7 Hari Terakhir
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Grafik penjualan harian berdasarkan data transaksi selesai di PostgreSQL
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[var(--primary)]" />
              <span className="text-[var(--text-secondary)]">Omzet</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-400" />
              <span className="text-[var(--text-secondary)]">Laba Kotor</span>
            </div>
          </div>
        </div>

        {/* Visualisasi Bar Chart Sederhana & Bersih */}
        <div className="pt-2">
          <div className="grid grid-cols-7 gap-2 sm:gap-4 h-48 items-end px-2">
            {chart7Hari.map((day, idx) => {
              const omzetHeightPercent = Math.min(
                100,
                Math.max(4, Math.round((day.omzet / maxOmzet) * 100))
              );
              const labaHeightPercent = Math.min(
                omzetHeightPercent,
                Math.max(2, Math.round((day.labaKotor / maxOmzet) * 100))
              );

              return (
                <div
                  key={day.dateString}
                  className="relative flex flex-col items-center h-full justify-end group cursor-pointer"
                  onMouseEnter={() => setActiveTooltip(idx)}
                  onMouseLeave={() => setActiveTooltip(null)}
                >
                  {/* Tooltip Hover Info */}
                  {activeTooltip === idx && (
                    <div className="absolute -top-16 z-30 bg-[#24251F] text-white text-[11px] rounded-lg py-1.5 px-2.5 shadow-lg pointer-events-none whitespace-nowrap text-center animate-in fade-in zoom-in-95 duration-100">
                      <div className="font-semibold">{day.label}</div>
                      <div className="text-emerald-300">
                        Omzet: {formatRupiah(day.omzet)}
                      </div>
                      <div className="text-gray-300">
                        Laba: {formatRupiah(day.labaKotor)} ({day.transaksiCount} trx)
                      </div>
                    </div>
                  )}

                  {/* Batang Visualisasi */}
                  <div className="w-full max-w-[40px] flex items-end justify-center gap-1 h-full pb-2">
                    {/* Bar Omzet */}
                    <div
                      style={{ height: `${day.omzet > 0 ? omzetHeightPercent : 4}%` }}
                      className={`w-1/2 rounded-t-sm transition-all duration-300 ${
                        day.omzet > 0
                          ? "bg-[var(--primary)] group-hover:opacity-85"
                          : "bg-gray-200"
                      }`}
                    />
                    {/* Bar Laba Kotor */}
                    <div
                      style={{ height: `${day.labaKotor > 0 ? labaHeightPercent : 2}%` }}
                      className={`w-1/2 rounded-t-sm transition-all duration-300 ${
                        day.labaKotor > 0
                          ? "bg-emerald-400 group-hover:opacity-85"
                          : "bg-gray-200"
                      }`}
                    />
                  </div>

                  {/* Label Tanggal */}
                  <div className="text-center w-full pt-1.5 border-t border-[var(--border)]">
                    <span className="block text-[11px] font-semibold text-[var(--text-primary)]">
                      {day.shortLabel}
                    </span>
                    <span className="block text-[9px] text-[var(--text-secondary)]">
                      {day.transaksiCount} trx
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. DUA KOLOM: 5 PRODUK TERLARIS & 5 TRANSAKSI TERBARU */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kolom Kiri: 5 Produk Terlaris */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                5 Produk Terlaris
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Berdasarkan kuantitas penjualan nyata di transaksi selesai
              </p>
            </div>
            <Link
              href="/laporan"
              className="text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              Lihat Semua →
            </Link>
          </div>

          {top5Products.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
              Belum ada transaksi penjualan selesai.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                    <th className="pb-2 pl-1 w-8">#</th>
                    <th className="pb-2">Produk</th>
                    <th className="pb-2 text-center">Terjual</th>
                    <th className="pb-2 text-right">Omzet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-xs">
                  {top5Products.map((p, idx) => (
                    <tr key={p.productId} className="hover:bg-[var(--background)]">
                      <td className="py-2.5 pl-1 font-bold text-[var(--text-secondary)]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5">
                        <div className="font-semibold text-[var(--text-primary)]">
                          {p.namaProduk}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {p.kategori}
                        </div>
                      </td>
                      <td className="py-2.5 text-center font-bold text-[var(--text-primary)] tabular-nums">
                        {p.totalQty}
                      </td>
                      <td className="py-2.5 text-right font-bold text-[var(--primary)] tabular-nums">
                        {formatRupiah(p.totalOmzet)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Kolom Kanan: 5 Transaksi Terbaru */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                5 Transaksi Terbaru
              </h2>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Riwayat pembayaran kasir yang baru saja diselesaikan
              </p>
            </div>
            <Link
              href="/transaksi"
              className="text-xs font-semibold text-[var(--primary)] hover:underline"
            >
              Semua Transaksi →
            </Link>
          </div>

          {recent5Transactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-secondary)]">
              Belum ada transaksi yang tercatat.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--text-secondary)] uppercase">
                    <th className="pb-2 pl-1">Faktur</th>
                    <th className="pb-2">Waktu</th>
                    <th className="pb-2">Metode</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-xs">
                  {recent5Transactions.map((trx) => (
                    <tr key={trx.id} className="hover:bg-[var(--background)]">
                      <td className="py-2.5 pl-1 font-mono font-semibold text-[var(--text-primary)]">
                        {trx.invoiceNumber}
                      </td>
                      <td className="py-2.5 text-[11px] text-[var(--text-secondary)]">
                        <div>{trx.waktuJam} WIB</div>
                        <div className="text-[10px]">{trx.kasirNama}</div>
                      </td>
                      <td className="py-2.5">
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
                      <td className="py-2.5 text-right font-black text-[var(--text-primary)] tabular-nums">
                        {formatRupiah(trx.totalBelanja)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

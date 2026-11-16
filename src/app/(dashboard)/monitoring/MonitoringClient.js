"use client";

import { useState, useTransition, useEffect } from "react";
import {
  triggerHealthCheckAction,
  resolveAlertAction,
} from "@/actions/monitoringActions";

export default function MonitoringClient({ initialData }) {
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [logFilter, setLogFilter] = useState("ALL"); // 'ALL' | 'ISSUES'

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3500);
  };

  // Handler pemeriksaan manual ulang
  const handleRefresh = () => {
    startTransition(async () => {
      try {
        const freshData = await triggerHealthCheckAction();
        setData(freshData);
        showToast("Pemeriksaan kesehatan sistem berhasil diperbarui.");
      } catch (err) {
        showToast("Gagal memperbarui status: " + err.message);
      }
    });
  };

  // Handler penyelesaian alert oleh pemilik
  const handleResolveAlert = (logId) => {
    startTransition(async () => {
      try {
        const res = await resolveAlertAction(logId);
        if (res.success) {
          // Perbarui status lokal tanpa reload
          setData((prev) => ({
            ...prev,
            activeAlerts: prev.activeAlerts.filter((a) => a.id !== logId),
            activeAlertCount: Math.max(0, prev.activeAlertCount - 1),
            recentLogs: prev.recentLogs.map((l) =>
              l.id === logId ? { ...l, resolved: true, resolvedAt: new Date().toISOString() } : l
            ),
          }));
          showToast("Peringatan berhasil ditandai selesai.");
        } else {
          showToast(res.error || "Gagal menandai alert.");
        }
      } catch (err) {
        showToast("Terjadi kesalahan: " + err.message);
      }
    });
  };

  // Client-side Polling Ringan (hanya berjalan jika checkbox aktif dan tab terbuka di browser)
  useEffect(() => {
    if (!isAutoRefresh) return;

    const intervalId = setInterval(() => {
      if (document.visibilityState === "visible") {
        startTransition(async () => {
          try {
            const fresh = await triggerHealthCheckAction();
            setData(fresh);
          } catch {
            // Abaikan kesalahan polling latar belakang
          }
        });
      }
    }, 30000); // 30 detik

    return () => clearInterval(intervalId);
  }, [isAutoRefresh]);

  const { overallStatus, database, metrics, recentLogs, activeAlerts } = data;

  // Filter tabel log
  const filteredLogs =
    logFilter === "ISSUES"
      ? recentLogs.filter((l) => l.statusCode >= 400 || l.severity === "WARN" || l.severity === "ERROR" || l.severity === "CRITICAL")
      : recentLogs;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-[var(--text-primary)] text-white text-xs font-medium shadow-lg transition-all">
          {toastMessage}
        </div>
      )}

      {/* HEADER UTAMA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Monitoring Sistem & Kesehatan Layanan
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              Live Runtime
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Pemantauan performa proses Node.js, status koneksi PostgreSQL, dan manajemen peringatan ritel.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAutoRefresh}
              onChange={(e) => setIsAutoRefresh(e.target.checked)}
              className="rounded border-[var(--border)] text-[var(--primary)] focus:ring-0"
            />
            <span>Auto Refresh (30s)</span>
          </label>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
          >
            <span className={isPending ? "animate-spin" : ""}>🔄</span>
            <span>{isPending ? "Memeriksa..." : "Periksa Sekarang"}</span>
          </button>
        </div>
      </div>

      {/* 1. BANNER STATUS KESEHATAN KESELURUHAN */}
      <div
        className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
          overallStatus === "NORMAL"
            ? "bg-[#EDF3EE] border-[#C8DCCF] text-[#244234]"
            : overallStatus === "PERINGATAN"
            ? "bg-[#FEF7ED] border-[#F2DAC1] text-[#784319]"
            : "bg-[#FEF2F2] border-[#F8C6C6] text-[#7A2822]"
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-black shrink-0 ${
              overallStatus === "NORMAL"
                ? "bg-[#34785B] text-white"
                : overallStatus === "PERINGATAN"
                ? "bg-[#B87D35] text-white"
                : "bg-[#B85248] text-white animate-pulse"
            }`}
          >
            {overallStatus === "NORMAL" ? "✓" : overallStatus === "PERINGATAN" ? "!" : "✕"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold tracking-wide uppercase">
                Status Sistem: {overallStatus}
              </span>
              <span className="text-[11px] font-medium opacity-85">
                (Instance PID: {metrics.processPid})
              </span>
            </div>
            <p className="text-xs opacity-90 mt-0.5">
              {overallStatus === "NORMAL"
                ? "Seluruh subsistem (PostgreSQL dan server runtime Node.js) beroperasi optimal dalam batas SLA normal tanpa peringatan aktif."
                : overallStatus === "PERINGATAN"
                ? "Subsistem beroperasi dengan catatan: terdapat peringatan aktif yang belum diselesaikan atau latensi kueri melambat."
                : "Terdeteksi gangguan kritis: database tidak dapat dihubungi atau layanan terputus."}
            </p>
          </div>
        </div>

        <div className="text-right sm:border-l sm:border-current/20 sm:pl-5 text-xs shrink-0">
          <div className="font-semibold">
            Pemeriksaan: <span className="font-mono">{database.checkedAtWib}</span>
          </div>
          <div className="opacity-80 text-[11px] mt-0.5">
            Uptime: <span className="font-mono font-bold">{metrics.uptimeFormatted}</span>
          </div>
        </div>
      </div>

      {/* 2. KARTU METRIK RUNTIME & RESOURCE PROSES */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Kartu 1: Database PostgreSQL */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-medium">Koneksi PostgreSQL</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                database.isConnected
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-red-50 text-red-800 border border-red-200"
              }`}
            >
              {database.isConnected ? "TERHUBUNG" : "TERPUTUS"}
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
            {database.latencyMs !== null ? `${database.latencyMs} ms` : "Gagal"}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
            <div>Host: <span className="font-mono text-[var(--text-primary)]">localhost:5432</span></div>
            <div>Query SLA: <span className="font-mono text-[var(--text-primary)]">&lt; 200 ms</span></div>
          </div>
        </div>

        {/* Kartu 2: RAM Resident Set Size (RSS) */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-2">
          <div className="text-xs text-[var(--text-secondary)] font-medium">
            RAM Proses (RSS)
          </div>
          <div className="text-2xl font-black text-[var(--primary)] tabular-nums">
            {metrics.memory.rssMb} <span className="text-sm font-semibold text-[var(--text-secondary)]">MB</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
            <div>Memori Fisik Node.js</div>
            <div>External Buffer: <span className="font-mono text-[var(--text-primary)]">{metrics.memory.externalMb} MB</span></div>
          </div>
        </div>

        {/* Kartu 3: Heap Memory V8 */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-medium">V8 Heap Memory</span>
            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-800">
              {metrics.memory.heapUsedPercent}%
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
            {metrics.memory.heapUsedMb} <span className="text-sm font-semibold text-[var(--text-secondary)]">MB</span>
          </div>
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
            <div
              style={{ width: `${Math.min(100, metrics.memory.heapUsedPercent)}%` }}
              className={`h-full transition-all duration-300 ${
                metrics.memory.heapUsedPercent > 80 ? "bg-[#B85248]" : "bg-[var(--primary)]"
              }`}
            />
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            Dari total heap: <span className="font-mono font-semibold text-[var(--text-primary)]">{metrics.memory.heapTotalMb} MB</span>
          </div>
        </div>

        {/* Kartu 4: Waktu CPU & Thread */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="font-medium">Waktu CPU Proses</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-mono">
              {metrics.cpu.cpuPercent}%
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
            {metrics.cpu.userTimeMs} <span className="text-sm font-semibold text-[var(--text-secondary)]">ms User</span>
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] space-y-0.5">
            <div>System Time: <span className="font-mono text-[var(--text-primary)]">{metrics.cpu.systemTimeMs} ms</span></div>
            <div>Core: <span className="font-mono text-[var(--text-primary)]">{metrics.cpuCores} Core ({metrics.arch})</span></div>
          </div>
        </div>
      </div>

      {/* Catatan Transparansi Metode Pengukuran & Kebijakan Alert (BNSP Unit 2, 7) */}
      <div className="p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[11px] text-[var(--text-secondary)] flex items-start gap-2">
        <span className="text-sm shrink-0">ℹ️</span>
        <div>
          <span className="font-semibold text-[var(--text-primary)]">Transparansi Metrik &amp; Klasifikasi Status: </span>
          Status <strong className="text-[var(--text-primary)]">NORMAL</strong> tercapai jika database aktif, latensi normal (&lt;200ms), dan tidak ada peringatan aktif. Status <strong className="text-[var(--text-primary)]">PERINGATAN</strong> menandakan adanya alert aktif atau latensi tinggi. Peringatan resource (seperti V8 Heap &gt;85%) otomatis beralih menjadi <em>Pulih</em> saat metrik kembali normal, atau dapat diselesaikan manual dengan tombol <em>Tandai Selesai</em> tanpa menghapus histori audit.
        </div>
      </div>

      {/* 3. SEKSI PERINGATAN SISTEM (ALERT NOTIFICATIONS) */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text-primary)]">
                Peringatan Sistem Aktif (Alert Notifications)
              </h2>
              {activeAlerts.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#B85248] text-white">
                  {activeAlerts.length}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Kejadian penting yang memerlukan tindak lanjut atau perhatian pemilik toko.
            </p>
          </div>
        </div>

        {activeAlerts.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--text-secondary)] bg-[var(--background)] rounded-lg border border-dashed border-[var(--border)]">
            <span className="text-base block mb-1">🛡️</span>
            Tidak ada peringatan aktif saat ini. Seluruh subsistem (Database & Server Runtime) beroperasi dalam batas normal.
          </div>
        ) : (
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <div
                key={alert.id}
                className="p-3.5 rounded-lg border border-[#F8C6C6] bg-[#FEF2F2] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#B85248] text-white uppercase tracking-wider">
                      {alert.severity}
                    </span>
                    <span className="text-xs font-bold text-[#7A2822]">
                      {alert.eventType}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)] font-mono">
                      · {new Date(alert.createdAt).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB
                    </span>
                  </div>
                  <p className="text-xs text-[#24251F] font-medium">
                    {alert.message}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Modul: <span className="font-semibold text-[var(--text-primary)]">{alert.module}</span> · Kode Status: <span className="font-mono">{alert.statusCode}</span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleResolveAlert(alert.id)}
                  disabled={isPending}
                  className="px-3 py-1.5 rounded-md border border-[#F8C6C6] bg-white hover:bg-[#FDF2F2] text-[#B85248] text-xs font-semibold shrink-0 transition-colors disabled:opacity-50"
                >
                  Tandai Selesai
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. SEKSI RIWAYAT LOG KESEHATAN & ERROR SISTEM */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">
              Riwayat Log Kesehatan & Error (System Health Logs)
            </h2>
            <p className="text-[11px] text-[var(--text-secondary)]">
              Audit jejak kejadian terstruktur dari subsistem aplikasi KasirKita.
            </p>
          </div>

          {/* Filter Tab Log */}
          <div className="flex items-center gap-1 p-1 bg-[var(--background)] rounded-lg border border-[var(--border)] text-xs">
            <button
              type="button"
              onClick={() => setLogFilter("ALL")}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                logFilter === "ALL"
                  ? "bg-white text-[var(--text-primary)] shadow-2xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Semua Log ({recentLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setLogFilter("ISSUES")}
              className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                logFilter === "ISSUES"
                  ? "bg-white text-[var(--text-primary)] shadow-2xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Hanya Peringatan & Error
            </button>
          </div>
        </div>

        {/* Tabel Log */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                <th className="py-2.5 px-3 font-semibold">Waktu (WIB)</th>
                <th className="py-2.5 px-3 font-semibold">Kategori / Event</th>
                <th className="py-2.5 px-3 font-semibold">Tingkat</th>
                <th className="py-2.5 px-3 font-semibold">Status HTTP</th>
                <th className="py-2.5 px-3 font-semibold">Modul & Operasi</th>
                <th className="py-2.5 px-3 font-semibold">Pesan</th>
                <th className="py-2.5 px-3 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-xs text-[var(--text-secondary)]">
                    Belum ada log kejadian sistem yang tercatat.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--background)] transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}{" "}
                      WIB
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">
                      {log.eventType}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          log.severity === "CRITICAL" || log.severity === "ERROR"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : log.severity === "WARN"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        }`}
                      >
                        {log.severity}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                      {log.statusCode}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                      <span className="font-semibold text-[var(--text-primary)]">{log.module}</span>
                      {log.operation !== "-" && <span className="opacity-75"> ({log.operation})</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-[var(--text-primary)] max-w-md truncate">
                      {log.message}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {log.resolved ? (
                        <span className="text-[10px] font-semibold text-gray-500">
                          {log.resolvedBy === "AUTO_RECOVERY" ? "Pulih" : "Selesai"}
                        </span>
                      ) : log.isAlert ? (
                        <span className="text-[10px] font-bold text-[#B85248]">
                          Aktif
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

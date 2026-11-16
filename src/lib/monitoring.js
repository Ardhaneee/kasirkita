/**
 * Modul Pemantauan Kesehatan Sistem, Resource Runtime & PostgreSQL.
 *
 * Mengukur resource proses Node.js aktual dan latensi query PostgreSQL
 * dengan metode penghitungan terukur tanpa data fiktif / persentase CPU palsu.
 */

import { db } from "./db.js";
import { formatDateWib } from "./dateUtils.js";
import os from "os";

// State pelacakan CPU usage delta antar-pemeriksaan
let previousCpuUsage = process.cpuUsage();
let previousCpuTime = Date.now();

// State promise in-flight untuk mencegah penumpukan kueri paralel ke connection pool
let inFlightHealthCheck = null;

/**
 * Format durasi detik menjadi teks ramah pengguna (Bahasa Indonesia).
 * Contoh: "2 jam 14 menit 35 detik" atau "8 menit 12 detik".
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatUptime(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours} jam`);
  if (minutes > 0) parts.push(`${minutes} menit`);
  parts.push(`${seconds} detik`);

  return parts.join(" ");
}

/**
 * Melakukan pemeriksaan koneksi PostgreSQL secara aman dengan timeout dan pengukuran latensi.
 *
 * Menggunakan singleton promise (in-flight guard) untuk mencegah penumpukan kueri koneksi
 * saat pemeriksaan dipanggil secara bersamaan, serta memastikan timer dibersihkan (clearTimeout).
 *
 * @param {number} [timeoutMs=3000] - Batas toleransi timeout query
 * @returns {Promise<{
 *   status: 'NORMAL'|'PERINGATAN'|'GANGGUAN',
 *   isConnected: boolean,
 *   latencyMs: number|null,
 *   checkedAtIso: string,
 *   checkedAtWib: string,
 *   message: string,
 *   error: string|null
 * }>}
 */
export async function checkDatabaseHealth(timeoutMs = 3000) {
  // Jika pemeriksaan koneksi sedang berjalan, gunakan promise yang sama (mencegah query pile-up)
  if (inFlightHealthCheck) {
    return await inFlightHealthCheck;
  }

  inFlightHealthCheck = (async () => {
    const now = new Date();
    const startTimer = performance.now();
    let timeoutTimer = null;

    try {
      // Timeout promise dengan referensi timer terkelola
      const timeoutPromise = new Promise((_, reject) => {
        if (timeoutMs <= 0) {
          reject(new Error("Database query timeout (>3000ms)"));
          return;
        }
        timeoutTimer = setTimeout(() => {
          reject(new Error("Database query timeout (>3000ms)"));
        }, timeoutMs);
      });

      // Kueri uji koneksi sederhana SELECT 1 via Prisma Engine
      const queryPromise = db.$queryRawUnsafe("SELECT 1 AS health_check;");

      await Promise.race([queryPromise, timeoutPromise]);
      const duration = performance.now() - startTimer;
      const latencyMs = Number(duration.toFixed(2));

      // Evaluasi ambang batas latensi (SLA)
      // < 200ms : NORMAL (Optimal untuk koneksi localhost / private network)
      // >= 200ms: PERINGATAN (Koneksi terhubung namun mengalami perlambatan respons)
      let status = "NORMAL";
      let message = `Koneksi PostgreSQL aktif dan responsif (${latencyMs} ms).`;

      if (latencyMs >= 200) {
        status = "PERINGATAN";
        message = `Koneksi PostgreSQL terhubung namun lambat (${latencyMs} ms >= 200 ms).`;
      }

      return {
        status,
        isConnected: true,
        latencyMs,
        checkedAtIso: now.toISOString(),
        checkedAtWib: formatDateWib(now),
        message,
        error: null,
      };
    } catch (err) {
      // Penanganan Gangguan Aman:
      // Tidak membocorkan connection string, username, password, atau path internal.
      let cleanErrorMessage = "Koneksi database PostgreSQL tidak dapat dihubungi atau mengalami timeout.";
      if (err.message && err.message.includes("timeout")) {
        cleanErrorMessage = "Koneksi database mengalami timeout (>3 detik).";
      }

      return {
        status: "GANGGUAN",
        isConnected: false,
        latencyMs: null,
        checkedAtIso: now.toISOString(),
        checkedAtWib: formatDateWib(now),
        message: "Database PostgreSQL mengalami gangguan konektivitas.",
        error: cleanErrorMessage,
      };
    } finally {
      // Selalu bersihkan timer agar tidak menggantung di event loop Node.js
      if (timeoutTimer) clearTimeout(timeoutTimer);
      inFlightHealthCheck = null;
    }
  })();

  return await inFlightHealthCheck;
}

/**
 * Mengukur resource proses runtime Node.js nyata.
 * Menghitung memori RSS, V8 Heap, dan waktu CPU terpakai proses.
 *
 * @returns {object} Metrik proses Node.js
 */
export function getSystemMetrics() {
  const now = new Date();
  const uptimeSeconds = Math.floor(process.uptime());
  const mem = process.memoryUsage();

  // Pengukuran CPU Usage Delta yang valid untuk proses Node.js
  const currentCpuUsage = process.cpuUsage(previousCpuUsage);
  const currentTime = Date.now();
  const timeDeltaMs = currentTime - previousCpuTime;

  // Total waktu CPU yang digunakan proses (user + system) dalam microseconds
  const userMicros = currentCpuUsage.user;
  const systemMicros = currentCpuUsage.system;
  const totalCpuMicros = userMicros + systemMicros;

  const numCpus = os.cpus().length || 1;
  let cpuPercent = 0;

  if (timeDeltaMs > 0) {
    // Persentase kapasitas CPU core yang diserap proses Node.js pada interval ini
    const totalPossibleMicros = timeDeltaMs * 1000 * numCpus;
    cpuPercent = Number(((totalCpuMicros / totalPossibleMicros) * 100).toFixed(2));
    cpuPercent = Math.min(100, Math.max(0, cpuPercent));
  }

  // Perbarui state snapshot untuk panggilan berikutnya
  previousCpuUsage = process.cpuUsage();
  previousCpuTime = currentTime;

  const rssMb = Number((mem.rss / (1024 * 1024)).toFixed(2));
  const heapTotalMb = Number((mem.heapTotal / (1024 * 1024)).toFixed(2));
  const heapUsedMb = Number((mem.heapUsed / (1024 * 1024)).toFixed(2));
  const externalMb = Number((mem.external / (1024 * 1024)).toFixed(2));
  const heapUsedPercent = Number(((mem.heapUsed / mem.heapTotal) * 100).toFixed(1));

  return {
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    processPid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuCores: numCpus,
    memory: {
      rssMb,
      heapTotalMb,
      heapUsedMb,
      heapUsedPercent,
      externalMb,
    },
    cpu: {
      cpuPercent,
      userTimeMs: Number((userMicros / 1000).toFixed(2)),
      systemTimeMs: Number((systemMicros / 1000).toFixed(2)),
    },
    sampledAtIso: now.toISOString(),
    sampledAtWib: formatDateWib(now),
    disclaimer:
      "Metrik proses ini merepresentasikan instance runtime Node.js aktif yang melayani aplikasi KasirKita, bukan kapasitas fisik mesin secara keseluruhan.",
  };
}

/**
 * Menyimpan snapshot metrik ke tabel PostgreSQL `system_metrics` (jika database tersedia).
 * @param {object} params
 * @param {number} params.cpuPercent
 * @param {number} params.rssMb
 * @param {number} params.heapUsedMb
 * @param {number} params.uptimeSeconds
 * @param {number} params.latencyMs
 */
export async function recordMetricSnapshot({
  cpuPercent = 0,
  rssMb = 0,
  heapUsedMb = 0,
  uptimeSeconds = 0,
  latencyMs = 0,
} = {}) {
  try {
    await db.systemMetric.create({
      data: {
        cpu_usage_percent: Number(cpuPercent),
        memory_rss_mb: Number(rssMb),
        memory_heap_used_mb: Number(heapUsedMb),
        uptime_seconds: Math.floor(uptimeSeconds),
        avg_response_time_ms: Number(latencyMs),
      },
    });
  } catch (err) {
    // Gagal menyimpan metrik (misal saat DB down) ditangani tanpa memutus alur
    console.error("Gagal menyimpan snapshot system_metrics:", err.message);
  }
}

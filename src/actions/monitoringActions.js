"use server";

import { requireAuth } from "../lib/auth.js";
import {
  checkDatabaseHealth,
  getSystemMetrics,
  recordMetricSnapshot,
} from "../lib/monitoring.js";
import {
  logSystemEvent,
  getRecentHealthLogs,
  getActiveAlerts,
  resolveSystemAlert,
  autoResolveAlerts,
  countActiveAlerts,
} from "../lib/logger.js";

/**
 * Server Action: Mengambil data metrik runtime, status database,
 * riwayat log kesehatan, dan daftar alert aktif.
 *
 * Khusus Role: PEMILIK (RBAC Enforced)
 */
export async function getMonitoringDataAction() {
  await requireAuth(["PEMILIK"]);

  // 1. Periksa kesehatan database PostgreSQL
  const dbHealth = await checkDatabaseHealth();

  // 2. Ambil metrik runtime proses Node.js
  const metrics = getSystemMetrics();

  // 3. Catat snapshot metrik ke tabel system_metrics
  if (dbHealth.isConnected) {
    await recordMetricSnapshot({
      cpuPercent: metrics.cpu.cpuPercent,
      rssMb: metrics.memory.rssMb,
      heapUsedMb: metrics.memory.heapUsedMb,
      uptimeSeconds: metrics.uptimeSeconds,
      latencyMs: dbHealth.latencyMs || 0,
    });
  }

  // 4. Jika koneksi database mengalami gangguan atau latensi tinggi, catat alert.
  //    Sebaliknya jika normal, pulihkan (auto-resolve) alert gangguan/latensi yang sebelumnya aktif.
  if (dbHealth.status === "GANGGUAN") {
    await logSystemEvent({
      eventType: "DATABASE_CONNECTION_ERROR",
      statusCode: 503,
      severity: "CRITICAL",
      module: "DATABASE",
      operation: "checkDatabaseHealth",
      message: dbHealth.error || "Database PostgreSQL tidak dapat dihubungi.",
      isAlert: true,
      details: { status: dbHealth.status, checkedAt: dbHealth.checkedAtIso },
    });
  } else if (dbHealth.status === "PERINGATAN") {
    await logSystemEvent({
      eventType: "DATABASE_HIGH_LATENCY",
      statusCode: 200,
      severity: "WARN",
      module: "DATABASE",
      operation: "checkDatabaseHealth",
      message: `Latensi koneksi PostgreSQL tinggi (${dbHealth.latencyMs} ms >= 200 ms).`,
      isAlert: true,
      details: { latencyMs: dbHealth.latencyMs },
    });
  } else {
    // Database dalam kondisi NORMAL: pulihkan peringatan database sebelumnya jika ada
    await autoResolveAlerts(
      "DATABASE_CONNECTION_ERROR",
      "Koneksi PostgreSQL telah pulih dan terhubung kembali."
    );
    await autoResolveAlerts(
      "DATABASE_HIGH_LATENCY",
      `Latensi PostgreSQL kembali optimal (${dbHealth.latencyMs} ms < 200 ms).`
    );
  }

  // 5. Peringatan ambang batas resource proses (Heap Usage > 85%)
  if (metrics.memory.heapUsedPercent > 85) {
    await logSystemEvent({
      eventType: "RESOURCE_HIGH_MEMORY",
      statusCode: 200,
      severity: "WARN",
      module: "SYSTEM",
      operation: "getSystemMetrics",
      message: `Penggunaan V8 Heap proses Node.js tinggi (${metrics.memory.heapUsedPercent}%).`,
      isAlert: true,
      details: {
        heapUsedMb: metrics.memory.heapUsedMb,
        heapTotalMb: metrics.memory.heapTotalMb,
        heapUsedPercent: metrics.memory.heapUsedPercent,
      },
    });
  } else {
    // Penggunaan heap <= 85% (normal): pulihkan (auto-resolve) peringatan memori tinggi yang aktif sebelumnya
    await autoResolveAlerts(
      "RESOURCE_HIGH_MEMORY",
      `Penggunaan V8 Heap kembali normal (${metrics.memory.heapUsedPercent}% <= 85%).`
    );
  }

  // 6. Ambil riwayat log dan alert aktif
  const [recentLogs, activeAlerts] = await Promise.all([
    getRecentHealthLogs(25),
    getActiveAlerts(),
  ]);

  // Evaluasi status keseluruhan aplikasi:
  // - GANGGUAN: Jika database tidak terhubung
  // - PERINGATAN: Jika DB lambat atau ada alert aktif dengan severity WARN/CRITICAL
  // - NORMAL: Subsistem berfungsi normal
  let overallStatus = "NORMAL";
  if (!dbHealth.isConnected) {
    overallStatus = "GANGGUAN";
  } else if (dbHealth.status === "PERINGATAN" || activeAlerts.length > 0) {
    overallStatus = "PERINGATAN";
  }

  return {
    overallStatus,
    database: dbHealth,
    metrics,
    recentLogs,
    activeAlerts,
    activeAlertCount: activeAlerts.length,
  };
}

/**
 * Server Action: Memicu pemeriksaan ulang kesehatan sistem secara manual.
 * Khusus Role: PEMILIK
 */
export async function triggerHealthCheckAction() {
  await requireAuth(["PEMILIK"]);
  return await getMonitoringDataAction();
}

/**
 * Server Action: Menandai alert sebagai telah diselesaikan / ditangani oleh Pemilik.
 * Khusus Role: PEMILIK
 */
export async function resolveAlertAction(logId) {
  await requireAuth(["PEMILIK"]);
  const result = await resolveSystemAlert(logId);
  return result;
}

/**
 * Server Action: Mengambil jumlah peringatan aktif terkini (untuk indikator navbar).
 */
export async function getActiveAlertCountAction() {
  try {
    const session = await requireAuth(["PEMILIK"]);
    if (!session || session.role !== "PEMILIK") return 0;
    return await countActiveAlerts();
  } catch {
    return 0;
  }
}

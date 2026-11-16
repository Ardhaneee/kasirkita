/**
 * Modul Pencatatan Log Sistem & Manajemen Peringatan Terstruktur.
 *
 * Menggunakan tabel PostgreSQL `system_health_logs` yang telah tersedia di Prisma schema.
 * Dilengkapi proteksi Anti-Data Leakage (sanitasi kredensial) dan Safe Fallback saat database offline.
 */

import { db } from "./db.js";
import fs from "fs";
import path from "path";

// Kunci sensitif yang wajib disanitasi / disamarkan dari log
const SENSITIVE_KEYS = new RegExp(
  "^(password|password_hash|token|secret|cookie|authorization|database_url|db_password)",
  "i"
);

// Regex untuk mendeteksi dan menyamarkan connection string database postgresql://
const DB_URL_REGEX = /postgres(ql)?:\/\/[^@\s]+@[^\s"']+/gi;

/**
 * Sanitasi string teks dari connection string atau kredensial.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeLogString(text) {
  if (typeof text !== "string") return String(text || "");
  return text.replace(DB_URL_REGEX, "postgresql://[REDACTED_USER]:[REDACTED_PASS]@[HOST]:[PORT]/[DB]");
}

/**
 * Sanitasi objek dari properti sensitif sebelum disimpan ke database atau file.
 * @param {any} data
 * @param {number} [depth=0]
 * @returns {any}
 */
export function sanitizeLogData(data, depth = 0) {
  if (depth > 4 || data === null || data === undefined) return data;
  if (typeof data === "string") return sanitizeLogString(data);
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.test(key)) {
      clean[key] = "[REDACTED]";
    } else {
      clean[key] = sanitizeLogData(value, depth + 1);
    }
  }
  return clean;
}

// In-Memory Cooldown Cache untuk De-duplikasi Alert (mencegah ribuan alert saat DB terputus)
const alertCooldownMap = new Map();
const COOLDOWN_DURATION_MS = 5 * 60 * 1000; // 5 Menit cooldown

/**
 * Mencatat log kejadian sistem terstruktur ke PostgreSQL `system_health_logs`.
 * Memiliki safe fallback ke server console / file jika database sedang tidak dapat dihubungi.
 *
 * @param {object} params
 * @param {string} params.eventType - Kategori kejadian (e.g. 'DB_HEALTH', 'SERVER_ERROR', 'AUTH_RATE_LIMIT')
 * @param {number} params.statusCode - Kode status HTTP (200, 400, 429, 500, 503)
 * @param {string} params.message - Pesan deskripsi kejadian
 * @param {'INFO'|'WARN'|'ERROR'|'CRITICAL'} [params.severity='INFO'] - Tingkat keparahan
 * @param {string} [params.module='SYSTEM'] - Modul terkait ('AUTH', 'DATABASE', 'POS', 'INVENTORY', 'REPORT', 'SYSTEM')
 * @param {string} [params.operation=''] - Nama fungsi/operasi yang sedang dieksekusi
 * @param {object} [params.details={}] - Konteks tambahan
 * @param {boolean} [params.isAlert=false] - Apakah kejadian ini memicu peringatan untuk pemilik
 * @returns {Promise<{ success: boolean, logId?: number, isDuplicate?: boolean }>}
 */
export async function logSystemEvent({
  eventType,
  statusCode = 200,
  message,
  severity = "INFO",
  module = "SYSTEM",
  operation = "",
  details = {},
  isAlert = false,
}) {
  const safeMessage = sanitizeLogString(message || "Kejadian sistem tercatat.");
  const safeDetails = sanitizeLogData(details || {});

  const isAlertCandidate = isAlert || severity === "WARN" || severity === "ERROR" || severity === "CRITICAL";

  // Mekanisme De-duplikasi Alert:
  // Jika peringatan untuk eventType + module yang sama terjadi dalam kurun waktu cooldown,
  // tahan alert baru agar tabel tidak kebanjiran log identik.
  if (isAlertCandidate) {
    const dedupeKey = `${eventType}:${module}`;
    const lastAlertTime = alertCooldownMap.get(dedupeKey);
    const now = Date.now();

    if (lastAlertTime && now - lastAlertTime < COOLDOWN_DURATION_MS) {
      // Abaikan duplikasi dalam cooldown window
      return { success: true, isDuplicate: true };
    }
    alertCooldownMap.set(dedupeKey, now);
  }

  const structuredDetails = {
    severity,
    module,
    operation,
    isAlert: isAlertCandidate,
    resolved: severity === "INFO",
    resolved_at: severity === "INFO" ? new Date().toISOString() : null,
    timestamp: new Date().toISOString(),
    ...safeDetails,
  };

  try {
    const createdLog = await db.systemHealthLog.create({
      data: {
        event_type: eventType,
        status_code: statusCode,
        message: safeMessage,
        details_json: JSON.stringify(structuredDetails),
      },
    });

    return { success: true, logId: createdLog.id, isDuplicate: false };
  } catch (dbError) {
    // FALLBACK SERVER LOGGING:
    // Terjadi jika PostgreSQL mati/unreachable sehingga tabel tidak dapat diakses.
    // Aplikasi dijamin TIDAK AKAN CRASH dan TIDAK MEMBOCORKAN KREDENSIAL.
    writeFallbackServerLog({
      eventType,
      statusCode,
      message: safeMessage,
      structuredDetails,
      dbError: sanitizeLogString(dbError.message || "Database connection failure"),
    });

    return { success: false, isDuplicate: false, error: "Database offline. Log disimpan ke server fallback." };
  }
}

/**
 * Menulis log ke stderr dan file lokal cadangan saat database tidak dapat diakses.
 * Menggunakan sanitasi penuh untuk menjamin tidak ada kredensial atau rahasia yang bocor.
 * @param {object} logData
 */
function writeFallbackServerLog(logData) {
  try {
    const cleanLogData = sanitizeLogData(logData);
    const logLine = `[${new Date().toISOString()}] [FALLBACK_LOG] ${JSON.stringify(cleanLogData)}\n`;
    console.error("[KasirKita Server Fallback Log]:", logLine.trim());

    const logsDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(path.join(logsDir, "server_fallback.log"), logLine, "utf8");
  } catch {
    // Mengabaikan kegagalan I/O sekunder agar proses server utama tetap stabil
  }
}

/**
 * Mengambil daftar riwayat log kesehatan sistem terbaru.
 * @param {number} [limit=20]
 * @returns {Promise<Array<object>>}
 */
export async function getRecentHealthLogs(limit = 20) {
  try {
    const logs = await db.systemHealthLog.findMany({
      take: Math.min(100, Math.max(1, limit)),
      orderBy: { created_at: "desc" },
    });

    return logs.map((log) => {
      let parsedDetails = {};
      try {
        parsedDetails = log.details_json ? JSON.parse(log.details_json) : {};
      } catch {
        parsedDetails = {};
      }

      return {
        id: log.id,
        eventType: log.event_type,
        statusCode: log.status_code,
        message: log.message,
        createdAt: log.created_at.toISOString(),
        severity: parsedDetails.severity || (log.status_code >= 500 ? "ERROR" : log.status_code >= 400 ? "WARN" : "INFO"),
        module: parsedDetails.module || "SYSTEM",
        operation: parsedDetails.operation || "-",
        isAlert: Boolean(parsedDetails.isAlert),
        resolved: Boolean(parsedDetails.resolved),
        resolvedAt: parsedDetails.resolved_at || null,
        resolvedBy: parsedDetails.resolved_by || null,
        recoveryNote: parsedDetails.recovery_note || null,
      };
    });
  } catch (err) {
    console.error("Gagal mengambil log kesehatan dari database:", err.message);
    return [];
  }
}

/**
 * Mengambil daftar alert aktif (unresolved) dari 24 jam terakhir.
 * Termasuk peringatan resource sistem (misal RESOURCE_HIGH_MEMORY) berstatus HTTP 200.
 * @returns {Promise<Array<object>>}
 */
export async function getActiveAlerts() {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Ambil log kejadian 24 jam terakhir tanpa filter status_code >= 400
    // agar semua peringatan dengan isAlert === true dan belum diselesaikan terjaring dengan benar.
    const logs = await db.systemHealthLog.findMany({
      where: {
        created_at: { gte: oneDayAgo },
      },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    const activeAlerts = [];
    for (const log of logs) {
      let details = {};
      try {
        details = log.details_json ? JSON.parse(log.details_json) : {};
      } catch {
        details = {};
      }

      // Filter hanya alert yang berstatus aktif (isAlert === true dan belum resolved)
      if (details.isAlert === true && !details.resolved) {
        activeAlerts.push({
          id: log.id,
          eventType: log.event_type,
          statusCode: log.status_code,
          message: log.message,
          severity: details.severity || (log.status_code >= 500 ? "CRITICAL" : "WARN"),
          module: details.module || "SYSTEM",
          createdAt: log.created_at.toISOString(),
          details,
        });
      }
    }

    return activeAlerts;
  } catch (err) {
    console.error("Gagal mengambil alert aktif:", err.message);
    return [];
  }
}

/**
 * Menandai alert sebagai telah ditangani / diselesaikan oleh Pemilik.
 * @param {number} logId
 * @param {string} [resolvedBy='MANUAL_PEMILIK']
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function resolveSystemAlert(logId, resolvedBy = "MANUAL_PEMILIK") {
  try {
    const log = await db.systemHealthLog.findUnique({
      where: { id: Number(logId) },
    });

    if (!log) {
      return { success: false, error: "Data log alert tidak ditemukan." };
    }

    let details = {};
    try {
      details = log.details_json ? JSON.parse(log.details_json) : {};
    } catch {
      details = {};
    }

    details.resolved = true;
    details.resolved_at = new Date().toISOString();
    details.resolved_by = resolvedBy;

    await db.systemHealthLog.update({
      where: { id: log.id },
      data: {
        details_json: JSON.stringify(details),
      },
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: "Gagal memperbarui status alert: " + err.message };
  }
}

/**
 * Menyelesaikan alert aktif secara otomatis ketika kondisi metrik telah kembali normal (Self-Healing Recovery).
 * Tidak menghapus data log dari database, hanya memperbarui status resolved pada details_json.
 *
 * @param {string} eventType - Jenis event yang pulih (e.g. 'RESOURCE_HIGH_MEMORY', 'DATABASE_HIGH_LATENCY')
 * @param {string} [recoveryMessage="Kondisi kembali normal."] - Keterangan pemulihan
 * @returns {Promise<number>} Jumlah alert yang dipulihkan
 */
export async function autoResolveAlerts(eventType, recoveryMessage = "Kondisi kembali normal.") {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await db.systemHealthLog.findMany({
      where: {
        event_type: eventType,
        created_at: { gte: oneDayAgo },
      },
    });

    let resolvedCount = 0;
    const nowIso = new Date().toISOString();

    for (const log of logs) {
      let details = {};
      try {
        details = log.details_json ? JSON.parse(log.details_json) : {};
      } catch {
        details = {};
      }

      if (details.isAlert === true && !details.resolved) {
        details.resolved = true;
        details.resolved_at = nowIso;
        details.resolved_by = "AUTO_RECOVERY";
        details.recovery_note = recoveryMessage;

        await db.systemHealthLog.update({
          where: { id: log.id },
          data: {
            details_json: JSON.stringify(details),
          },
        });
        resolvedCount++;
      }
    }

    return resolvedCount;
  } catch (err) {
    console.error(`Gagal auto-resolve alert untuk ${eventType}:`, err.message);
    return 0;
  }
}

/**
 * Menghitung jumlah peringatan aktif yang belum ditangani (untuk badge navbar pemilik).
 * @returns {Promise<number>}
 */
export async function countActiveAlerts() {
  const alerts = await getActiveAlerts();
  return alerts.length;
}

/**
 * Reset cache cooldown alert (khusus keperluan unit testing).
 */
export function _resetAlertCooldownForTesting() {
  alertCooldownMap.clear();
}

/**
 * In-memory sliding-window rate limiter untuk mitigasi serangan Brute Force Login.
 *
 * Catatan Arsitektur & Skalabilitas (BNSP Unit 5 & 16):
 * Menggunakan struktur data Map in-memory native Node.js yang ringan, bebas dependency eksternal.
 * Sangat ideal untuk instalasi single-instance/lokal ritel UMKM KasirKita.
 * Untuk arsitektur multi-instance/horizontal scaling di masa depan,
 * state store ini dapat dimigrasikan ke Redis atau database terdistribusi.
 */

const attemptsMap = new Map();

// Pembersihan berkala setiap 10 menit untuk mencegah memory leak pada Map
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function performCleanup(windowMs) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  for (const [key, data] of attemptsMap.entries()) {
    if (now - data.firstAttempt > windowMs && (!data.lockoutUntil || now > data.lockoutUntil)) {
      attemptsMap.delete(key);
    }
  }
}

/**
 * Memeriksa apakah kunci (username / IP) diizinkan melakukan percobaan login.
 *
 * @param {string} key - Identifikasi unik (misal: username)
 * @param {number} [maxAttempts=5] - Batas toleransi kegagalan berturut-turut
 * @param {number} [lockoutMs=5 * 60 * 1000] - Durasi pemblokiran sementara (5 menit)
 * @returns {{ allowed: boolean, remainingAttempts: number, lockoutRemainingSec: number }}
 */
export function checkRateLimit(key, maxAttempts = 5, lockoutMs = 5 * 60 * 1000) {
  if (!key) return { allowed: true, remainingAttempts: maxAttempts, lockoutRemainingSec: 0 };

  performCleanup(lockoutMs);

  const now = Date.now();
  const record = attemptsMap.get(key);

  if (!record) {
    return { allowed: true, remainingAttempts: maxAttempts, lockoutRemainingSec: 0 };
  }

  // Jika sedang dalam masa lockout
  if (record.lockoutUntil && now < record.lockoutUntil) {
    const lockoutRemainingSec = Math.ceil((record.lockoutUntil - now) / 1000);
    return {
      allowed: false,
      remainingAttempts: 0,
      lockoutRemainingSec,
    };
  }

  // Jika masa lockout telah lewat, reset otomatis
  if (record.lockoutUntil && now >= record.lockoutUntil) {
    attemptsMap.delete(key);
    return { allowed: true, remainingAttempts: maxAttempts, lockoutRemainingSec: 0 };
  }

  const remainingAttempts = Math.max(0, maxAttempts - record.count);
  return {
    allowed: remainingAttempts > 0,
    remainingAttempts,
    lockoutRemainingSec: 0,
  };
}

/**
 * Mencatat percobaan login yang gagal.
 * Jika mencapai batas maxAttempts, mengunci kunci selama lockoutMs.
 *
 * @param {string} key
 * @param {number} [maxAttempts=5]
 * @param {number} [lockoutMs=5 * 60 * 1000]
 * @returns {{ isLocked: boolean, count: number, lockoutRemainingSec: number }}
 */
export function recordFailedAttempt(key, maxAttempts = 5, lockoutMs = 5 * 60 * 1000) {
  if (!key) return { isLocked: false, count: 0, lockoutRemainingSec: 0 };

  const now = Date.now();
  const record = attemptsMap.get(key) || { count: 0, firstAttempt: now, lockoutUntil: null };

  record.count += 1;

  if (record.count >= maxAttempts) {
    record.lockoutUntil = now + lockoutMs;
    attemptsMap.set(key, record);
    return {
      isLocked: true,
      count: record.count,
      lockoutRemainingSec: Math.ceil(lockoutMs / 1000),
    };
  }

  attemptsMap.set(key, record);
  return {
    isLocked: false,
    count: record.count,
    lockoutRemainingSec: 0,
  };
}

/**
 * Menghapus riwayat percobaan gagal setelah login berhasil.
 * @param {string} key
 */
export function resetRateLimit(key) {
  if (key) {
    attemptsMap.delete(key);
  }
}

/**
 * Reset seluruh cache rate limiter (digunakan khusus untuk pengujian terisolasi).
 */
export function _resetAllRateLimitsForTesting() {
  attemptsMap.clear();
}

/**
 * Resolusi IP Klien secara aman untuk mitigasi serangan Brute Force & Password Spraying (BNSP Unit 5).
 *
 * Kebijakan Keamanan:
 * 1. Default (TRUST_PROXY !== "true"): Header X-Forwarded-For atau X-Real-IP dari klien TIDAK DIPERCAYAI.
 *    Ini mencegah penyerang di jaringan langsung/lokal memalsukan header IP untuk membobol kuota rate limit.
 *    Mengembalikan "127.0.0.1" (safe local fallback).
 * 2. Produksi (TRUST_PROXY === "true"): Diaktifkan hanya jika aplikasi berada di belakang Reverse Proxy
 *    terpercaya (seperti Nginx, Cloudflare, atau AWS ALB) yang membersihkan header klien dan menyuntikkan IP riil.
 *
 * @param {Headers|object|null} headerList - Instans Headers dari next/headers atau mock
 * @returns {string} Alamat IP klien yang tervalidasi
 */
export function resolveClientIp(headerList) {
  if (!headerList) return "127.0.0.1";

  const isTrustedProxy = process.env.TRUST_PROXY === "true";
  if (!isTrustedProxy) {
    // Mode aman: Jangan percaya header X-Forwarded-For dari koneksi langsung/lokal
    return "127.0.0.1";
  }

  try {
    const forwarded =
      typeof headerList.get === "function"
        ? headerList.get("x-forwarded-for")
        : headerList["x-forwarded-for"];

    if (forwarded) {
      const clientIp = forwarded.split(",")[0].trim();
      // Validasi struktur IPv4 / IPv6 sederhana guna mencegah injection
      if (/^[0-9a-fA-F:.]+$/.test(clientIp)) {
        return clientIp;
      }
    }

    const realIp =
      typeof headerList.get === "function"
        ? headerList.get("x-real-ip")
        : headerList["x-real-ip"];

    if (realIp) {
      const trimmed = realIp.trim();
      if (/^[0-9a-fA-F:.]+$/.test(trimmed)) {
        return trimmed;
      }
    }
  } catch {
    return "127.0.0.1";
  }

  return "127.0.0.1";
}

"use server";

import { db } from "@/lib/db";
import { createSessionToken, setSessionCookie, clearSessionCookie } from "@/lib/auth";
import {
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  resolveClientIp,
} from "@/lib/rateLimiter";
import { logSystemEvent } from "@/lib/logger";
import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

// Rute yang khusus diperuntukkan bagi PEMILIK
const OWNER_ONLY_ROUTES = ["/dashboard", "/produk", "/laporan", "/monitoring", "/pengaturan"];

/**
 * Sanitasi callbackUrl untuk mencegah Open Redirect vulnerability.
 * @param {string|null} url
 * @returns {string|null}
 */
function sanitizeCallbackUrl(url) {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.includes(":") &&
    !trimmed.includes("\\")
  ) {
    return trimmed;
  }
  return null;
}

/**
 * Server Action untuk memproses autentikasi pengguna.
 * @param {object} prevState - State sebelumnya dari form action
 * @param {FormData} formData - Data input form login
 * @returns {Promise<{ success: boolean, error?: string, redirectTo?: string }>}
 */
export async function loginAction(prevState, formData) {
  const username = formData.get("username")?.toString().trim();
  const password = formData.get("password")?.toString();
  const rawCallbackUrl = formData.get("callbackUrl")?.toString();

  // 1. Validasi kelengkapan input
  if (!username || !password) {
    return {
      success: false,
      statusCode: 400,
      error: "Username dan kata sandi wajib diisi.",
    };
  }

  // 2. Proteksi Brute Force & Password Spraying (BNSP Unit 5: Keamanan Informasi)
  // Ekstraksi IP Client secara aman tanpa mempercayai X-Forwarded-For sembarangan
  let clientIp = "127.0.0.1";
  try {
    const headerList = await headers();
    clientIp = resolveClientIp(headerList);
  } catch {
    clientIp = "127.0.0.1";
  }

  // Kunci ganda:
  // - Kunci user: membatasi serangan brute force pada akun tunggal (maks 5 kali gagal)
  // - Kunci IP: membatasi serangan password spraying lintas username berbeda dari IP yang sama (maks 15 kali gagal)
  const userRateKey = `user:${username.toLowerCase()}`;
  const ipRateKey = `ip:${clientIp}`;

  const userRate = checkRateLimit(userRateKey, 5, 5 * 60 * 1000);
  const ipRate = checkRateLimit(ipRateKey, 15, 15 * 60 * 1000);

  if (!userRate.allowed || !ipRate.allowed) {
    const lockoutSec = Math.max(userRate.lockoutRemainingSec, ipRate.lockoutRemainingSec);
    const reason = !userRate.allowed
      ? `Percobaan login akun '${username}' diblokir sementara karena melebihi batas 5 kali percobaan gagal.`
      : `IP client '${clientIp}' diblokir sementara karena melebihi batas 15 kali percobaan login gagal (Password Spraying Mitigation).`;

    await logSystemEvent({
      eventType: "AUTH_RATE_LIMIT",
      statusCode: 429,
      severity: "WARN",
      module: "AUTH",
      operation: "loginAction",
      message: reason,
      isAlert: true,
      details: {
        username,
        clientIp,
        lockoutRemainingSec: lockoutSec,
        triggeredBy: !userRate.allowed ? "USER_LIMIT" : "IP_LIMIT",
      },
    });

    return {
      success: false,
      statusCode: 429,
      error: `Terlalu banyak percobaan login yang gagal. Akses dibatasi sementara selama ${Math.ceil(
        lockoutSec / 60
      )} menit demi keamanan.`,
    };
  }

  try {
    // 3. Ambil data akun berdasarkan username dari PostgreSQL
    const user = await db.user.findUnique({
      where: { username },
    });

    // 4. Verifikasi keberadaan dan status aktif akun
    if (!user || !user.status_aktif) {
      const userAttempt = recordFailedAttempt(userRateKey, 5, 5 * 60 * 1000);
      const ipAttempt = recordFailedAttempt(ipRateKey, 15, 15 * 60 * 1000);

      if (userAttempt.isLocked || ipAttempt.isLocked) {
        await logSystemEvent({
          eventType: "AUTH_RATE_LIMIT",
          statusCode: 429,
          severity: "WARN",
          module: "AUTH",
          operation: "loginAction",
          message: `Batas percobaan login tercapai untuk target '${username}' (IP: ${clientIp}). Akses dikunci sementara.`,
          isAlert: true,
          details: { username, clientIp, userCount: userAttempt.count, ipCount: ipAttempt.count },
        });
      }
      return {
        success: false,
        statusCode: 401,
        error: "Username atau kata sandi tidak valid.",
      };
    }

    // 5. Verifikasi kata sandi dengan bcryptjs
    const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPasswordValid) {
      const userAttempt = recordFailedAttempt(userRateKey, 5, 5 * 60 * 1000);
      const ipAttempt = recordFailedAttempt(ipRateKey, 15, 15 * 60 * 1000);

      if (userAttempt.isLocked || ipAttempt.isLocked) {
        await logSystemEvent({
          eventType: "AUTH_RATE_LIMIT",
          statusCode: 429,
          severity: "WARN",
          module: "AUTH",
          operation: "loginAction",
          message: `Batas percobaan login tercapai untuk target '${username}' (IP: ${clientIp}). Akses dikunci sementara.`,
          isAlert: true,
          details: { username, clientIp, userCount: userAttempt.count, ipCount: ipAttempt.count },
        });
      }
      return {
        success: false,
        statusCode: 401,
        error: "Username atau kata sandi tidak valid.",
      };
    }

    // Reset kegagalan login saat kredensial valid
    resetRateLimit(userRateKey);

    // 5. Buat JWT Session Token (tanpa membocorkan kredensial ke payload/log)
    const token = await createSessionToken({
      sub: String(user.id),
      userId: user.id,
      nama: user.nama,
      username: user.username,
      role: user.role,
    });

    // 6. Set HTTP-only Cookie
    await setSessionCookie(token);

    // 7. Evaluasi tujuan pengalihan yang aman (Safe Redirect & RBAC)
    let targetUrl = user.role === "PEMILIK" ? "/dashboard" : "/pos";
    const safeCallback = sanitizeCallbackUrl(rawCallbackUrl);

    if (safeCallback) {
      // Jika kasir mencoba masuk lewat callbackUrl khusus pemilik, paksa ke /pos
      const isTryingOwnerRoute = OWNER_ONLY_ROUTES.some((route) => safeCallback.startsWith(route));
      if (user.role === "KASIR" && isTryingOwnerRoute) {
        targetUrl = "/pos";
      } else {
        targetUrl = safeCallback;
      }
    }

    return {
      success: true,
      statusCode: 200,
      redirectTo: targetUrl,
    };
  } catch (error) {
    // Keamanan: Catat pesan generik tanpa password atau kredensial rahasia
    console.error("Kesalahan otentikasi internal:", error.message);
    return {
      success: false,
      statusCode: 500,
      error: "Terjadi gangguan sistem saat otentikasi. Silakan coba kembali.",
    };
  }
}

/**
 * Server Action untuk logout pengguna dan menghapus sesi.
 */
export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

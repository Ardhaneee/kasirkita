import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

const COOKIE_NAME = "kasirkita_session";
const JWT_SECRET = process.env.JWT_SECRET || "kasirkita-secret-key-change-in-production-min-32-chars-long";
const secretKey = new TextEncoder().encode(JWT_SECRET);

/**
 * Membuat token JWT sesi kasir/pemilik.
 * Kedaluwarsa dalam 24 jam.
 * Catatan Arsitektur: JWT bersifat stateless. Revokasi instan untuk akun
 * non-aktif ditangani pada level server guard `requireAuth()` dengan pengecekan `status_aktif` di DB.
 * @param {object} payload - { userId, nama, username, role }
 * @returns {Promise<string>} JWT token
 */
export async function createSessionToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);
}

/**
 * Memverifikasi dan mendekode token JWT sesi.
 * @param {string} token
 * @returns {Promise<object|null>} Payload atau null jika tidak valid/kedaluwarsa
 */
export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Menyimpan token sesi ke HTTP-only cookie yang aman.
 * @param {string} token
 */
export async function setSessionCookie(token) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 jam
  });
}

/**
 * Menghapus cookie sesi saat logout secara tuntas.
 */
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}

/**
 * Mengambil payload sesi pengguna aktif dari cookie request.
 * @returns {Promise<object|null>}
 */
export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifySessionToken(token);
}

/**
 * Guard otentikasi dan otorisasi tingkat server (Server Component / Action).
 * Memverifikasi integritas token dan status akun aktif di PostgreSQL.
 * @param {string[]} allowedRoles - Daftar role yang diizinkan (misal ['PEMILIK', 'KASIR'])
 * @returns {Promise<object>} Sesi pengguna terverifikasi
 */
export async function requireAuth(allowedRoles = []) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  // Verifikasi status akun aktif di database PostgreSQL
  // Menjamin akun yang dinonaktifkan langsung tertolak seketika meski memegang JWT valid
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, status_aktif: true, role: true },
  });

  if (!user || !user.status_aktif) {
    await clearSessionCookie();
    redirect("/login");
  }

  // Otorisasi role aktif berbasis data PostgreSQL terkini
  const activeRole = user.role;
  if (allowedRoles.length > 0 && !allowedRoles.includes(activeRole)) {
    if (activeRole === "KASIR") {
      redirect("/pos");
    }
    redirect("/login");
  }

  return { ...session, role: activeRole };
}

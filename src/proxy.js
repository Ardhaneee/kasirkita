import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "kasirkita_session";
const JWT_SECRET = process.env.JWT_SECRET || "kasirkita-secret-key-change-in-production-min-32-chars-long";
const secretKey = new TextEncoder().encode(JWT_SECRET);

// Rute manajerial yang dibatasi HANYA untuk role PEMILIK
const OWNER_ONLY_PREFIXES = ["/dashboard", "/laporan", "/monitoring", "/pengaturan"];

// Rute operasional yang dapat diakses oleh KASIR dan PEMILIK
const SHARED_PROTECTED_PREFIXES = ["/pos", "/produk", "/stok", "/transaksi"];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;

  let session = null;
  if (sessionCookie) {
    try {
      const { payload } = await jwtVerify(sessionCookie, secretKey, {
        algorithms: ["HS256"],
      });
      session = payload;
    } catch {
      session = null;
    }
  }

  const isAuthenticated = Boolean(session);
  const isLoginPage = pathname === "/login";
  const isRootPage = pathname === "/";

  // 1. Pengguna sudah login mencoba membuka halaman login
  if (isLoginPage && isAuthenticated) {
    const targetUrl = session.role === "PEMILIK" ? "/dashboard" : "/pos";
    return NextResponse.redirect(new URL(targetUrl, request.url));
  }

  // 2. Akses ke root (/)
  if (isRootPage) {
    if (isAuthenticated) {
      const targetUrl = session.role === "PEMILIK" ? "/dashboard" : "/pos";
      return NextResponse.redirect(new URL(targetUrl, request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 3. Pengecekan rute terlindungi
  const isOwnerRoute = OWNER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isSharedRoute = SHARED_PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isOwnerRoute || isSharedRoute) {
    // Jika belum login, redirect ke /login disertai callbackUrl
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Role-Based Access Control: Kasir dilarang mengakses modul Pemilik
    if (isOwnerRoute && session.role !== "PEMILIK") {
      return NextResponse.redirect(new URL("/pos", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/dashboard/:path*",
    "/pos/:path*",
    "/produk/:path*",
    "/stok/:path*",
    "/transaksi/:path*",
    "/laporan/:path*",
    "/monitoring/:path*",
    "/pengaturan/:path*",
  ],
};

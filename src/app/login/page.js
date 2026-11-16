import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

/**
 * Validasi keamanan callbackUrl untuk mencegah Open Redirect attack.
 * Hanya mengizinkan URL lokal relatif internal.
 * @param {string|undefined} url
 * @returns {string|null} URL aman atau null jika tidak valid
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

export default async function LoginPage({ searchParams }) {
  // 1. Cek sesi aktif di server
  const session = await getSession();
  if (session) {
    const target = session.role === "PEMILIK" ? "/dashboard" : "/pos";
    redirect(target);
  }

  // 2. Ambil dan sanitasi parameter callbackUrl (Next.js 15/16 async searchParams)
  const resolvedParams = await searchParams;
  const rawCallback = resolvedParams?.callbackUrl;
  const safeCallbackUrl = sanitizeCallbackUrl(rawCallback);

  const isDev =
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEMO_FAST_FILL === "true";

  const demoPasswords = {
    pemilik:
      process.env.DEMO_PEMILIK_PASSWORD ||
      (process.env.NODE_ENV === "production" ? "KasirKita2026!Pemilik" : "pemilik123"),
    kasir:
      process.env.DEMO_KASIR_PASSWORD ||
      (process.env.NODE_ENV === "production" ? "KasirKita2026!Kasir" : "kasir123"),
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--background)]">
      <LoginForm
        callbackUrl={safeCallbackUrl}
        isDev={isDev}
        demoPasswords={demoPasswords}
      />
    </main>
  );
}

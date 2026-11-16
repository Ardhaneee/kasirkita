import { getSession } from "@/lib/auth";
import { logoutAction } from "@/actions/authActions";
import { countActiveAlerts } from "@/lib/logger";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const isPemilik = session.role === "PEMILIK";
  const activeAlertCount = isPemilik ? await countActiveAlerts() : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)]">
      {/* Top Navbar Minimalis & Fungsional */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)] px-6 py-3.5 sticky top-0 z-20 no-print">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              href={isPemilik ? "/dashboard" : "/pos"}
              className="text-lg font-bold tracking-tight text-[var(--text-primary)] hover:opacity-85 transition-opacity"
            >
              KasirKita
            </Link>

            {/* Navigasi Berdasarkan Hak Akses (RBAC) */}
            <nav className="hidden sm:flex items-center gap-1 text-xs font-medium">
              {isPemilik && (
                <Link
                  href="/dashboard"
                  className="px-3 py-1.5 rounded-md text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
                >
                  Dashboard
                </Link>
              )}
              <Link
                href="/pos"
                className="px-3 py-1.5 rounded-md text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
              >
                Kasir (POS)
              </Link>
              <Link
                href="/produk"
                className="px-3 py-1.5 rounded-md text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
              >
                Produk
              </Link>
              <Link
                href="/stok"
                className="px-3 py-1.5 rounded-md text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
              >
                Inventori (Stok)
              </Link>
              <Link
                href="/transaksi"
                className="px-3 py-1.5 rounded-md text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
              >
                Transaksi
              </Link>
              {isPemilik && (
                <Link
                  href="/laporan"
                  className="px-3 py-1.5 rounded-md text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors"
                >
                  Laporan
                </Link>
              )}
              {isPemilik && (
                <Link
                  href="/monitoring"
                  className="px-3 py-1.5 rounded-md text-[var(--text-primary)] hover:bg-[var(--background)] transition-colors inline-flex items-center gap-1.5"
                >
                  <span>Monitoring</span>
                  {activeAlertCount > 0 && (
                    <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-black rounded-full bg-[#B85248] text-white">
                      {activeAlertCount}
                    </span>
                  )}
                </Link>
              )}
            </nav>
          </div>

          {/* Profil Sesi Pengguna & Tombol Logout */}
          <div className="flex items-center gap-4 text-xs">
            <div className="text-right hidden sm:block">
              <div className="font-semibold text-[var(--text-primary)]">
                {session.nama}
              </div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                Role: <span className="font-medium text-[var(--primary)]">{session.role}</span>
              </div>
            </div>

            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--primary-accent)] text-[var(--primary)] border border-[#d2dfd4]">
              {session.role}
            </span>

            <form action={logoutAction}>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] hover:bg-[#F2EFE9] text-[#B85248] text-xs font-medium transition-colors"
              >
                Keluar
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6">
        {children}
      </main>
    </div>
  );
}

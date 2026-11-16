import { formatRupiah, formatTanggal } from "@/lib/utils";

export default function HomePage() {
  const sampleTime = new Date("2026-11-16T14:00:00Z");
  const samplePrice = 75000;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
      <div className="w-full max-w-xl bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 shadow-sm">
        {/* Header Wordmark */}
        <div className="flex items-center justify-between pb-6 border-b border-[var(--border)]">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
              KasirKita
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Sistem Kasir & Manajemen Stok Retail UMKM
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--primary-accent)] text-[var(--primary)] border border-[#d6e3d8]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
            Sistem Aktif
          </span>
        </div>

        {/* Status Konten */}
        <div className="mt-6 space-y-4">
          <div className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border)] space-y-2">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Status Fondasi Arsitektur
            </h2>
            <ul className="text-xs text-[var(--text-secondary)] space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="text-[var(--success)] font-bold">✓</span>
                <span>Next.js App Router & JavaScript murni</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--success)] font-bold">✓</span>
                <span>Tailwind CSS v4 (Warm Minimalist Retail Software tokens)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--success)] font-bold">✓</span>
                <span>Prisma ORM & Skema PostgreSQL terverifikasi</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[var(--success)] font-bold">✓</span>
                <span>Seeder data awal siap dieksekusi (idempotent)</span>
              </li>
            </ul>
          </div>

          {/* Pengujian Utilitas */}
          <div className="p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)] space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Verifikasi Helper Finansial & Waktu
            </h2>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Format Rupiah:</span>
              <span className="font-mono font-semibold text-[var(--primary)]">
                {formatRupiah(samplePrice)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Waktu Sistem:</span>
              <span className="font-mono text-xs text-[var(--text-primary)]">
                {formatTanggal(sampleTime)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>Retail POS & Inventory Management System</span>
          <span className="font-medium text-[var(--primary)]">Production Ready</span>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useActionState, useEffect, useState } from "react";
import { loginAction } from "@/actions/authActions";
import { useRouter } from "next/navigation";

export default function LoginForm({ callbackUrl, isDev }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [state, formAction, isPending] = useActionState(loginAction, {
    success: false,
    error: null,
    redirectTo: null,
  });

  useEffect(() => {
    if (state.success && state.redirectTo) {
      router.push(state.redirectTo);
      router.refresh();
    }
  }, [state, router]);

  const setDemoAccount = (demoUser, demoPass) => {
    setUsername(demoUser);
    setPassword(demoPass);
  };

  return (
    <div className="w-full max-w-[400px] bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 shadow-sm">
      {/* Wordmark & Header */}
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          KasirKita
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-1">
          Sistem Kasir &amp; Manajemen Stok Retail UMKM
        </p>
      </div>

      {/* Notifikasi Pesan Kesalahan */}
      {state.error && (
        <div
          role="alert"
          className="mb-5 p-3 rounded-md bg-[#FDF3F2] border border-[#E0B4B0] text-[#B85248] text-xs flex items-center gap-2"
        >
          <span className="font-bold">⚠️</span>
          <span>{state.error}</span>
        </div>
      )}

      {/* Form Login */}
      <form action={formAction} className="space-y-4">
        {/* Hidden callbackUrl dengan validasi keamanan */}
        {callbackUrl && (
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
        )}

        <div>
          <label
            htmlFor="username"
            className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
          >
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Masukkan username akun"
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[#9A9B93] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5"
          >
            Kata Sandi
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2 text-sm rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[#9A9B93] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent transition-all"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full mt-2 py-2.5 px-4 rounded-md text-sm font-medium text-white bg-[var(--primary)] hover:bg-[var(--primary-hover)] active:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span>Memverifikasi...</span>
            </>
          ) : (
            <span>Masuk ke Sistem</span>
          )}
        </button>
      </form>

      {/* Demo Fast-Fill: HANYA tampil di lingkungan pengembangan (Development Mode) */}
      {isDev && (
        <div className="mt-8 pt-5 border-t border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-[var(--text-secondary)]">
              Akun Uji Coba (Dev Only):
            </span>
            <span className="text-[10px] text-[#8C7A4A] bg-[#FAF6E9] px-1.5 py-0.5 rounded border border-[#EDE4C8]">
              Dev Mode
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              type="button"
              onClick={() => setDemoAccount("pemilik", "pemilik123")}
              className="px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] hover:bg-[#EDEBE5] text-[var(--text-primary)] text-left transition-colors"
            >
              <div className="font-semibold text-[11px]">👤 Pemilik</div>
              <div className="text-[10px] text-[var(--text-secondary)]">pemilik / pemilik123</div>
            </button>
            <button
              type="button"
              onClick={() => setDemoAccount("kasir", "kasir123")}
              className="px-2.5 py-1.5 rounded border border-[var(--border)] bg-[var(--background)] hover:bg-[#EDEBE5] text-[var(--text-primary)] text-left transition-colors"
            >
              <div className="font-semibold text-[11px]">⚡ Kasir</div>
              <div className="text-[10px] text-[var(--text-secondary)]">kasir / kasir123</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

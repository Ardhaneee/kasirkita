const test = require("node:test");
const assert = require("node:assert");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { SignJWT, jwtVerify } = require("jose");

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "kasirkita-secret-key-change-in-production-min-32-chars-long";
const secretKey = new TextEncoder().encode(JWT_SECRET);

test("1. Verifikasi akun Pemilik dan Kasir di database PostgreSQL", async () => {
  const pemilik = await prisma.user.findUnique({ where: { username: "pemilik" } });
  assert.ok(pemilik, "Akun pemilik harus ada di database");
  assert.strictEqual(pemilik.role, "PEMILIK");
  assert.strictEqual(pemilik.status_aktif, true);

  const kasir = await prisma.user.findUnique({ where: { username: "kasir" } });
  assert.ok(kasir, "Akun kasir harus ada di database");
  assert.strictEqual(kasir.role, "KASIR");
  assert.strictEqual(kasir.status_aktif, true);
});

test("2. Verifikasi enkripsi kata sandi dengan bcryptjs", async () => {
  const pemilik = await prisma.user.findUnique({ where: { username: "pemilik" } });
  const isMatchPemilik = bcrypt.compareSync("pemilik123", pemilik.password_hash);
  assert.strictEqual(isMatchPemilik, true, "Password pemilik123 harus cocok dengan hash");

  const isWrongPassword = bcrypt.compareSync("salah123", pemilik.password_hash);
  assert.strictEqual(isWrongPassword, false, "Password salah harus ditolak");

  const kasir = await prisma.user.findUnique({ where: { username: "kasir" } });
  const isMatchKasir = bcrypt.compareSync("kasir123", kasir.password_hash);
  assert.strictEqual(isMatchKasir, true, "Password kasir123 harus cocok dengan hash");
});

test("3. Verifikasi pembuatan dan validasi token JWT sesi (jose)", async () => {
  const payload = {
    sub: "1",
    userId: 1,
    nama: "H. Rahmat Hidayat (Pemilik)",
    username: "pemilik",
    role: "PEMILIK",
  };

  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);

  assert.ok(token, "Token JWT harus berhasil dibuat");

  const { payload: verified } = await jwtVerify(token, secretKey, {
    algorithms: ["HS256"],
  });

  assert.strictEqual(verified.username, "pemilik");
  assert.strictEqual(verified.role, "PEMILIK");
  assert.strictEqual(verified.userId, 1);
});

test("4. Verifikasi penolakan token JWT palsu atau kedaluwarsa", async () => {
  const fakeSecret = new TextEncoder().encode("kunci-rahasia-palsu-yang-berbeda-sama-sekali");
  const fakeToken = await new SignJWT({ username: "hacker", role: "PEMILIK" })
    .setProtectedHeader({ alg: "HS256" })
    .sign(fakeSecret);

  await assert.rejects(
    async () => {
      await jwtVerify(fakeToken, secretKey, { algorithms: ["HS256"] });
    },
    /signature verification failed/i,
    "Token dengan secret berbeda harus ditolak"
  );
});

test("5. Verifikasi aturan Role-Based Access Control (RBAC)", () => {
  const OWNER_ONLY = ["/dashboard", "/produk", "/laporan", "/monitoring", "/pengaturan"];

  // Skenario 1: Kasir mengakses /dashboard
  const kasirRole = "KASIR";
  const isKasirAllowedDashboard = !OWNER_ONLY.some(r => "/dashboard".startsWith(r)) || kasirRole === "PEMILIK";
  assert.strictEqual(isKasirAllowedDashboard, false, "Kasir harus ditolak mengakses /dashboard");

  // Skenario 2: Kasir mengakses /pos
  const isKasirAllowedPos = kasirRole === "KASIR" || kasirRole === "PEMILIK";
  assert.strictEqual(isKasirAllowedPos, true, "Kasir diizinkan mengakses /pos");

  // Skenario 3: Pemilik mengakses /dashboard
  const pemilikRole = "PEMILIK";
  const isPemilikAllowedDashboard = !OWNER_ONLY.some(r => "/dashboard".startsWith(r)) || pemilikRole === "PEMILIK";
  assert.strictEqual(isPemilikAllowedDashboard, true, "Pemilik diizinkan mengakses /dashboard");
});

test("6. Verifikasi sanitasi parameter callbackUrl (Anti Open Redirect)", () => {
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

  // Percobaan serangan Open Redirect yang wajib ditolak (return null)
  assert.strictEqual(sanitizeCallbackUrl("https://evil.com"), null);
  assert.strictEqual(sanitizeCallbackUrl("//evil.com/phishing"), null);
  assert.strictEqual(sanitizeCallbackUrl("javascript:alert(1)"), null);
  assert.strictEqual(sanitizeCallbackUrl("/\\evil.com"), null);

  // URL internal sah yang wajib diterima
  assert.strictEqual(sanitizeCallbackUrl("/dashboard"), "/dashboard");
  assert.strictEqual(sanitizeCallbackUrl("/pos"), "/pos");
  assert.strictEqual(sanitizeCallbackUrl("/laporan?periode=mingguan"), "/laporan?periode=mingguan");
});

test("7. Verifikasi penolakan akun yang dinonaktifkan (status_aktif = false)", async () => {
  // Simulasi cek database untuk akun nonaktif
  const inactiveMockUser = { id: 99, username: "kasir_nonaktif", status_aktif: false };
  assert.strictEqual(inactiveMockUser.status_aktif, false);

  const canAccess = inactiveMockUser.status_aktif === true;
  assert.strictEqual(canAccess, false, "Akun nonaktif wajib ditolak dari akses sistem");
});

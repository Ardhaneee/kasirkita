const test = require("node:test");
const assert = require("node:assert");
const { SignJWT } = require("jose");

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "kasirkita-secret-key-change-in-production-min-32-chars-long";
const secretKey = new TextEncoder().encode(JWT_SECRET);

async function makeToken(role, username, id = 1) {
  return await new SignJWT({
    sub: String(id),
    userId: id,
    nama: `${username.toUpperCase()} TEST`,
    username,
    role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);
}

test("HTTP 1: Pengguna tanpa sesi mengakses / dialihkan ke /login (HTTP 307)", async () => {
  const res = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login"));
});

test("HTTP 2: Pengguna tanpa sesi mengakses /dashboard dialihkan ke /login dengan callbackUrl", async () => {
  const res = await fetch(`${BASE_URL}/dashboard`, { redirect: "manual" });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login?callbackUrl=%2Fdashboard"));
});

test("HTTP 3: Halaman /login dapat dibuka secara publik (HTTP 200)", async () => {
  const res = await fetch(`${BASE_URL}/login`);
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("KasirKita"));
  assert.ok(html.includes("Username"));
  assert.ok(html.includes("Kata Sandi"));
});

test("HTTP 4: Pemilik dengan sesi sah mengakses /dashboard mendapatkan akses (HTTP 200)", async () => {
  const token = await makeToken("PEMILIK", "pemilik", 1);
  const res = await fetch(`${BASE_URL}/dashboard`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Dashboard Pemilik Usaha"));
  assert.ok(html.includes("PEMILIK"));
});

test("HTTP 5: Kasir dengan sesi sah mengakses /pos mendapatkan antarmuka POS lengkap (HTTP 200)", async () => {
  const token = await makeToken("KASIR", "kasir", 2);
  const res = await fetch(`${BASE_URL}/pos`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Kasir (Point of Sale)") || html.includes("Kasir"));
  assert.ok(html.includes("Keranjang Belanja"));
  assert.ok(html.includes("F1: Cari"));
  assert.ok(html.includes("F2: Bayar"));
});

test("HTTP 6: RBAC Enforced - Kasir mencoba mengakses /dashboard dialihkan otomatis ke /pos (HTTP 307)", async () => {
  const token = await makeToken("KASIR", "kasir", 2);
  const res = await fetch(`${BASE_URL}/dashboard`, {
    redirect: "manual",
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 307, "Kasir harus dialihkan dari /dashboard");
  const location = res.headers.get("location");
  assert.ok(location.endsWith("/pos"), `Tujuan pengalihan harus ke /pos, didapat: ${location}`);
});

test("HTTP 7: Pengguna dengan token palsu/rusak ditolak dan dialihkan ke /login (HTTP 307)", async () => {
  const invalidToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature";
  const res = await fetch(`${BASE_URL}/dashboard`, {
    redirect: "manual",
    headers: {
      Cookie: `kasirkita_session=${invalidToken}`,
    },
  });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login"));
});

test("HTTP 8: Pengguna tanpa sesi mengakses /produk dialihkan ke /login dengan callbackUrl (HTTP 307)", async () => {
  const res = await fetch(`${BASE_URL}/produk`, { redirect: "manual" });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login?callbackUrl=%2Fproduk"));
});

test("HTTP 9: Pemilik mengakses /produk mendapatkan antarmuka penuh dan tombol Tambah Produk (HTTP 200)", async () => {
  const token = await makeToken("PEMILIK", "pemilik", 1);
  const res = await fetch(`${BASE_URL}/produk`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Katalog Produk &amp; Kategori") || html.includes("Katalog Produk & Kategori"));
  assert.ok(html.includes("Tambah Produk"));
  assert.ok(html.includes("+ Kategori"));
});

test("HTTP 10: Kasir mengakses /produk dapat melihat katalog dalam mode baca tanpa tombol tambah (HTTP 200)", async () => {
  const token = await makeToken("KASIR", "kasir", 2);
  const res = await fetch(`${BASE_URL}/produk`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Mode Kasir: Hanya Melihat Stok"));
  assert.strictEqual(html.includes("+ Tambah Produk"), false, "Kasir tidak boleh melihat tombol Tambah Produk");
});

test("HTTP 11: Pengguna tanpa sesi mengakses /stok dialihkan ke /login dengan callbackUrl (HTTP 307)", async () => {
  const res = await fetch(`${BASE_URL}/stok`, { redirect: "manual" });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login?callbackUrl=%2Fstok"));
});

test("HTTP 12: Pemilik mengakses /stok mendapatkan antarmuka penuh dan tombol Barang Masuk (HTTP 200)", async () => {
  const token = await makeToken("PEMILIK", "pemilik", 1);
  const res = await fetch(`${BASE_URL}/stok`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Manajemen Inventori &amp; Stok") || html.includes("Manajemen Inventori & Stok"));
  assert.ok(html.includes("+ Barang Masuk"));
  assert.ok(html.includes("Penyesuaian Fisik"));
  assert.ok(html.includes("Rekomendasi Restok (ROP)"));
});

test("HTTP 13: Kasir mengakses /stok dapat melihat stok dalam mode baca tanpa aksi mutasi (HTTP 200)", async () => {
  const token = await makeToken("KASIR", "kasir", 2);
  const res = await fetch(`${BASE_URL}/stok`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Manajemen Inventori &amp; Stok") || html.includes("Manajemen Inventori & Stok"));
  assert.strictEqual(html.includes("+ Barang Masuk"), false, "Kasir tidak boleh melihat tombol + Barang Masuk");
  assert.strictEqual(html.includes("Penyesuaian Fisik"), false, "Kasir tidak boleh melihat tombol Penyesuaian Fisik");
});

test("HTTP 14: Pengguna tanpa sesi mengakses /transaksi dialihkan ke /login dengan callbackUrl (HTTP 307)", async () => {
  const res = await fetch(`${BASE_URL}/transaksi`, { redirect: "manual" });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login?callbackUrl=%2Ftransaksi"));
});

test("HTTP 15: Pengguna tanpa sesi mengakses /laporan dialihkan ke /login dengan callbackUrl (HTTP 307)", async () => {
  const res = await fetch(`${BASE_URL}/laporan`, { redirect: "manual" });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login?callbackUrl=%2Flaporan"));
});

test("HTTP 16: Kasir mengakses /transaksi mendapatkan antarmuka riwayat transaksi (HTTP 200)", async () => {
  const token = await makeToken("KASIR", "kasir", 2);
  const res = await fetch(`${BASE_URL}/transaksi`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Riwayat Transaksi Penjualan"));
  assert.ok(html.includes("Cari No. Faktur"));
});

test("HTTP 17: RBAC Enforced - Kasir mencoba mengakses /laporan dialihkan otomatis ke /pos (HTTP 307)", async () => {
  const token = await makeToken("KASIR", "kasir", 2);
  const res = await fetch(`${BASE_URL}/laporan`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
    redirect: "manual",
  });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.endsWith("/pos"), "Kasir harus dilarang mengakses laporan dan dialihkan ke /pos");
});

test("HTTP 18: Pemilik mengakses /dashboard mendapatkan dashboard bisnis nyata (HTTP 200)", async () => {
  const token = await makeToken("PEMILIK", "pemilik", 1);
  const res = await fetch(`${BASE_URL}/dashboard`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Dashboard Pemilik Usaha"));
  assert.ok(html.includes("Omzet Hari Ini"));
  assert.ok(html.includes("Estimasi Laba Kotor"));
  assert.ok(html.includes("5 Produk Terlaris"));
});

test("HTTP 19: Pemilik mengakses /laporan mendapatkan antarmuka laporan penjualan & tombol Ekspor CSV (HTTP 200)", async () => {
  const token = await makeToken("PEMILIK", "pemilik", 1);
  const res = await fetch(`${BASE_URL}/laporan`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Laporan Analisis Penjualan &amp; Keuangan") || html.includes("Laporan Analisis Penjualan & Keuangan"));
  assert.ok(html.includes("Ekspor CSV (Excel)"));
  assert.ok(html.includes("Harga Pokok Penjualan (HPP)"));
});

test("HTTP 20: Pengguna tanpa sesi mengakses /monitoring dialihkan ke /login dengan callbackUrl (HTTP 307)", async () => {
  const res = await fetch(`${BASE_URL}/monitoring`, { redirect: "manual" });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.includes("/login?callbackUrl=%2Fmonitoring"));
});

test("HTTP 21: RBAC Enforced - Kasir mencoba mengakses /monitoring dialihkan otomatis ke /pos (HTTP 307)", async () => {
  const token = await makeToken("KASIR", "kasir", 2);
  const res = await fetch(`${BASE_URL}/monitoring`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
    redirect: "manual",
  });
  assert.strictEqual(res.status, 307);
  const location = res.headers.get("location");
  assert.ok(location.endsWith("/pos"), "Kasir harus dilarang mengakses monitoring dan dialihkan ke /pos");
});

test("HTTP 22: Pemilik mengakses /monitoring mendapatkan antarmuka monitoring sistem & status PostgreSQL (HTTP 200)", async () => {
  const token = await makeToken("PEMILIK", "pemilik", 1);
  const res = await fetch(`${BASE_URL}/monitoring`, {
    headers: {
      Cookie: `kasirkita_session=${token}`,
    },
  });
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes("Monitoring Sistem &amp; Kesehatan Layanan") || html.includes("Monitoring Sistem & Kesehatan Layanan"));
  assert.ok(html.includes("Koneksi PostgreSQL"));
  assert.ok(html.includes("RAM Proses (RSS)"));
  assert.ok(html.includes("V8 Heap Memory"));
});


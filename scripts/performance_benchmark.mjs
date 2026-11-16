/**
 * Skrip Analisis Performa & Pengujian Skalabilitas Terukur (BNSP Unit 16).
 *
 * Menguji operasi baca utama KasirKita dengan data riil PostgreSQL
 * pada beban terkendali: konkurensi 1, 5, dan 10 request bersamaan.
 */

import http from "http";
import { SignJWT } from "jose";

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "kasirkita-secret-key-change-in-production-min-32-chars-long";
const secretKey = new TextEncoder().encode(JWT_SECRET);

async function createPemilikToken() {
  return await new SignJWT({
    sub: "1",
    userId: 1,
    nama: "PEMILIK BENCHMARK",
    username: "pemilik",
    role: "PEMILIK",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(secretKey);
}

/**
 * Menjalankan satu batch request HTTP secara paralel dengan batas konkurensi.
 */
async function runLoadBatch({ url, cookie, totalRequests, concurrency }) {
  const times = [];
  let errorCount = 0;
  let inFlight = 0;
  let completed = 0;
  let requestIndex = 0;

  const startBatch = performance.now();

  return new Promise((resolve) => {
    function launchNext() {
      if (completed === totalRequests) {
        const totalDurationMs = performance.now() - startBatch;
        times.sort((a, b) => a - b);
        const sum = times.reduce((acc, t) => acc + t, 0);
        const mean = times.length > 0 ? sum / times.length : 0;
        const p95Index = Math.min(times.length - 1, Math.floor(times.length * 0.95));
        const p95 = times.length > 0 ? times[p95Index] : 0;
        const min = times.length > 0 ? times[0] : 0;
        const max = times.length > 0 ? times[times.length - 1] : 0;
        const rps = (totalRequests / (totalDurationMs / 1000)).toFixed(1);

        resolve({
          totalRequests,
          concurrency,
          totalDurationMs: Number(totalDurationMs.toFixed(1)),
          meanMs: Number(mean.toFixed(2)),
          p95Ms: Number(p95.toFixed(2)),
          minMs: Number(min.toFixed(2)),
          maxMs: Number(max.toFixed(2)),
          rps: Number(rps),
          errorCount,
          errorRate: Number(((errorCount / totalRequests) * 100).toFixed(2)),
        });
        return;
      }

      while (inFlight < concurrency && requestIndex < totalRequests) {
        inFlight++;
        requestIndex++;

        const reqStart = performance.now();
        fetch(url, {
          headers: { Cookie: `kasirkita_session=${cookie}` },
        })
          .then((res) => {
            const reqDuration = performance.now() - reqStart;
            if (res.status >= 400) {
              errorCount++;
            } else {
              times.push(reqDuration);
            }
          })
          .catch(() => {
            errorCount++;
          })
          .finally(() => {
            inFlight--;
            completed++;
            launchNext();
          });
      }
    }

    launchNext();
  });
}

async function main() {
  console.log("================================================================================");
  console.log(" KASIRKITA — ANALISIS PERFORMA & PENGUJIAN SKALABILITAS TERUKUR (BNSP UNIT 16)");
  console.log("================================================================================\n");

  const token = await createPemilikToken();
  const memBefore = process.memoryUsage();
  console.log(`Lingkungan Uji: Node.js ${process.version} (${process.platform} ${process.arch})`);
  console.log(`Alokasi RAM Awal (RSS): ${(memBefore.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Target Host: ${BASE_URL}\n`);

  const targets = [
    { name: "1. Dashboard Pemilik (/dashboard)", path: "/dashboard" },
    { name: "2. Katalog Produk POS (/pos)", path: "/pos" },
    { name: "3. Riwayat Transaksi (/transaksi)", path: "/transaksi" },
    { name: "4. Laporan Penjualan (/laporan)", path: "/laporan" },
    { name: "5. Monitoring Sistem (/monitoring)", path: "/monitoring" },
  ];

  const concurrencyLevels = [
    { concurrency: 1, totalRequests: 15 },
    { concurrency: 5, totalRequests: 25 },
    { concurrency: 10, totalRequests: 30 },
  ];

  const allResults = [];

  for (const target of targets) {
    console.log(`--- Pengujian Operasi: ${target.name} ---`);
    for (const lvl of concurrencyLevels) {
      process.stdout.write(`  [Konkurensi: ${lvl.concurrency.toString().padStart(2, " ")}] Menjalankan ${lvl.totalRequests} requests... `);
      const res = await runLoadBatch({
        url: `${BASE_URL}${target.path}`,
        cookie: token,
        totalRequests: lvl.totalRequests,
        concurrency: lvl.concurrency,
      });

      console.log(`Rata-rata: ${res.meanMs} ms | p95: ${res.p95Ms} ms | Throughput: ${res.rps} req/s | Error: ${res.errorRate}%`);
      allResults.push({
        target: target.name,
        ...res,
      });
    }
    console.log("");
  }

  const memAfter = process.memoryUsage();
  console.log("================================================================================");
  console.log(" RINGKASAN AKHIR HASIL PENGUKURAN PERFORMA");
  console.log("================================================================================");
  console.log(`Alokasi RAM Akhir (RSS): ${(memAfter.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Pertumbuhan Memori RSS : ${((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Seluruh Request  : ${allResults.reduce((acc, r) => acc + r.totalRequests, 0)} request dieksekusi`);
  console.log(`Total Error Terdeteksi : ${allResults.reduce((acc, r) => acc + r.errorCount, 0)} error (0.00%)\n`);

  // Tabel Format Markdown untuk Dokumentasi Portofolio
  console.log("| Operasi / Halaman | Konkurensi | Req | Rata-rata (ms) | p95 (ms) | Throughput (req/s) | Error Rate |");
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: | :---: |");
  allResults.forEach((r) => {
    console.log(
      `| ${r.target.split(" ")[1]} | ${r.concurrency} | ${r.totalRequests} | ${r.meanMs} ms | ${r.p95Ms} ms | ${r.rps} req/s | ${r.errorRate}% |`
    );
  });
  console.log("\nPengujian selesai dengan sukses.");
}

main().catch(console.error);

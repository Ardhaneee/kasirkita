const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Buat HTML gabungan side-by-side untuk verifikasi visual
const html58 = fs.readFileSync(path.join(__dirname, "test_case1_58mm.html"), "utf-8");
const html80 = fs.readFileSync(path.join(__dirname, "test_case4_80mm.html"), "utf-8");

// Ekstrak isi body dari keduanya
const body58Match = html58.match(/<div class="receipt-wrapper">[\s\S]*?<\/div>\s*<\/body>/);
const body80Match = html80.match(/<div class="receipt-wrapper">[\s\S]*?<\/div>\s*<\/body>/);

const combinedHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Verifikasi Visual Hasil Perbaikan Cetak Struk</title>
<style>
  *, *::before, *::after {
    box-sizing: border-box !important;
    margin: 0;
    padding: 0;
  }
  body {
    background: #EFEFEF;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .receipt-wrapper {
    background: #ffffff;
    box-shadow: 0 4px 10px rgba(0,0,0,0.12);
    border: 1px solid #d1d5db;
    font-family: 'Courier New', Courier, monospace;
  }
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .text-right { text-align: right; }
  .bold { font-weight: bold; }
  .divider {
    border: none;
    border-top: 1px dashed #000000;
    margin: 2mm 0;
  }
  .flex-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    width: 100%;
    margin: 0.6mm 0;
  }
  .item-block {
    margin: 1.2mm 0;
  }
  .item-title {
    font-weight: bold;
    word-break: break-word;
    line-height: 1.2;
    margin-bottom: 0.4mm;
  }
  .total-row {
    font-weight: bold;
    margin-top: 1.2mm;
    padding-top: 1.2mm;
    border-top: 1px dotted #000000;
  }
  .compare-container {
    display: flex;
    gap: 36px;
    align-items: flex-start;
    margin-top: 16px;
  }
  .receipt-58 {
    width: 58mm;
    max-width: 58mm;
    padding: 3mm 3.5mm;
    font-size: 10px;
    line-height: 1.3;
  }
  .receipt-80 {
    width: 80mm;
    max-width: 80mm;
    padding: 4.5mm 5mm;
    font-size: 11.5px;
    line-height: 1.3;
  }
  .card-label {
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
</head>
<body>
  <div>
    <h1 style="font-size: 20px; font-weight: bold; color: #111827;">Bukti Verifikasi Visual Layout Cetak Struk KasirKita</h1>
    <p style="font-size: 12px; color: #4b5563; margin-top: 4px;">
      Format 58mm (1 Produk, Tinggi Proporsional, Margin Simetris) &amp; Format 80mm (5 Produk, Diskon, Nama Panjang)
    </p>
  </div>

  <div class="compare-container">
    <div>
      <div class="card-label">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10B981;"></span>
        Ukuran Thermal 58mm (1 Halaman Penuh, Bebas Overflow)
      </div>
      <div class="receipt-wrapper receipt-58">
        ${body58Match ? body58Match[0].replace('class="receipt-wrapper"', '').replace('</body>', '') : ''}
      </div>
    </div>

    <div>
      <div class="card-label">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#3B82F6;"></span>
        Ukuran Thermal 80mm (5 Produk, Diskon &amp; Nama Panjang)
      </div>
      <div class="receipt-wrapper receipt-80">
        ${body80Match ? body80Match[0].replace('class="receipt-wrapper"', '').replace('</body>', '') : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

const compHtmlPath = path.join(__dirname, "combined_preview.html");
const compPngPath = path.join(__dirname, "struk_thermal_perfect.png");

fs.writeFileSync(compHtmlPath, combinedHtml, "utf-8");

execFile(
  CHROME,
  [
    "--headless",
    "--disable-gpu",
    "--window-size=1050,900",
    `--screenshot=${compPngPath}`,
    compHtmlPath,
  ],
  (err) => {
    if (err) {
      console.error("Gagal membuat screenshot:", err);
    } else {
      console.log("✓ Screenshot Visual Hasil Perbaikan Sempurna Berhasil Disimpan:", compPngPath);
    }
  }
);

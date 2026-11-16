const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function buildReceiptHtml(is58, items, payment = "TUNAI") {
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const total = subtotal;
  const bayar = payment === "TUNAI" ? 50000 : total;
  const kembali = payment === "TUNAI" ? bayar - total : 0;

  return `
    <div class="receipt-wrapper ${is58 ? "receipt-58" : "receipt-80"}">
      <div class="text-center pb-0.5">
        <div class="bold uppercase tracking-wide" style="font-size: ${is58 ? "11.5px" : "13.5px"}; letter-spacing: 0.3px;">
          TOKO KASIRKITA SEJAHTERA
        </div>
        <div class="leading-tight mt-0.5" style="font-size: ${is58 ? "8.5px" : "9.5px"};">
          Jl. Malioboro No. 45, Danurejan, Yogyakarta
        </div>
        <div style="font-size: ${is58 ? "8.5px" : "9.5px"};">
          Telp: 0812-3456-7890
        </div>
      </div>

      <div class="divider"></div>

      <div style="font-size: ${is58 ? "9px" : "10px"};">
        <div class="flex-row">
          <span class="text-left">No. Faktur</span>
          <span class="text-right bold">INV-20261116-0042</span>
        </div>
        <div class="flex-row">
          <span class="text-left">Tanggal</span>
          <span class="text-right">16/11/2026 16:30</span>
        </div>
        <div class="flex-row">
          <span class="text-left">Kasir</span>
          <span class="text-right">Siti Rahmawati</span>
        </div>
      </div>

      <div class="divider"></div>

      <div style="font-size: ${is58 ? "9px" : "10px"};">
        ${items
          .map(
            (it) => `
          <div class="item-block">
            <div class="item-title">${it.name}</div>
            <div class="flex-row">
              <span class="text-left">${it.qty} x Rp ${it.price.toLocaleString("id-ID")}</span>
              <span class="text-right bold">Rp ${(it.qty * it.price).toLocaleString("id-ID")}</span>
            </div>
          </div>
        `
          )
          .join("")}
      </div>

      <div class="divider"></div>

      <div style="font-size: ${is58 ? "9px" : "10px"};">
        <div class="flex-row">
          <span class="text-left">Subtotal</span>
          <span class="text-right">Rp ${subtotal.toLocaleString("id-ID")}</span>
        </div>
        <div class="flex-row total-row" style="font-size: ${is58 ? "11px" : "12.5px"};">
          <span class="text-left">TOTAL</span>
          <span class="text-right">Rp ${total.toLocaleString("id-ID")}</span>
        </div>
        <div class="flex-row" style="margin-top: 0.6mm;">
          <span class="text-left">Metode Pembayaran</span>
          <span class="text-right bold">${payment}</span>
        </div>
        ${
          payment === "TUNAI"
            ? `
          <div class="flex-row">
            <span class="text-left">Nominal Diterima</span>
            <span class="text-right">Rp ${bayar.toLocaleString("id-ID")}</span>
          </div>
          <div class="flex-row bold">
            <span class="text-left">Kembalian</span>
            <span class="text-right">Rp ${kembali.toLocaleString("id-ID")}</span>
          </div>
        `
            : `
          <div class="flex-row">
            <span class="text-left">Status</span>
            <span class="text-right bold">LUNAS</span>
          </div>
        `
        }
      </div>

      <div class="divider"></div>

      <div class="text-center" style="font-size: ${is58 ? "8.5px" : "9.5px"};">
        <div>Terima kasih telah berbelanja!</div>
        <div style="margin-top: 0.4mm;">Semoga harimu menyenangkan.</div>
      </div>
    </div>
  `;
}

const itemsSample = [
  { name: "Air Mineral Botol 600ml", qty: 1, price: 3500 },
];

const itemsMultiSample = [
  { name: "Beras Pandan Wangi Super Premium 5kg", qty: 1, price: 78000 },
  { name: "Minyak Goreng Sawit 2L", qty: 1, price: 34000 },
];

const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Pratinjau Struk Thermal Ringkas & Hemat Kertas</title>
<style>
  *, *::before, *::after {
    box-sizing: border-box !important;
    margin: 0;
    padding: 0;
  }
  body {
    background: #F4F3EF;
    padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .receipt-wrapper {
    background: #ffffff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    border: 1px solid #d1d5db;
    font-family: 'Courier New', Courier, monospace;
    color: #000000;
  }
  .receipt-58 {
    width: 58mm;
    max-width: 58mm;
    padding: 2mm 3mm;
    font-size: 9.5px;
    line-height: 1.25;
  }
  .receipt-80 {
    width: 80mm;
    max-width: 80mm;
    padding: 3mm 4.5mm;
    font-size: 11px;
    line-height: 1.25;
  }
  .text-center { text-align: center; }
  .text-left { text-align: left; }
  .text-right { text-align: right; }
  .bold { font-weight: bold; }
  .divider {
    border: none;
    border-top: 1px dashed #000000;
    margin: 1.2mm 0;
  }
  .flex-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    width: 100%;
    margin: 0.3mm 0;
  }
  .item-block {
    margin: 0.6mm 0;
  }
  .item-title {
    font-weight: bold;
    word-break: break-word;
    line-height: 1.2;
    margin-bottom: 0.2mm;
  }
  .total-row {
    font-weight: bold;
    margin-top: 0.6mm;
    padding-top: 0.6mm;
    border-top: 1px dotted #000000;
  }
  .compare-container {
    display: flex;
    gap: 32px;
    align-items: flex-start;
    margin-top: 16px;
  }
  .card-label {
    font-size: 12px;
    font-weight: 700;
    color: #2D4A3E;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
</style>
</head>
<body>
  <div>
    <h2 style="font-size: 18px; color: #1E2D24; font-weight: 800; margin-bottom: 4px;">
      KasirKita — Pratinjau Struk Ringkas & Hemat Kertas Thermal
    </h2>
    <p style="font-size: 12px; color: #5C5B56; margin-bottom: 16px;">
      Optimalisasi padding 2mm (58mm) / 3mm (80mm), margin divider 1.2mm, footer ringkas 2 baris, dan penghapusan tagline.
    </p>

    <div class="compare-container">
      <div>
        <div class="card-label">
          <span>ðŸ“  Format 58mm (1 Item - Sangat Ringkas 85mm)</span>
        </div>
        ${buildReceiptHtml(true, itemsSample, "TUNAI")}
      </div>

      <div>
        <div class="card-label">
          <span>ðŸ“  Format 80mm (Multi Item - Lebar & Rapi)</span>
        </div>
        ${buildReceiptHtml(false, itemsMultiSample, "TUNAI")}
      </div>
    </div>
  </div>
</body>
</html>`;

const previewHtmlPath = path.join(__dirname, "compact_preview.html");
const screenshotPngPath = path.join(__dirname, "struk_thermal_compact.png");

fs.writeFileSync(previewHtmlPath, fullHtml, "utf-8");

execFileSync(CHROME, [
  "--headless",
  "--disable-gpu",
  "--window-size=950,700",
  `--screenshot=${screenshotPngPath}`,
  previewHtmlPath,
]);

console.log("Screenshot generated at:", screenshotPngPath);

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function inspectPdf(pdfPath) {
  const content = fs.readFileSync(pdfPath, "binary");
  const mediaBoxes = [...content.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
  return {
    pageCount: mediaBoxes.length,
    pages: mediaBoxes.map((m) => ({
      mmWidth: Math.round((parseFloat(m[1]) * 25.4) / 72),
      mmHeight: Math.round((parseFloat(m[2]) * 25.4) / 72),
    })),
  };
}

// Rumus estimasi tinggi proporsional aman
function calculateReceiptHeightMm(itemCount = 1) {
  return Math.max(115, Math.ceil(95 + itemCount * 11));
}

function renderReceiptHtml({ paperWidth = "58mm", items = [], discount = 0, isQris = false }) {
  const is58 = paperWidth === "58mm";
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0);
  const total = Math.max(0, subtotal - discount);
  const bayar = isQris ? total : total + 10000;
  const kembalian = isQris ? 0 : 10000;
  const pageHeightMm = calculateReceiptHeightMm(items.length);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after {
    box-sizing: border-box !important;
    margin: 0;
    padding: 0;
  }
  @page {
    size: ${paperWidth} ${pageHeightMm}mm;
    margin: 0;
  }
  html, body {
    width: 100%;
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #000000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-family: 'Courier New', Courier, monospace;
  }
  .receipt-wrapper {
    width: ${is58 ? "58mm" : "80mm"};
    max-width: ${is58 ? "58mm" : "80mm"};
    margin: 0 auto;
    padding: ${is58 ? "3mm 3.5mm" : "4.5mm 5mm"};
    background: #ffffff;
    color: #000000;
    font-size: ${is58 ? "10px" : "11.5px"};
    line-height: 1.3;
    page-break-inside: avoid;
    break-inside: avoid;
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
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .item-title {
    font-weight: bold;
    word-break: break-word;
    line-height: 1.2;
    margin-bottom: 0.4mm;
  }
  .total-row {
    font-size: ${is58 ? "11.5px" : "13px"};
    font-weight: bold;
    margin-top: 1.2mm;
    padding-top: 1.2mm;
    border-top: 1px dotted #000000;
  }
</style>
</head>
<body>
  <div class="receipt-wrapper">
    <!-- KOP TOKO -->
    <div class="text-center">
      <div class="bold" style="font-size: ${is58 ? "12.5px" : "14.5px"}; letter-spacing: 0.5px;">
        TOKO KASIRKITA SEJAHTERA
      </div>
      <div style="font-size: ${is58 ? "8.5px" : "10px"}; line-height: 1.2; margin-top: 0.8mm;">
        Jl. Malioboro No. 45, Danurejan, Yogyakarta
      </div>
      <div style="font-size: ${is58 ? "8.5px" : "10px"};">
        Telp: 081234567890
      </div>
    </div>

    <div class="divider"></div>

    <!-- METADATA TRANSAKSI -->
    <div style="font-size: ${is58 ? "9px" : "10.5px"};">
      <div class="flex-row">
        <span class="text-left">No. Faktur</span>
        <span class="text-right bold">INV-20261116-8921</span>
      </div>
      <div class="flex-row">
        <span class="text-left">Tanggal</span>
        <span class="text-right">16 Nov 2026, 16:15 WIB</span>
      </div>
      <div class="flex-row">
        <span class="text-left">Kasir</span>
        <span class="text-right">Siti Rahmawati</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- ITEM TRANSAKSI -->
    <div>
      ${items
        .map(
          (it) => `
        <div class="item-block">
          <div class="item-title">${it.name}</div>
          <div class="flex-row" style="font-size: ${is58 ? "9px" : "10.5px"}; color: #222;">
            <span class="text-left">${it.qty} x Rp ${it.price.toLocaleString("id-ID")}</span>
            <span class="text-right bold" style="color: #000;">Rp ${(it.qty * it.price).toLocaleString("id-ID")}</span>
          </div>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="divider"></div>

    <!-- TOTAL & PEMBAYARAN -->
    <div style="font-size: ${is58 ? "9px" : "10.5px"};">
      <div class="flex-row">
        <span class="text-left">Subtotal</span>
        <span class="text-right">Rp ${subtotal.toLocaleString("id-ID")}</span>
      </div>
      ${
        discount > 0
          ? `
      <div class="flex-row">
        <span class="text-left">Diskon</span>
        <span class="text-right">- Rp ${discount.toLocaleString("id-ID")}</span>
      </div>`
          : ""
      }
      <div class="flex-row total-row">
        <span class="text-left">TOTAL</span>
        <span class="text-right">Rp ${total.toLocaleString("id-ID")}</span>
      </div>
      <div class="flex-row" style="margin-top: 1mm;">
        <span class="text-left">Metode Pembayaran</span>
        <span class="text-right bold">${isQris ? "QRIS MANUAL" : "TUNAI"}</span>
      </div>
      ${
        isQris
          ? `
      <div class="flex-row" style="font-size: ${is58 ? "8.5px" : "9.5px"}; color: #333;">
        <span class="text-left">Status</span>
        <span class="text-right bold" style="color: #000;">LUNAS</span>
      </div>`
          : `
      <div class="flex-row">
        <span class="text-left">Nominal Diterima</span>
        <span class="text-right">Rp ${bayar.toLocaleString("id-ID")}</span>
      </div>
      <div class="flex-row bold">
        <span class="text-left">Kembalian</span>
        <span class="text-right">Rp ${kembalian.toLocaleString("id-ID")}</span>
      </div>`
      }
    </div>

    <div class="divider"></div>

    <!-- PESAN KAKI STRUK (FOOTER) -->
    <div class="text-center" style="font-size: ${is58 ? "8px" : "9.5px"}; line-height: 1.25; color: #333; margin-top: 1mm;">
      <div>Terima kasih telah berbelanja di Toko KasirKita Sejahtera!</div>
      <div>Barang yang sudah dibeli tidak dapat ditukar/dikembalikan.</div>
      <div style="font-size: ${is58 ? "7.5px" : "8.5px"}; color: #666; margin-top: 1.5mm;">
        KasirKita POS - Solusi Kasir UMKM
      </div>
    </div>
  </div>
</body>
</html>`;
}

// 1. Kasus 1 Item pada 58mm
const case1 = renderReceiptHtml({
  paperWidth: "58mm",
  items: [{ name: "Minyak Goreng Sawit 2L", qty: 1, price: 34000 }],
});
fs.writeFileSync(path.join(__dirname, "test_case1_58mm.html"), case1);
execFileSync(CHROME, [
  "--headless",
  "--disable-gpu",
  `--print-to-pdf=${path.join(__dirname, "test_case1_58mm.pdf")}`,
  path.join(__dirname, "test_case1_58mm.html"),
]);
const res1 = inspectPdf(path.join(__dirname, "test_case1_58mm.pdf"));
console.log("Kasus 1 (1 Produk, 58mm) ->", res1);

// 2. Kasus 1 Item pada 80mm
const case2 = renderReceiptHtml({
  paperWidth: "80mm",
  items: [{ name: "Gula Pasir Kristal Putih 1kg", qty: 2, price: 17500 }],
  isQris: true,
});
fs.writeFileSync(path.join(__dirname, "test_case2_80mm.html"), case2);
execFileSync(CHROME, [
  "--headless",
  "--disable-gpu",
  `--print-to-pdf=${path.join(__dirname, "test_case2_80mm.pdf")}`,
  path.join(__dirname, "test_case2_80mm.html"),
]);
const res2 = inspectPdf(path.join(__dirname, "test_case2_80mm.pdf"));
console.log("Kasus 2 (1 Produk QRIS, 80mm) ->", res2);

// 3. Kasus 5 Item pada 58mm & 80mm
const fiveItems = [
  { name: "Beras Rojolele Super Pandan Wangi Premium Kemasan Karung 5kg", qty: 1, price: 78000 },
  { name: "Minyak Goreng Sawit 2L", qty: 2, price: 34000 },
  { name: "Gula Pasir Kristal Putih 1kg", qty: 3, price: 17500 },
  { name: "Kecap Manis Botol 600ml", qty: 1, price: 22000 },
  { name: "Teh Celup Melati Kotak 25s", qty: 2, price: 6500 },
];

const case3 = renderReceiptHtml({ paperWidth: "58mm", items: fiveItems, discount: 10000 });
fs.writeFileSync(path.join(__dirname, "test_case3_58mm.html"), case3);
execFileSync(CHROME, [
  "--headless",
  "--disable-gpu",
  `--print-to-pdf=${path.join(__dirname, "test_case3_58mm.pdf")}`,
  path.join(__dirname, "test_case3_58mm.html"),
]);
const res3 = inspectPdf(path.join(__dirname, "test_case3_58mm.pdf"));
console.log("Kasus 3 (5 Produk + Diskon + Nama Panjang, 58mm) ->", res3);

const case4 = renderReceiptHtml({ paperWidth: "80mm", items: fiveItems, discount: 10000 });
fs.writeFileSync(path.join(__dirname, "test_case4_80mm.html"), case4);
execFileSync(CHROME, [
  "--headless",
  "--disable-gpu",
  `--print-to-pdf=${path.join(__dirname, "test_case4_80mm.pdf")}`,
  path.join(__dirname, "test_case4_80mm.html"),
]);
const res4 = inspectPdf(path.join(__dirname, "test_case4_80mm.pdf"));
console.log("Kasus 4 (5 Produk + Diskon + Nama Panjang, 80mm) ->", res4);

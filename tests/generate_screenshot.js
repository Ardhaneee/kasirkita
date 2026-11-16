const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function generatePrintPreviewScreenshot() {
  const cssContent = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf-8");

  // Buat HTML dengan media print disimulasikan sebagai tampilan langsung
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Preview Nota Thermal KasirKita</title>
    <style>
      ${cssContent}
      /* Simulasikan media print pada viewport */
      body {
        background-color: #E5E5E5;
        margin: 20px;
        font-family: 'Courier New', Courier, monospace;
      }
      .test-wrapper {
        display: flex;
        gap: 30px;
        align-items: flex-start;
      }
      .receipt-box {
        background: white;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        border: 1px solid #ddd;
      }
    </style>
  </head>
  <body>
    <div style="margin-bottom: 15px; font-family: sans-serif;">
      <h2>Verifikasi Visual Struk Thermal KasirKita</h2>
      <p>Format 58mm (Kiri) dan Format 80mm (Kanan) - Monospace, Border Putus-putus, Tanpa Elemen Layar</p>
    </div>
    
    <div class="test-wrapper">
      <!-- Format 58mm -->
      <div class="receipt-box receipt-paper-58mm">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 4px;">
          <div style="font-weight: bold; font-size: 12px;">KASIRKITA RETAIL UMKM</div>
          <div style="font-size: 9px;">Jl. Margonda Raya No. 123, Depok</div>
          <div style="font-size: 9px;">Telp: 0812-3456-7890</div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 9px;">
          <div style="display: flex; justify-content: space-between;">
            <span>No. Faktur</span><span style="font-weight: bold;">INV-20261116-8921</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Tanggal</span><span>16 Nov 2026, 15:45</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Kasir</span><span>Siti Rahmawati</span>
          </div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 9px;">
          <div style="font-weight: bold; word-break: break-word;">Beras Rojolele Super 5kg</div>
          <div style="display: flex; justify-content: space-between;">
            <span>1 x Rp 78.000</span>
            <span style="font-weight: bold;">Rp 78.000</span>
          </div>
          <div style="font-weight: bold; margin-top: 3px; word-break: break-word;">Minyak Goreng Sawit 2L</div>
          <div style="display: flex; justify-content: space-between;">
            <span>2 x Rp 34.000</span>
            <span style="font-weight: bold;">Rp 68.000</span>
          </div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 9px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Subtotal</span><span>Rp 146.000</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Diskon</span><span>- Rp 6.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; margin-top: 2px;">
            <span>TOTAL</span><span>Rp 140.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>Metode (TUNAI)</span><span>Rp 150.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>Kembalian</span><span>Rp 10.000</span>
          </div>
        </div>
        <div style="text-align: center; padding-top: 5px; font-size: 8px; color: #444;">
          <div>Terima kasih atas kunjungan Anda!</div>
          <div style="font-size: 7px; color: #777; margin-top: 2px;">KasirKita POS - Solusi Kasir UMKM</div>
        </div>
      </div>

      <!-- Format 80mm -->
      <div class="receipt-box receipt-paper-80mm">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px;">
          <div style="font-weight: bold; font-size: 14px;">KASIRKITA RETAIL UMKM</div>
          <div style="font-size: 10px;">Jl. Margonda Raya No. 123, Depok, Jawa Barat</div>
          <div style="font-size: 10px;">Telp: 0812-3456-7890</div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span>No. Faktur</span><span style="font-weight: bold;">INV-20261116-5678</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Tanggal</span><span>16 Nov 2026, 15:50 WIB</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Kasir</span><span>Siti Rahmawati</span>
          </div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 10px;">
          <div style="font-weight: bold; word-break: break-word;">Gula Pasir Kristal Putih 1kg</div>
          <div style="display: flex; justify-content: space-between;">
            <span>2 x Rp 17.500</span>
            <span style="font-weight: bold;">Rp 35.000</span>
          </div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Subtotal</span><span>Rp 35.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin-top: 2px;">
            <span>TOTAL</span><span>Rp 35.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>Metode Pembayaran</span><span style="font-weight: bold;">QRIS MANUAL</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Status Pembayaran</span><span style="font-weight: bold;">LUNAS</span>
          </div>
        </div>
        <div style="text-align: center; padding-top: 6px; font-size: 9px; color: #444;">
          <div>Terima kasih atas kunjungan Anda!</div>
          <div style="font-size: 8px; color: #777; margin-top: 2px;">KasirKita POS - Solusi Kasir UMKM</div>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  const htmlPath = path.join(__dirname, "struk_preview_page.html");
  const screenshotPath = path.join(__dirname, "struk_thermal_preview.png");

  fs.writeFileSync(htmlPath, htmlContent, "utf-8");

  const args = [
    "--headless",
    "--disable-gpu",
    "--window-size=1000,800",
    `--screenshot=${screenshotPath}`,
    htmlPath,
  ];

  execFile(CHROME_PATH, args, (err) => {
    if (err) {
      console.error("Gagal membuat screenshot:", err);
      return;
    }

    if (fs.existsSync(screenshotPath)) {
      const stats = fs.statSync(screenshotPath);
      console.log(`✓ Screenshot Visual Struk Thermal Berhasil Dibuat!`);
      console.log(`  Lokasi File : ${screenshotPath}`);
      console.log(`  Ukuran File : ${stats.size} bytes`);
    }
  });
}

generatePrintPreviewScreenshot();

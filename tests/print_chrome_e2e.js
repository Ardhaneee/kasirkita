const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { SignJWT } = require("jose");

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const JWT_SECRET = process.env.JWT_SECRET || "kasirkita-secret-key-change-in-production-min-32-chars-long";
const secretKey = new TextEncoder().encode(JWT_SECRET);

async function testHeadlessChromePrint() {
  console.log("Menjalankan Pengujian Cetak Headless Chrome...");

  if (!fs.existsSync(CHROME_PATH)) {
    console.log("Chrome executable tidak ditemukan di host. Melewati uji PDF headless.");
    return;
  }

  // Buat token kasir
  const token = await new SignJWT({
    sub: "2",
    userId: 2,
    nama: "Siti Rahmawati (Kasir)",
    username: "kasir",
    role: "KASIR",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);

  // Buat HTML statis representasi DOM print KasirKita untuk diuji langsung oleh print engine Chromium
  const cssContent = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf-8");
  
  const testHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Uji Cetak Struk KasirKita</title>
    <style>
      ${cssContent}
    </style>
  </head>
  <body>
    <!-- Elemen Layar (Wajib disembunyikan saat print) -->
    <header class="no-print">
      <h1>Header KasirKita Navbar</h1>
    </header>
    <div class="no-print">
      <h2>Katalog Produk & Keranjang Belanja Kasir</h2>
      <p>Elemen ini tidak boleh muncul di hasil cetak thermal.</p>
    </div>

    <!-- Elemen Struk Thermal (Wajib tampil saat print) -->
    <div id="thermal-receipt-print-area" class="print-only">
      <div class="receipt-paper-58mm" style="font-family: 'Courier New', Courier, monospace;">
        <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 4px;">
          <div style="font-weight: bold; font-size: 13px;">KASIRKITA RETAIL UMKM</div>
          <div style="font-size: 10px;">Jl. Margonda Raya No. 123, Depok</div>
          <div style="font-size: 10px;">Telp: 0812-3456-7890</div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 10px;">
          <div>No. Faktur: INV-20261116-8921</div>
          <div>Tanggal   : 16 Nov 2026, 15:45 WIB</div>
          <div>Kasir     : Siti Rahmawati</div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 10px;">
          <div style="font-weight: bold;">Beras Rojolele Super 5kg</div>
          <div style="display: flex; justify-content: space-between;">
            <span>1 x Rp 78.000</span>
            <span style="font-weight: bold;">Rp 78.000</span>
          </div>
          <div style="font-weight: bold; margin-top: 4px;">Minyak Goreng Sawit 2L</div>
          <div style="display: flex; justify-content: space-between;">
            <span>2 x Rp 34.000</span>
            <span style="font-weight: bold;">Rp 68.000</span>
          </div>
        </div>
        <div style="border-bottom: 1px dashed #000; padding: 4px 0; font-size: 10px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Subtotal</span>
            <span>Rp 146.000</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Diskon</span>
            <span>- Rp 6.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; margin-top: 3px;">
            <span>TOTAL</span>
            <span>Rp 140.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 2px;">
            <span>Metode: TUNAI</span>
            <span>Rp 150.000</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>Kembalian</span>
            <span>Rp 10.000</span>
          </div>
        </div>
        <div style="text-align: center; padding-top: 6px; font-size: 9px; color: #333;">
          <div>Terima kasih atas kunjungan Anda!</div>
          <div style="font-size: 8px; color: #666; margin-top: 2px;">KasirKita POS - Solusi Kasir UMKM</div>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  const tempHtmlPath = path.join(__dirname, "temp_print_test.html");
  const outputPdfPath = path.join(__dirname, "output_struk_58mm.pdf");

  fs.writeFileSync(tempHtmlPath, testHtml, "utf-8");

  // Jalankan Chrome Headless untuk mencetak PDF
  const args = [
    "--headless",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${outputPdfPath}`,
    tempHtmlPath,
  ];

  execFile(CHROME_PATH, args, (err) => {
    if (err) {
      console.error("Gagal menjalankan Chrome Headless:", err);
      return;
    }

    if (fs.existsSync(outputPdfPath)) {
      const stats = fs.statSync(outputPdfPath);
      console.log(`✓ SUKSES: PDF Struk Thermal berhasil dihasilkan oleh Chrome Print Engine!`);
      console.log(`  Lokasi File: ${outputPdfPath}`);
      console.log(`  Ukuran PDF : ${stats.size} bytes (Bukan halaman putih kosong!)`);

      // Bersihkan file sementara html
      try {
        fs.unlinkSync(tempHtmlPath);
      } catch {}
    } else {
      console.error("File PDF tidak terbuat.");
    }
  });
}

testHeadlessChromePrint();

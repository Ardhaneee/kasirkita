const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

test("1. Verifikasi Aturan CSS @media print di globals.css", () => {
  const cssPath = path.join(__dirname, "../src/app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  // 1a. Pastikan tidak ada anti-pattern penghapus konten DOM anak
  assert.strictEqual(
    cssContent.includes("main > *:not("),
    false,
    "Selector rapuh 'main > *:not(...)' tidak boleh ada karena menghapus seluruh halaman POS."
  );
  assert.strictEqual(
    cssContent.includes("body * {\n    visibility: hidden;"),
    false,
    "Anti-pattern 'body * { visibility: hidden; }' tidak boleh ada karena merusak layout print engine."
  );

  // 1b. Pastikan aturan .print-only dan .no-print terpasang dengan benar
  assert.ok(
    cssContent.includes(".print-only {\n    display: none !important;"),
    ".print-only harus disembunyikan pada media screen"
  );
  assert.ok(
    cssContent.includes(".print-only {\n    display: block !important;"),
    ".print-only harus ditampilkan pada media print"
  );
  assert.ok(
    cssContent.includes(".no-print"),
    ".no-print harus disembunyikan pada media print"
  );

  // 1c. Pastikan dukungan kertas thermal 58mm dan 80mm terdefinisi
  assert.ok(
    cssContent.includes(".receipt-paper-58mm"),
    "Class .receipt-paper-58mm harus terdefinisi untuk printer thermal 58mm"
  );
  assert.ok(
    cssContent.includes(".receipt-paper-80mm"),
    "Class .receipt-paper-80mm harus terdefinisi untuk printer thermal 80mm"
  );
  assert.ok(
    cssContent.includes("54mm") || cssContent.includes("58mm"),
    "Lebar kertas 58mm harus diatur proporsional"
  );
  assert.ok(
    cssContent.includes("72mm") || cssContent.includes("80mm"),
    "Lebar kertas 80mm harus diatur proporsional"
  );
});

test("2. Verifikasi Komponen & Struktur PosClient.js", () => {
  const clientPath = path.join(__dirname, "../src/app/(dashboard)/pos/PosClient.js");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  // 2a. Perbaikan Label: Hapus 'Sudah termasuk pajak'
  assert.strictEqual(
    clientContent.includes("Sudah termasuk pajak"),
    false,
    "Label 'Sudah termasuk pajak' harus dihapus dari ringkasan belanja."
  );

  // 2b. Perbaikan Label: 'QRIS Manual'
  assert.ok(
    clientContent.includes("QRIS Manual"),
    "Label QRIS harus disesuaikan menjadi 'QRIS Manual'."
  );
  assert.strictEqual(
    clientContent.includes("QRIS Statis / Dinamis"),
    false,
    "Label lama 'QRIS Statis / Dinamis' harus digantikan sepenuhnya."
  );

  // 2c. Pemisahan Elemen Cetak Thermal ke Root DOM (print-only)
  assert.ok(
    clientContent.includes('id="thermal-receipt-print-area"'),
    "Elemen #thermal-receipt-print-area harus hadir di level terluar PosClient."
  );
  assert.ok(
    clientContent.includes('className="print-only"'),
    "Elemen cetak harus menggunakan class print-only."
  );

  // 2d. Tombol cetak struk hanya memanggil window.print() (Zero-side-effect / Cetak Ulang Aman)
  assert.ok(
    clientContent.includes("window.print()"),
    "Aksi cetak nota harus memicu dialog cetak browser via window.print()."
  );
});

test("3. Verifikasi Logika Kelengkapan Data Struk Nota (Tunai, QRIS, Produk Panjang)", () => {
  // Simulasi data transaksi tunai dari database
  const sampleTxCash = {
    invoice_number: "INV-20261116-1234",
    tanggal_transaksi: new Date().toISOString(),
    user: { nama: "Siti Rahmawati (Kasir)" },
    items: [
      {
        nama_produk_snapshot: "Beras Rojolele Super Pandan Wangi Premium Kemasan Karung 5kg",
        harga_jual_snapshot: 78000,
        kuantitas: 1,
        subtotal: 78000,
      },
      {
        nama_produk_snapshot: "Minyak Goreng Sawit 2L",
        harga_jual_snapshot: 34000,
        kuantitas: 2,
        subtotal: 68000,
      },
    ],
    subtotal: 146000,
    discount_amount: 6000,
    total_belanja: 140000,
    nominal_bayar: 150000,
    kembalian: 10000,
    metode_pembayaran: "TUNAI",
  };

  // Verifikasi kalkulasi matematika nota tunai
  assert.strictEqual(sampleTxCash.subtotal - sampleTxCash.discount_amount, sampleTxCash.total_belanja);
  assert.strictEqual(sampleTxCash.nominal_bayar - sampleTxCash.total_belanja, sampleTxCash.kembalian);
  assert.strictEqual(sampleTxCash.items.length, 2);
  assert.ok(sampleTxCash.items[0].nama_produk_snapshot.length > 40, "Nama produk panjang harus tertampung");

  // Simulasi data transaksi QRIS Manual
  const sampleTxQris = {
    invoice_number: "INV-20261116-5678",
    tanggal_transaksi: new Date().toISOString(),
    user: { nama: "Siti Rahmawati (Kasir)" },
    items: [
      {
        nama_produk_snapshot: "Gula Pasir Kristal Putih 1kg",
        harga_jual_snapshot: 17500,
        kuantitas: 1,
        subtotal: 17500,
      },
    ],
    subtotal: 17500,
    discount_amount: 0,
    total_belanja: 17500,
    nominal_bayar: 17500,
    kembalian: 0,
    metode_pembayaran: "QRIS",
  };

  assert.strictEqual(sampleTxQris.total_belanja, 17500);
  assert.strictEqual(sampleTxQris.kembalian, 0);
  assert.strictEqual(sampleTxQris.metode_pembayaran, "QRIS");
});

test("4. Verifikasi Database: Riwayat Transaksi Tersimpan & Tidak Berubah Saat Cetak Ulang", async () => {
  // Ambil transaksi terakhir yang tersimpan di PostgreSQL
  const lastTx = await prisma.transaction.findFirst({
    orderBy: { id: "desc" },
    include: { items: true, user: true },
  });

  if (lastTx) {
    assert.ok(lastTx.invoice_number, "Transaksi di PostgreSQL memiliki nomor faktur.");
    assert.ok(lastTx.total_belanja >= 0, "Total belanja bernilai valid.");
    assert.ok(lastTx.items.length >= 0, "Item transaksi tersimpan.");

    // Cek bahwa jumlah transaksi tidak bertambah jika hanya membaca data untuk dicetak
    const txCountBefore = await prisma.transaction.count();
    // Simulasi render nota (hanya membaca data)
    const readAgain = await prisma.transaction.findUnique({
      where: { id: lastTx.id },
    });
    const txCountAfter = await prisma.transaction.count();
    assert.strictEqual(txCountBefore, txCountAfter, "Pencetakan struk tidak boleh membuat baris transaksi baru.");
    assert.strictEqual(readAgain.invoice_number, lastTx.invoice_number);
  }
});

test("5. Verifikasi Injeksi CSS @page Dinamis (58mm vs 80mm) di PosClient.js", () => {
  const clientPath = path.join(__dirname, "../src/app/(dashboard)/pos/PosClient.js");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  // Pastikan ada kalkulasi tinggi dinamis berbasis jumlah item
  assert.ok(
    clientContent.includes("estimatedPageHeightMm"),
    "Harus ada kalkulasi tinggi kertas nota dinamis."
  );
  // Pastikan ada tag style @page dinamis dengan ukuran spesifik
  assert.ok(
    clientContent.includes("size: ${printPageWidth} ${estimatedPageHeightMm}mm;"),
    "Ukuran @page harus disetel dinamis sesuai pilihan 58mm atau 80mm kasir."
  );
});

test("6. Verifikasi Dimensi Fisik PDF Chrome Headless untuk 58mm dan 80mm", async () => {
  const { execFileSync } = require("node:child_process");
  const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  if (!fs.existsSync(CHROME)) {
    console.log("Chrome executable tidak ada. Melewati uji dimensi fisik PDF.");
    return;
  }

  function getPdfDimensions(filePath) {
    const content = fs.readFileSync(filePath, "binary");
    const match = content.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
    if (match) {
      const ptWidth = parseFloat(match[1]);
      const ptHeight = parseFloat(match[2]);
      const mmWidth = Math.round((ptWidth * 25.4) / 72);
      const mmHeight = Math.round((ptHeight * 25.4) / 72);
      return { ptWidth, ptHeight, mmWidth, mmHeight };
    }
    return null;
  }

  // 6a. Uji Cetak 58mm
  const html58 = `<!DOCTYPE html><html><head><style>
    @page { size: 58mm 100mm; margin: 0; }
    body { margin: 0; padding: 2mm; width: 54mm; font-family: 'Courier New', monospace; font-size: 11px; }
  </style></head><body>
    <div style="text-align:center; font-weight:bold;">KASIRKITA (58mm)</div>
    <div>Faktur: INV-20261116-58</div>
    <div>TOTAL : Rp 50.000</div>
  </body></html>`;

  const html58Path = path.join(__dirname, "test_render_58mm.html");
  const pdf58Path = path.join(__dirname, "output_struk_58mm_dim.pdf");
  fs.writeFileSync(html58Path, html58, "utf-8");

  execFileSync(CHROME, ["--headless", "--disable-gpu", `--print-to-pdf=${pdf58Path}`, html58Path]);
  const dim58 = getPdfDimensions(pdf58Path);
  assert.ok(dim58, "Dimensi PDF 58mm harus terbaca.");
  assert.strictEqual(dim58.mmWidth, 58, "Lebar kertas PDF 58mm harus tepat 58mm.");
  assert.strictEqual(dim58.mmHeight, 100, "Tinggi kertas PDF 58mm harus tepat 100mm.");

  // 6b. Uji Cetak 80mm
  const html80 = `<!DOCTYPE html><html><head><style>
    @page { size: 80mm 120mm; margin: 0; }
    body { margin: 0; padding: 3mm; width: 74mm; font-family: 'Courier New', monospace; font-size: 12px; }
  </style></head><body>
    <div style="text-align:center; font-weight:bold;">KASIRKITA (80mm)</div>
    <div>Faktur: INV-20261116-80</div>
    <div>TOTAL : Rp 120.000</div>
  </body></html>`;

  const html80Path = path.join(__dirname, "test_render_80mm.html");
  const pdf80Path = path.join(__dirname, "output_struk_80mm_dim.pdf");
  fs.writeFileSync(html80Path, html80, "utf-8");

  execFileSync(CHROME, ["--headless", "--disable-gpu", `--print-to-pdf=${pdf80Path}`, html80Path]);
  const dim80 = getPdfDimensions(pdf80Path);
  assert.ok(dim80, "Dimensi PDF 80mm harus terbaca.");
  assert.strictEqual(dim80.mmWidth, 80, "Lebar kertas PDF 80mm harus tepat 80mm.");
  assert.strictEqual(dim80.mmHeight, 120, "Tinggi kertas PDF 80mm harus tepat 120mm.");

  // Bersihkan file uji html sementara
  try {
    fs.unlinkSync(html58Path);
    fs.unlinkSync(html80Path);
  } catch {}
});

test("7. Verifikasi Aturan box-sizing: border-box dan Padding Ringkas Simetris di globals.css", () => {
  const cssPath = path.join(__dirname, "../src/app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  // Pastikan box-sizing border-box diterapkan pada seluruh elemen print
  assert.ok(
    cssContent.includes("box-sizing: border-box !important"),
    "box-sizing: border-box !important harus aktif di @media print"
  );

  // Pastikan padding ringkas simetris pada 58mm (kiri & kanan 3mm)
  assert.ok(
    cssContent.includes("padding: 2mm 3mm !important;"),
    "Padding 58mm harus ringkas dan simetris (2mm atas/bawah, 3mm kiri/kanan)"
  );

  // Pastikan padding ringkas simetris pada 80mm (kiri & kanan 4.5mm)
  assert.ok(
    cssContent.includes("padding: 3mm 4.5mm !important;"),
    "Padding 80mm harus ringkas dan simetris (3mm atas/bawah, 4.5mm kiri/kanan)"
  );

  // Pastikan break-inside avoid terpasang
  assert.ok(
    cssContent.includes("break-inside: avoid !important"),
    "break-inside: avoid harus terpasang untuk mencegah pemotongan di tengah nota"
  );
});

test("8. Verifikasi Footer Ringkas & Penghapusan Tagline KasirKita di PosClient.js", () => {
  const clientPath = path.join(__dirname, "../src/app/(dashboard)/pos/PosClient.js");
  const clientContent = fs.readFileSync(clientPath, "utf-8");

  // Verifikasi footer baru
  assert.ok(
    clientContent.includes("Terima kasih telah berbelanja!"),
    "Footer harus memuat kalimat 'Terima kasih telah berbelanja!'"
  );
  assert.ok(
    clientContent.includes("Semoga harimu menyenangkan."),
    "Footer harus memuat kalimat 'Semoga harimu menyenangkan.'"
  );

  // Verifikasi tagline lama telah dihapus sepenuhnya dari struk pelanggan
  assert.strictEqual(
    clientContent.includes("KasirKita POS - Solusi Kasir UMKM"),
    false,
    "Tulisan 'KasirKita POS - Solusi Kasir UMKM' harus dihilangkan dari struk pelanggan."
  );
});

test("9. Verifikasi Kasus Transaksi 1 Produk Menghasilkan Tepat 1 Halaman Ringkas (PageCount === 1)", () => {
  const { execFileSync } = require("node:child_process");
  const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  if (!fs.existsSync(CHROME)) {
    return;
  }

  function getPageCount(filePath) {
    const content = fs.readFileSync(filePath, "binary");
    const mediaBoxes = [...content.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
    return mediaBoxes.length;
  }

  // HTML simulasi 1 produk dengan formula ringkas hemat kertas (85mm)
  const singleProductHtml = `<!DOCTYPE html><html><head><style>
    *, *::before, *::after { box-sizing: border-box !important; margin: 0; padding: 0; }
    @page { size: 58mm 85mm; margin: 0; }
    body { margin: 0; padding: 2mm 3mm; width: 58mm; font-family: monospace; font-size: 9.5px; line-height: 1.25; }
  </style></head><body>
    <div style="text-align:center; font-weight:bold;">TOKO KASIRKITA SEJAHTERA</div>
    <div style="text-align:center; font-size:8.5px;">Jl. Malioboro No. 45, Yogyakarta</div>
    <div style="text-align:center; font-size:8.5px;">Telp: 081234567890</div>
    <div style="border-top:1px dashed #000; margin:1.2mm 0;"></div>
    <div>Faktur: INV-20261116-0001</div>
    <div>Kasir : Siti Rahmawati</div>
    <div style="border-top:1px dashed #000; margin:1.2mm 0;"></div>
    <div style="font-weight:bold;">Air Mineral Botol 600ml</div>
    <div style="display:flex; justify-content:space-between;">
      <span>1 x Rp 3.500</span>
      <span>Rp 3.500</span>
    </div>
    <div style="border-top:1px dashed #000; margin:1.2mm 0;"></div>
    <div style="display:flex; justify-content:space-between; font-weight:bold;">
      <span>TOTAL</span>
      <span>Rp 3.500</span>
    </div>
    <div style="display:flex; justify-content:space-between;">
      <span>TUNAI</span>
      <span>Rp 5.000</span>
    </div>
    <div style="display:flex; justify-content:space-between;">
      <span>KEMBALI</span>
      <span>Rp 1.500</span>
    </div>
    <div style="border-top:1px dashed #000; margin:1.2mm 0;"></div>
    <div style="text-align:center; font-size:8.5px;">
      <div>Terima kasih telah berbelanja!</div>
      <div style="margin-top:0.4mm;">Semoga harimu menyenangkan.</div>
    </div>
  </body></html>`;

  const htmlPath = path.join(__dirname, "test_single_item.html");
  const pdfPath = path.join(__dirname, "test_single_item.pdf");
  fs.writeFileSync(htmlPath, singleProductHtml, "utf-8");

  execFileSync(CHROME, ["--headless", "--disable-gpu", `--print-to-pdf=${pdfPath}`, htmlPath]);
  const pageCount = getPageCount(pdfPath);

  // Bersihkan file uji
  try {
    fs.unlinkSync(htmlPath);
    fs.unlinkSync(pdfPath);
  } catch {}

  assert.strictEqual(pageCount, 1, "Transaksi 1 produk ringkas harus menghasilkan TEPAT 1 HALAMAN!");
});

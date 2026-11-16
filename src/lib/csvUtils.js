/**
 * Utilitas ekspor CSV aman dengan proteksi CSV Formula Injection (DDE),
 * dukungan UTF-8 Byte Order Mark (BOM), dan direktif pemisah Excel (sep=,)
 * untuk kompatibilitas penuh dengan Microsoft Excel pada regional settings Indonesia (id-ID).
 */

/**
 * Mensanitasi satu sel CSV dari serangan CSV / Formula Injection.
 * Jika nilai berupa teks yang diawali dengan =, +, -, @, tab (\t), atau CR (\r),
 * sisipkan tanda kutip tunggal (') di awal karakter.
 *
 * Nilai numerik murni (finite number) dipertahankan sebagai angka langsung (unquoted)
 * agar Microsoft Excel dan aplikasi spreadsheet otomatis mengenali sel sebagai tipe data Angka
 * yang dapat langsung diolah (formula SUM, AVERAGE, dsb) tanpa peringatan teks.
 *
 * @param {any} value
 * @returns {string}
 */
export function sanitizeCsvCell(value) {
  if (value === null || value === undefined) {
    return '""';
  }

  // Jika nilai berupa angka valid (number), kembalikan representasi numerik langsung tanpa quote
  // agar Microsoft Excel mengenalinya sebagai tipe Angka (dapat diolah / dihitung secara matematis)
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  let str = String(value);

  // Deteksi dan tangkal karakter pemicu eksekusi rumus / DDE pada Excel
  // Diuji sebelum dan sesudah trim agar spasi/tab di awal sel tidak meloloskan formula
  if (/^[=+\-@\t\r]/.test(str) || /^[=+\-@\t\r]/.test(str.trim())) {
    str = `'${str}`;
  }

  // Escape tanda kutip ganda dengan menggandakannya (" -> "")
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Mengubah array of rows menjadi string CSV lengkap dengan BOM UTF-8
 * dan Excel Separator Directive (sep=,) pada baris pertama.
 *
 * Direktif `sep=,` memastikan Microsoft Excel dengan regional settings apapun
 * (termasuk Indonesia di mana list separator default adalah titik-koma ';')
 * secara otomatis memecah kolom dengan koma ',' ke kolom A, B, C, dst.
 *
 * @param {Array<Array<any>>} rows
 * @param {boolean} [includeSepDirective=true]
 * @returns {string}
 */
export function generateCsvString(rows, includeSepDirective = true) {
  const BOM = "\uFEFF"; // UTF-8 BOM untuk Microsoft Excel
  const sepDirective = includeSepDirective ? "sep=,\r\n" : "";
  const lines = rows.map((row) =>
    row.map((cell) => sanitizeCsvCell(cell)).join(",")
  );
  return BOM + sepDirective + lines.join("\r\n");
}

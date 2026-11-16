/**
 * Mengubah angka menjadi format mata uang Rupiah (IDR).
 * Contoh: 34000 -> "Rp 34.000"
 * @param {number|string} amount
 * @returns {string}
 */
export function formatRupiah(amount) {
  const num = typeof amount === "number" ? amount : Number(amount) || 0;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Mengubah objek Date atau string ISO menjadi format tanggal Indonesia.
 * Contoh: "16 November 2026, 14:00 WIB"
 * @param {Date|string} date
 * @returns {string}
 */
export function formatTanggal(date) {
  if (!date) return "-";
  const d = new Date(date);
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

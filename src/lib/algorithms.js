/**
 * Algoritma Pecahan Uang Kembalian (Greedy Change-Making Algorithm).
 * Menghitung rincian lembar/koin uang Rupiah yang paling efisien untuk kembalian kasir.
 *
 * @param {number} changeAmount - Jumlah total kembalian uang (Rp)
 * @returns {Array<{ nominal: number, count: number, label: string }>} Daftar pecahan
 */
export function calculateChangeBreakdown(changeAmount) {
  const amount = Math.floor(Number(changeAmount) || 0);
  if (amount <= 0) return [];

  // Pecahan uang Rupiah resmi (kertas & logam) terurut dari terbesar
  const DENOMINATIONS = [
    { nominal: 100000, label: "Rp 100.000 (Kertas)" },
    { nominal: 50000, label: "Rp 50.000 (Kertas)" },
    { nominal: 20000, label: "Rp 20.000 (Kertas)" },
    { nominal: 10000, label: "Rp 10.000 (Kertas)" },
    { nominal: 5000, label: "Rp 5.000 (Kertas)" },
    { nominal: 2000, label: "Rp 2.000 (Kertas)" },
    { nominal: 1000, label: "Rp 1.000 (Kertas/Koin)" },
    { nominal: 500, label: "Rp 500 (Koin)" },
    { nominal: 200, label: "Rp 200 (Koin)" },
    { nominal: 100, label: "Rp 100 (Koin)" },
  ];

  let remaining = amount;
  const breakdown = [];

  for (const denom of DENOMINATIONS) {
    if (remaining >= denom.nominal) {
      const count = Math.floor(remaining / denom.nominal);
      remaining %= denom.nominal;
      breakdown.push({
        nominal: denom.nominal,
        count,
        label: denom.label,
      });
    }
    if (remaining === 0) break;
  }

  return breakdown;
}

/**
 * Menghitung Rata-rata Penjualan Harian (Average Daily Sales / ADS).
 *
 * @param {number} totalQuantitySold - Total kuantitas produk terjual pada periode analisis
 * @param {number} activeDays - Jumlah hari dalam periode pengamatan (minimal 1)
 * @returns {number} Rata-rata penjualan per hari (desimal dibulatkan 2 angka)
 */
export function calculateAverageDailySales(totalQuantitySold, activeDays = 30) {
  const sold = Number(totalQuantitySold) || 0;
  const days = Math.max(1, Number(activeDays) || 1);
  return Number((sold / days).toFixed(2));
}

/**
 * Menghitung Safety Stock berdasarkan persentase buffer atau override produk.
 *
 * Aturan Perhitungan:
 * 1. Override Produk: Jika produk memiliki konfigurasi safety_stock khusus, gunakan nilai tersebut.
 * 2. Riwayat Penjualan Riil (ADS > 0):
 *    Safety Stock = ceil((ADS × Lead Time) × (default_safety_stock_percent / 100)), minimal 1 unit.
 * 3. Fallback Estimasi Awal (ADS = 0 / Belum Ada Penjualan):
 *    Safety Stock = ceil(stok_minimum × (default_safety_stock_percent / 100)), minimal 1 unit.
 *
 * @param {Object} params
 * @param {number} params.averageDailySales - Rata-rata penjualan harian
 * @param {number} params.leadTimeDays - Lead time pengiriman supplier dalam hari
 * @param {number|null} [params.productSafetyStockOverride] - Override khusus pada produk jika ada
 * @param {number} [params.defaultSafetyStockPercent] - Persentase safety stock default toko (default 20%)
 * @param {number} [params.minStockDefault] - Stok minimum produk sebagai acuan batas bawah
 * @returns {number} Nilai kuantitas safety stock (integer)
 */
export function calculateSafetyStock({
  averageDailySales,
  leadTimeDays,
  productSafetyStockOverride = null,
  defaultSafetyStockPercent = 20,
  minStockDefault = 5,
}) {
  // 1. Jika ada override khusus pada produk, gunakan override
  if (
    productSafetyStockOverride !== null &&
    productSafetyStockOverride !== undefined &&
    Number(productSafetyStockOverride) >= 0
  ) {
    return Math.max(0, Math.round(Number(productSafetyStockOverride)));
  }

  // 2. Jika ada riwayat penjualan nyata (ADS > 0)
  if (averageDailySales > 0) {
    const leadTimeDemand = averageDailySales * leadTimeDays;
    const safetyFromPercent = Math.ceil(leadTimeDemand * (defaultSafetyStockPercent / 100));
    return Math.max(1, safetyFromPercent);
  }

  // 3. Fallback Estimasi Awal jika belum ada penjualan:
  // Gunakan persentase buffer terhadap batas stok minimum produk (minimal 1 unit)
  const minStock = Number(minStockDefault) || 5;
  const safetyFromMinStock = Math.ceil(minStock * (defaultSafetyStockPercent / 100));
  return Math.max(1, safetyFromMinStock);
}

/**
 * Menghitung Reorder Point (ROP) dan status rekomendasi restok produk retail.
 *
 * Rumus Utama (Riil):
 * ROP = (Rata-rata Penjualan Harian × Lead Time) + Safety Stock
 *
 * Rumus Fallback (Estimasi Awal Toko/Produk Baru tanpa Riwayat Penjualan):
 * ROP Estimasi Awal = Stok Minimum + Safety Stock
 *
 * @param {Object} params
 * @param {number} params.currentStock - Stok fisik produk saat ini
 * @param {number} params.totalSold - Total penjualan produk dalam rentang hari pengamatan
 * @param {number} [params.periodDays=30] - Rentang hari pengamatan data penjualan riil
 * @param {number|null} [params.productLeadTime] - Override lead time produk (hari)
 * @param {number} [params.defaultLeadTime=3] - Lead time default dari pengaturan toko
 * @param {number|null} [params.productSafetyStock] - Override safety stock produk
 * @param {number} [params.defaultSafetyStockPercent=20] - Persentase safety stock default toko
 * @param {number} [params.stokMinimum=5] - Stok minimum acuan produk
 * @returns {Object} Hasil kalkulasi ROP lengkap beserta urgensi dan rekomendasi order
 */
export function calculateReorderPoint({
  currentStock,
  totalSold = 0,
  periodDays = 30,
  productLeadTime = null,
  defaultLeadTime = 3,
  productSafetyStock = null,
  defaultSafetyStockPercent = 20,
  stokMinimum = 5,
}) {
  const stock = Number(currentStock) || 0;
  const sold = Number(totalSold) || 0;
  const days = Math.max(1, Number(periodDays) || 1);
  const leadTime =
    productLeadTime !== null &&
    productLeadTime !== undefined &&
    Number(productLeadTime) > 0
      ? Number(productLeadTime)
      : Number(defaultLeadTime) || 3;

  const hasSufficientSalesData = sold > 0;
  const ads = calculateAverageDailySales(sold, days);
  const minStock = Number(stokMinimum) || 5;
  const safetyStock = calculateSafetyStock({
    averageDailySales: ads,
    leadTimeDays: leadTime,
    productSafetyStockOverride: productSafetyStock,
    defaultSafetyStockPercent: Number(defaultSafetyStockPercent) || 20,
    minStockDefault: minStock,
  });

  // Kalkulasi ROP
  let rop = 0;
  let calculationType = "RIIL"; // 'RIIL' | 'ESTIMASI_AWAL'
  let formulaLabel = "";
  let formulaDetail = "";

  if (hasSufficientSalesData) {
    calculationType = "RIIL";
    formulaLabel = "ROP Riil";
    rop = Math.ceil(ads * leadTime + safetyStock);
    formulaDetail = `(ADS: ${ads} × LT: ${leadTime} hr) + SS: ${safetyStock}`;
  } else {
    calculationType = "ESTIMASI_AWAL";
    formulaLabel = "ROP Estimasi Awal";
    // Rumus Fallback Eksplisit: Stok Minimum + Safety Stock
    rop = minStock + safetyStock;
    formulaDetail = `Stok Min: ${minStock} + SS: ${safetyStock}`;
  }

  // Penentuan status urgensi restok dan kuantitas order yang disarankan
  let status = "AMAN"; // 'HABIS' | 'PERLU_RESTOK' | 'MENDEKATI_ROP' | 'AMAN'
  let isRestockNeeded = false;
  let recommendedOrderQty = 0;
  let urgencyLevel = 0; // 3: Tinggi (Habis), 2: Sedang (Perlu Restok), 1: Rendah (Mendekati), 0: Aman

  if (stock <= 0) {
    status = "HABIS";
    isRestockNeeded = true;
    urgencyLevel = 3;
    recommendedOrderQty = Math.max(rop * 2, 10);
  } else if (stock <= rop) {
    status = "PERLU_RESTOK";
    isRestockNeeded = true;
    urgencyLevel = 2;
    recommendedOrderQty = Math.max(rop * 2 - stock, 5);
  } else if (stock <= Math.ceil(rop * 1.25)) {
    status = "MENDEKATI_ROP";
    isRestockNeeded = false;
    urgencyLevel = 1;
    recommendedOrderQty = Math.max(rop * 2 - stock, 0);
  } else {
    status = "AMAN";
    isRestockNeeded = false;
    urgencyLevel = 0;
    recommendedOrderQty = 0;
  }

  return {
    currentStock: stock,
    averageDailySales: ads,
    leadTimeDays: leadTime,
    safetyStock,
    rop,
    calculationType,
    formulaLabel,
    formulaDetail,
    hasSufficientSalesData,
    status,
    isRestockNeeded,
    recommendedOrderQty,
    urgencyLevel,
  };
}

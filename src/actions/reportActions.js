"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  getTodayRangeWib,
  getDateRangeWib,
  getLast7DaysWib,
  formatDateWib,
  formatDateOnlyWib,
  formatTimeWib,
} from "@/lib/dateUtils";
import { generateCsvString } from "@/lib/csvUtils";

/**
 * Mengambil ringkasan metrik dashboard bisnis pemilik usaha untuk hari ini dan tren 7 hari terakhir.
 * Khusus Role: PEMILIK
 */
export async function getDashboardMetricsAction() {
  await requireAuth(["PEMILIK"]);

  const { start: todayStart, end: todayEnd } = getTodayRangeWib();

  // 1. Ambil transaksi hari ini (status SELESAI)
  const todayTransactions = await db.transaction.findMany({
    where: {
      status_pembayaran: "SELESAI",
      tanggal_transaksi: {
        gte: todayStart,
        lte: todayEnd,
      },
    },
    include: {
      items: true,
    },
  });

  let omzetHariIni = 0;
  let hppHariIni = 0;
  let diskonHariIni = 0;
  let totalItemHariIni = 0;

  for (const trx of todayTransactions) {
    omzetHariIni += Number(trx.total_belanja);
    diskonHariIni += Number(trx.discount_amount);
    totalItemHariIni += trx.total_item;

    for (const item of trx.items) {
      hppHariIni += Number(item.harga_beli_snapshot) * item.kuantitas;
    }
  }

  const labaKotorHariIni = omzetHariIni - hppHariIni;
  const jumlahTransaksiHariIni = todayTransactions.length;
  const basketSizeHariIni =
    jumlahTransaksiHariIni > 0 ? Math.round(omzetHariIni / jumlahTransaksiHariIni) : 0;

  // 2. Monitoring Stok Menipis & Habis
  const rawProducts = await db.product.findMany({
    where: { status_aktif: true },
    select: {
      id: true,
      nama_produk: true,
      stok: true,
      stok_minimum: true,
    },
  });

  let stokHabisCount = 0;
  let stokMenipisCount = 0;

  for (const p of rawProducts) {
    if (p.stok <= 0) {
      stokHabisCount++;
    } else if (p.stok <= p.stok_minimum) {
      stokMenipisCount++;
    }
  }

  const totalStokKritisCount = stokHabisCount + stokMenipisCount;

  // 3. Tren Omzet & Laba Kotor 7 Hari Terakhir
  const last7Days = getLast7DaysWib();
  const weekStart = last7Days[0].start;
  const weekEnd = last7Days[last7Days.length - 1].end;

  const weekTransactions = await db.transaction.findMany({
    where: {
      status_pembayaran: "SELESAI",
      tanggal_transaksi: {
        gte: weekStart,
        lte: weekEnd,
      },
    },
    include: {
      items: true,
    },
  });

  const chart7Hari = last7Days.map((day) => {
    let dayOmzet = 0;
    let dayHpp = 0;
    let dayTrxCount = 0;

    for (const trx of weekTransactions) {
      const trxDateStr = formatDateOnlyWib(trx.tanggal_transaksi);
      if (trxDateStr === day.dateString) {
        dayOmzet += Number(trx.total_belanja);
        dayTrxCount++;
        for (const itm of trx.items) {
          dayHpp += Number(itm.harga_beli_snapshot) * itm.kuantitas;
        }
      }
    }

    return {
      dateString: day.dateString,
      label: day.label,
      shortLabel: day.shortLabel,
      omzet: Math.round(dayOmzet),
      labaKotor: Math.round(dayOmzet - dayHpp),
      transaksiCount: dayTrxCount,
    };
  });

  // 4. Lima (5) Produk Terlaris via Raw SQL Agregasi
  // Menggunakan alokasi diskon proporsional dan pengelompokan identitas produk stabil (product_id)
  const topProductsRaw = await db.$queryRaw`
    SELECT
      ti.product_id,
      COALESCE(p.barcode, '-') AS barcode,
      COALESCE(p.nama_produk, MAX(ti.nama_produk_snapshot)) AS nama_produk,
      COALESCE(c.nama, 'Umum') AS kategori,
      SUM(ti.kuantitas)::int AS total_kuantitas,
      SUM(
        CASE
          WHEN t.subtotal > 0 THEN ti.subtotal * (t.total_belanja / t.subtotal)
          ELSE ti.subtotal
        END
      )::numeric(12,2) AS total_omzet,
      SUM(ti.harga_beli_snapshot * ti.kuantitas)::numeric(12,2) AS total_hpp,
      SUM(
        CASE
          WHEN t.subtotal > 0 THEN (ti.subtotal * (t.total_belanja / t.subtotal)) - (ti.harga_beli_snapshot * ti.kuantitas)
          ELSE ti.subtotal - (ti.harga_beli_snapshot * ti.kuantitas)
        END
      )::numeric(12,2) AS total_laba_kotor
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    LEFT JOIN products p ON p.id = ti.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE t.status_pembayaran = 'SELESAI'
    GROUP BY ti.product_id, p.barcode, p.nama_produk, c.nama
    ORDER BY total_kuantitas DESC, total_omzet DESC
    LIMIT 5;
  `;

  const top5Products = topProductsRaw.map((row) => ({
    productId: row.product_id,
    namaProduk: row.nama_produk,
    kategori: row.kategori,
    totalQty: Number(row.total_kuantitas),
    totalOmzet: Number(row.total_omzet),
    totalLabaKotor: Number(row.total_laba_kotor),
  }));

  // 5. Lima (5) Transaksi Terbaru
  const recentTransactionsRaw = await db.transaction.findMany({
    where: { status_pembayaran: "SELESAI" },
    take: 5,
    orderBy: { tanggal_transaksi: "desc" },
    include: {
      user: {
        select: { id: true, nama: true },
      },
      items: true,
    },
  });

  const recent5Transactions = recentTransactionsRaw.map((t) => ({
    id: t.id,
    invoiceNumber: t.invoice_number,
    tanggal: formatDateWib(t.tanggal_transaksi),
    waktuJam: formatTimeWib(t.tanggal_transaksi),
    kasirNama: t.user?.nama || "Kasir",
    totalItem: t.total_item,
    totalBelanja: Number(t.total_belanja),
    metodePembayaran: t.metode_pembayaran,
  }));

  return {
    today: {
      omzet: Math.round(omzetHariIni),
      labaKotor: Math.round(labaKotorHariIni),
      jumlahTransaksi: jumlahTransaksiHariIni,
      totalItem: totalItemHariIni,
      diskon: Math.round(diskonHariIni),
      basketSize: basketSizeHariIni,
    },
    inventoryStatus: {
      totalKritis: totalStokKritisCount,
      stokMenipis: stokMenipisCount,
      stokHabis: stokHabisCount,
    },
    chart7Hari,
    top5Products,
    recent5Transactions,
  };
}

/**
 * Mengambil daftar riwayat transaksi dengan filter dan pagination.
 * Dapat diakses oleh PEMILIK dan KASIR (untuk cetak ulang struk nota).
 */
export async function getTransactionsAction({
  page = 1,
  limit = 15,
  search = "",
  dateRange = "ALL",
  startDate = "",
  endDate = "",
  paymentMethod = "ALL",
  cashierId = "ALL",
} = {}) {
  const session = await requireAuth(["PEMILIK", "KASIR"]);
  const isPemilik = session.role === "PEMILIK";

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(5, Math.min(100, Number(limit) || 15));

  const where = {
    status_pembayaran: "SELESAI",
  };

  // Filter pencarian nomor faktur
  if (search && search.trim()) {
    where.invoice_number = {
      contains: search.trim(),
      mode: "insensitive",
    };
  }

  // Filter metode pembayaran
  if (paymentMethod && paymentMethod !== "ALL") {
    where.metode_pembayaran = paymentMethod;
  }

  // Kebijakan Hak Akses:
  // - Pemilik: dapat melihat seluruh riwayat transaksi dari semua kasir.
  // - Kasir: HANYA dapat melihat riwayat transaksi yang diproses oleh kasir bersangkutan.
  if (!isPemilik) {
    where.user_id = session.userId;
  } else if (cashierId && cashierId !== "ALL") {
    where.user_id = Number(cashierId);
  }

  // Filter tanggal (WIB)
  if (dateRange === "TODAY") {
    const { start, end } = getTodayRangeWib();
    where.tanggal_transaksi = { gte: start, lte: end };
  } else if (dateRange === "7DAYS") {
    const last7 = getLast7DaysWib();
    where.tanggal_transaksi = {
      gte: last7[0].start,
      lte: last7[last7.length - 1].end,
    };
  } else if (dateRange === "30DAYS") {
    const { start, end } = getDateRangeWib();
    where.tanggal_transaksi = { gte: start, lte: end };
  } else if (dateRange === "CUSTOM" && startDate && endDate) {
    const { start, end } = getDateRangeWib(startDate, endDate);
    where.tanggal_transaksi = { gte: start, lte: end };
  }

  const [totalCount, transactionsRaw, cashiersList] = await Promise.all([
    db.transaction.count({ where }),
    db.transaction.findMany({
      where,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      orderBy: { tanggal_transaksi: "desc" },
      include: {
        user: {
          select: { id: true, nama: true, username: true },
        },
        items: true,
      },
    }),
    isPemilik
      ? db.user.findMany({
          select: { id: true, nama: true, username: true, role: true },
          orderBy: { nama: "asc" },
        })
      : Promise.resolve([
          {
            id: session.userId,
            nama: session.nama,
            username: session.username,
            role: session.role,
          },
        ]),
  ]);

  const transactions = transactionsRaw.map((t) => {
    let totalHpp = 0;
    for (const item of t.items) {
      totalHpp += Number(item.harga_beli_snapshot) * item.kuantitas;
    }

    return {
      id: t.id,
      invoiceNumber: t.invoice_number,
      tanggalIso: t.tanggal_transaksi.toISOString(),
      tanggalFormat: formatDateWib(t.tanggal_transaksi),
      waktuJam: formatTimeWib(t.tanggal_transaksi),
      kasirNama: t.user?.nama || "Kasir",
      kasirId: t.user_id,
      metodePembayaran: t.metode_pembayaran,
      totalItem: t.total_item,
      subtotal: Number(t.subtotal),
      diskon: Number(t.discount_amount),
      totalBelanja: Number(t.total_belanja),
      nominalBayar: Number(t.nominal_bayar),
      kembalian: Number(t.kembalian),
      catatan: t.catatan || "",
      // Data keuntungan hanya dikirimkan jika pengguna adalah PEMILIK
      hpp: isPemilik ? Math.round(totalHpp) : null,
      labaKotor: isPemilik ? Math.round(Number(t.total_belanja) - totalHpp) : null,
      items: t.items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        namaProduk: i.nama_produk_snapshot,
        hargaBeli: isPemilik ? Number(i.harga_beli_snapshot) : null,
        hargaJual: Number(i.harga_jual_snapshot),
        kuantitas: i.kuantitas,
        subtotal: Number(i.subtotal),
      })),
    };
  });

  return {
    transactions,
    cashiers: cashiersList,
    pagination: {
      totalCount,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(totalCount / safeLimit) || 1,
    },
  };
}

/**
 * Mengambil detail satu transaksi untuk dialog modal dan cetak ulang nota.
 */
export async function getTransactionDetailAction(transactionIdOrInvoice) {
  const session = await requireAuth(["PEMILIK", "KASIR"]);
  const isPemilik = session.role === "PEMILIK";

  const isNumeric = /^\d+$/.test(String(transactionIdOrInvoice));
  const where = isNumeric
    ? { id: Number(transactionIdOrInvoice) }
    : { invoice_number: String(transactionIdOrInvoice) };

  // Kebijakan Hak Akses: Kasir hanya dapat mengakses detail nota transaksinya sendiri
  if (!isPemilik) {
    where.user_id = session.userId;
  }

  const [transaction, storeSettings] = await Promise.all([
    db.transaction.findFirst({
      where,
      include: {
        user: { select: { id: true, nama: true, username: true } },
        items: true,
      },
    }),
    db.storeSetting.findFirst(),
  ]);

  if (!transaction) {
    return {
      success: false,
      error: "Transaksi tidak ditemukan atau Anda tidak memiliki hak akses ke transaksi ini.",
    };
  }

  return {
    success: true,
    transaction: {
      id: transaction.id,
      invoiceNumber: transaction.invoice_number,
      tanggalIso: transaction.tanggal_transaksi.toISOString(),
      tanggalFormat: formatDateWib(transaction.tanggal_transaksi),
      kasirNama: transaction.user?.nama || "Kasir",
      metodePembayaran: transaction.metode_pembayaran,
      totalItem: transaction.total_item,
      subtotal: Number(transaction.subtotal),
      diskon: Number(transaction.discount_amount),
      totalBelanja: Number(transaction.total_belanja),
      nominalBayar: Number(transaction.nominal_bayar),
      kembalian: Number(transaction.kembalian),
      catatan: transaction.catatan || "",
      items: transaction.items.map((i) => ({
        id: i.id,
        namaProduk: i.nama_produk_snapshot,
        hargaJual: Number(i.harga_jual_snapshot),
        kuantitas: i.kuantitas,
        subtotal: Number(i.subtotal),
      })),
    },
    storeSettings: {
      nama_toko: storeSettings?.nama_toko || "KasirKita Retail UMKM",
      alamat: storeSettings?.alamat || "Jl. Margonda Raya No. 123, Depok",
      no_telepon: storeSettings?.no_telepon || "0812-3456-7890",
      pesan_kaki_struk:
        storeSettings?.pesan_kaki_struk || "Terima kasih telah berbelanja!",
    },
  };
}

/**
 * Mengambil agregasi laporan penjualan bisnis lengkap berdasarkan rentang tanggal.
 * Khusus Role: PEMILIK
 */
export async function getSalesReportAction({ startDate, endDate } = {}) {
  await requireAuth(["PEMILIK"]);

  const { start, end, startDateString, endDateString } = getDateRangeWib(startDate, endDate);

  // 1. Ambil seluruh transaksi dalam rentang waktu yang dipilih
  const transactions = await db.transaction.findMany({
    where: {
      status_pembayaran: "SELESAI",
      tanggal_transaksi: {
        gte: start,
        lte: end,
      },
    },
    include: {
      items: true,
      user: { select: { nama: true } },
    },
    orderBy: { tanggal_transaksi: "asc" },
  });

  let totalOmzet = 0;
  let totalHpp = 0;
  let totalDiskon = 0;
  let totalItemTerjual = 0;

  let tunaiCount = 0;
  let tunaiOmzet = 0;
  let qrisCount = 0;
  let qrisOmzet = 0;

  // Map untuk tren harian
  const dailyMap = new Map();

  for (const trx of transactions) {
    const omzetTrx = Number(trx.total_belanja);
    const diskonTrx = Number(trx.discount_amount);
    totalOmzet += omzetTrx;
    totalDiskon += diskonTrx;
    totalItemTerjual += trx.total_item;

    let hppTrx = 0;
    for (const itm of trx.items) {
      hppTrx += Number(itm.harga_beli_snapshot) * itm.kuantitas;
    }
    totalHpp += hppTrx;

    if (trx.metode_pembayaran === "TUNAI") {
      tunaiCount++;
      tunaiOmzet += omzetTrx;
    } else if (trx.metode_pembayaran === "QRIS") {
      qrisCount++;
      qrisOmzet += omzetTrx;
    }

    const dayKey = formatDateOnlyWib(trx.tanggal_transaksi);
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, {
        dateString: dayKey,
        omzet: 0,
        hpp: 0,
        transaksiCount: 0,
        itemCount: 0,
      });
    }

    const currentDay = dailyMap.get(dayKey);
    currentDay.omzet += omzetTrx;
    currentDay.hpp += hppTrx;
    currentDay.transaksiCount++;
    currentDay.itemCount += trx.total_item;
  }

  const labaKotor = totalOmzet - totalHpp;
  const totalTransaksi = transactions.length;
  const basketSize = totalTransaksi > 0 ? Math.round(totalOmzet / totalTransaksi) : 0;
  const marginLabaPersen = totalOmzet > 0 ? Number(((labaKotor / totalOmzet) * 100).toFixed(2)) : 0;

  // Susun tren harian
  const dailyTrends = Array.from(dailyMap.values()).map((d) => ({
    dateString: d.dateString,
    omzet: Math.round(d.omzet),
    hpp: Math.round(d.hpp),
    labaKotor: Math.round(d.omzet - d.hpp),
    transaksiCount: d.transaksiCount,
    itemCount: d.itemCount,
  }));

  // 2. Produk Terlaris dalam periode via Raw SQL Agregasi
  // Menggunakan alokasi diskon proporsional dan pengelompokan identitas produk stabil (product_id)
  const topProductsRaw = await db.$queryRaw`
    SELECT
      ti.product_id,
      COALESCE(p.barcode, '-') AS barcode,
      COALESCE(p.nama_produk, MAX(ti.nama_produk_snapshot)) AS nama_produk,
      COALESCE(c.nama, 'Umum') AS kategori,
      SUM(ti.kuantitas)::int AS total_kuantitas,
      SUM(
        CASE
          WHEN t.subtotal > 0 THEN ti.subtotal * (t.total_belanja / t.subtotal)
          ELSE ti.subtotal
        END
      )::numeric(12,2) AS total_omzet,
      SUM(ti.harga_beli_snapshot * ti.kuantitas)::numeric(12,2) AS total_hpp,
      SUM(
        CASE
          WHEN t.subtotal > 0 THEN (ti.subtotal * (t.total_belanja / t.subtotal)) - (ti.harga_beli_snapshot * ti.kuantitas)
          ELSE ti.subtotal - (ti.harga_beli_snapshot * ti.kuantitas)
        END
      )::numeric(12,2) AS total_laba_kotor
    FROM transaction_items ti
    JOIN transactions t ON t.id = ti.transaction_id
    LEFT JOIN products p ON p.id = ti.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE t.status_pembayaran = 'SELESAI'
      AND t.tanggal_transaksi >= ${start}
      AND t.tanggal_transaksi <= ${end}
    GROUP BY ti.product_id, p.barcode, p.nama_produk, c.nama
    ORDER BY total_kuantitas DESC, total_omzet DESC
    LIMIT 20;
  `;

  const topSellingProducts = topProductsRaw.map((row, idx) => ({
    rank: idx + 1,
    productId: row.product_id,
    barcode: row.barcode || "-",
    namaProduk: row.nama_produk,
    kategori: row.kategori,
    qtyTerjual: Number(row.total_kuantitas),
    totalOmzet: Number(row.total_omzet),
    totalHpp: Number(row.total_hpp),
    totalLabaKotor: Number(row.total_laba_kotor),
  }));

  return {
    period: {
      startDate: startDateString,
      endDate: endDateString,
    },
    summary: {
      omzet: Math.round(totalOmzet),
      hpp: Math.round(totalHpp),
      labaKotor: Math.round(labaKotor),
      marginLabaPersen,
      totalTransaksi,
      totalItemTerjual,
      totalDiskon: Math.round(totalDiskon),
      basketSize,
    },
    paymentMethods: {
      tunai: {
        count: tunaiCount,
        omzet: Math.round(tunaiOmzet),
        percent: totalOmzet > 0 ? Number(((tunaiOmzet / totalOmzet) * 100).toFixed(1)) : 0,
      },
      qris: {
        count: qrisCount,
        omzet: Math.round(qrisOmzet),
        percent: totalOmzet > 0 ? Number(((qrisOmzet / totalOmzet) * 100).toFixed(1)) : 0,
      },
    },
    dailyTrends,
    topSellingProducts,
  };
}

/**
 * Menghasilkan file CSV Laporan Penjualan yang aman (Anti-Formula Injection & UTF-8 BOM).
 * Khusus Role: PEMILIK
 */
export async function exportSalesReportCsvAction({ startDate, endDate } = {}) {
  await requireAuth(["PEMILIK"]);

  const { start, end, startDateString, endDateString } = getDateRangeWib(startDate, endDate);

  const [transactions, storeSettings] = await Promise.all([
    db.transaction.findMany({
      where: {
        status_pembayaran: "SELESAI",
        tanggal_transaksi: {
          gte: start,
          lte: end,
        },
      },
      include: {
        user: { select: { nama: true } },
        items: true,
      },
      orderBy: { tanggal_transaksi: "asc" },
    }),
    db.storeSetting.findFirst(),
  ]);

  let totalOmzet = 0;
  let totalHpp = 0;

  const dataRows = transactions.map((t, idx) => {
    let trxHpp = 0;
    for (const item of t.items) {
      trxHpp += Number(item.harga_beli_snapshot) * item.kuantitas;
    }
    const trxOmzet = Number(t.total_belanja);
    const trxLaba = trxOmzet - trxHpp;

    totalOmzet += trxOmzet;
    totalHpp += trxHpp;

    return [
      idx + 1,
      t.invoice_number,
      formatDateOnlyWib(t.tanggal_transaksi),
      formatTimeWib(t.tanggal_transaksi),
      t.user?.nama || "Kasir",
      t.metode_pembayaran,
      t.total_item,
      Number(t.subtotal),
      Number(t.discount_amount),
      trxOmzet,
      Math.round(trxHpp),
      Math.round(trxLaba),
    ];
  });

  const totalLaba = totalOmzet - totalHpp;

  // Susun struktur dokumen CSV lengkap
  const rows = [
    ["LAPORAN PENJUALAN RETAIL - KASIRKITA"],
    ["Toko", storeSettings?.nama_toko || "KasirKita Retail UMKM"],
    ["Periode Laporan", `${startDateString} s/d ${endDateString} (WIB)`],
    ["Waktu Ekspor", formatDateWib(new Date())],
    ["Total Transaksi", transactions.length],
    ["Total Omzet (Rp)", Math.round(totalOmzet)],
    ["Total HPP (Rp)", Math.round(totalHpp)],
    ["Estimasi Laba Kotor (Rp)", Math.round(totalLaba)],
    [], // Baris kosong pemisah
    [
      "No",
      "No. Faktur",
      "Tanggal (WIB)",
      "Jam (WIB)",
      "Kasir",
      "Metode Pembayaran",
      "Total Item",
      "Subtotal (Rp)",
      "Diskon (Rp)",
      "Total Belanja / Omzet (Rp)",
      "HPP Historis (Rp)",
      "Estimasi Laba Kotor (Rp)",
    ],
    ...dataRows,
  ];

  const csvContent = generateCsvString(rows);
  const filename = `Laporan_Penjualan_KasirKita_${startDateString}_sd_${endDateString}.csv`;

  return {
    success: true,
    filename,
    csvContent,
  };
}

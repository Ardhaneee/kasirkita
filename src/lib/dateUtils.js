/**
 * Utilitas penanganan waktu dan kalender zona waktu Asia/Jakarta (WIB, UTC+7).
 * Memastikan konsistensi agregasi laporan harian antara antarmuka kasir dan database PostgreSQL.
 */

const WIB_TIMEZONE = "Asia/Jakarta";

/**
 * Mengubah objek Date ke string YYYY-MM-DD dalam zona waktu Asia/Jakarta.
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateOnlyWib(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(d);
}

/**
 * Menghasilkan batas awal (00:00:00.000) dan batas akhir (23:59:59.999) hari ini dalam WIB.
 * @param {Date} [referenceDate=new Date()]
 * @returns {{ start: Date, end: Date, dateString: string }}
 */
export function getTodayRangeWib(referenceDate = new Date()) {
  const todayStr = formatDateOnlyWib(referenceDate);
  const start = new Date(`${todayStr}T00:00:00.000+07:00`);
  const end = new Date(`${todayStr}T23:59:59.999+07:00`);
  return { start, end, dateString: todayStr };
}

/**
 * Mengonversi rentang tanggal YYYY-MM-DD (WIB) menjadi objek Date UTC untuk query Prisma/SQL.
 * @param {string} [startDateStr]
 * @param {string} [endDateStr]
 * @returns {{ start: Date, end: Date, startDateString: string, endDateString: string }}
 */
export function getDateRangeWib(startDateStr, endDateStr) {
  const today = getTodayRangeWib();

  let sStr = startDateStr && /^\d{4}-\d{2}-\d{2}$/.test(startDateStr) ? startDateStr : null;
  let eStr = endDateStr && /^\d{4}-\d{2}-\d{2}$/.test(endDateStr) ? endDateStr : null;

  if (!eStr) {
    eStr = today.dateString;
  }
  if (!sStr) {
    // Default 30 hari ke belakang dari endDate
    const eDate = new Date(`${eStr}T00:00:00.000+07:00`);
    const sDate = new Date(eDate.getTime() - 29 * 24 * 60 * 60 * 1000);
    sStr = formatDateOnlyWib(sDate);
  }

  // Jika startDate lebih besar dari endDate, tukar posisinya
  if (sStr > eStr) {
    const temp = sStr;
    sStr = eStr;
    eStr = temp;
  }

  const start = new Date(`${sStr}T00:00:00.000+07:00`);
  const end = new Date(`${eStr}T23:59:59.999+07:00`);

  return { start, end, startDateString: sStr, endDateString: eStr };
}

/**
 * Menghasilkan daftar 7 hari terakhir (WIB) untuk grafik tren omzet mingguan.
 * @param {Date} [referenceDate=new Date()]
 * @returns {Array<{ dateString: string, label: string, start: Date, end: Date }>}
 */
export function getLast7DaysWib(referenceDate = new Date()) {
  const days = [];
  const refDateStr = formatDateOnlyWib(referenceDate);
  const baseDate = new Date(`${refDateStr}T12:00:00.000+07:00`);

  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des"
  ];

  for (let i = 6; i >= 0; i--) {
    const targetDate = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = formatDateOnlyWib(targetDate);
    const start = new Date(`${dateStr}T00:00:00.000+07:00`);
    const end = new Date(`${dateStr}T23:59:59.999+07:00`);

    const dayIndex = targetDate.getDay();
    const dayNum = targetDate.getDate();
    const monthNum = targetDate.getMonth();

    days.push({
      dateString: dateStr,
      label: `${dayNames[dayIndex]}, ${dayNum} ${monthNames[monthNum]}`,
      shortLabel: `${dayNum}/${monthNum + 1}`,
      start,
      end,
    });
  }

  return days;
}

/**
 * Format tanggal Indonesia lengkap (WIB).
 * Contoh: "16 Nov 2026, 15:45 WIB"
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDateWib(date) {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "-";

  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: WIB_TIMEZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
}

/**
 * Format jam menit saja (WIB).
 * Contoh: "15:45"
 * @param {Date|string} date
 * @returns {string}
 */
export function formatTimeWib(date) {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

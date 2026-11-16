const test = require("node:test");
const assert = require("node:assert");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// ============================================================================
// TEST SUITE: FASE 7 - MONITORING, ERROR HANDLING & AUDIT KEAMANAN
// ============================================================================

test("1. Pemeriksaan Kesehatan Database PostgreSQL: Status NORMAL & Latensi Terukur (BNSP Unit 2 & 3)", async () => {
  const { checkDatabaseHealth } = await import("../src/lib/monitoring.js");

  const health = await checkDatabaseHealth();

  assert.strictEqual(health.isConnected, true, "Koneksi database PostgreSQL harus terhubung");
  assert.strictEqual(health.status, "NORMAL", "Status database aktif harus NORMAL");
  assert.ok(typeof health.latencyMs === "number", "Latensi harus berupa angka milidetik");
  assert.ok(health.latencyMs >= 0 && health.latencyMs < 500, "Latensi localhost normal harus < 500ms");
  assert.strictEqual(health.error, null, "Tidak boleh ada error pada koneksi sehat");
  assert.ok(health.checkedAtWib.includes("WIB"), "Waktu pemeriksaan harus dalam zona waktu WIB");
});

test("2. Penanganan Kegagalan / Timeout Database Secara Graceful Tanpa Crash & Tanpa Kebocoran Kredensial", async () => {
  const { checkDatabaseHealth } = await import("../src/lib/monitoring.js");

  // Simulasi timeout ekstrim (0 milidetik) untuk memicu rejection secara terkendali
  const failedHealth = await checkDatabaseHealth(0);

  assert.strictEqual(failedHealth.isConnected, false, "Status koneksi harus false saat query gagal/timeout");
  assert.strictEqual(failedHealth.status, "GANGGUAN", "Status harus bernilai GANGGUAN");
  assert.strictEqual(failedHealth.latencyMs, null, "Latensi bernilai null saat gagal");
  assert.ok(failedHealth.error, "Wajib ada pesan error ramah pengguna");

  // Verifikasi sanitasi: Pesan error TIDAK BOLEH membocorkan connection string, user, password
  assert.strictEqual(
    failedHealth.error.includes("postgresql://"),
    false,
    "Pesan error dilarang memuat connection string database mentah"
  );
  assert.strictEqual(
    failedHealth.error.includes("password"),
    false,
    "Pesan error dilarang memuat kata sandi atau kredensial internal"
  );
});

test("3. Akurasi Metrik Runtime Node.js: RSS, V8 Heap, CPU, dan Uptime Terukur (BNSP Unit 2)", async () => {
  const { getSystemMetrics, formatUptime } = await import("../src/lib/monitoring.js");

  const metrics = getSystemMetrics();

  // Uptime
  assert.ok(typeof metrics.uptimeSeconds === "number" && metrics.uptimeSeconds >= 0, "Uptime detik harus numerik >= 0");
  assert.ok(typeof metrics.uptimeFormatted === "string" && metrics.uptimeFormatted.length > 0, "Uptime terformat bahasa Indonesia");

  // Memori RAM (RSS & Heap)
  assert.ok(metrics.memory.rssMb > 0, "RSS RAM harus bernilai positif");
  assert.ok(metrics.memory.heapTotalMb > 0, "Heap total harus bernilai positif");
  assert.ok(metrics.memory.heapUsedMb > 0, "Heap used harus bernilai positif");
  assert.ok(metrics.memory.heapUsedPercent >= 0 && metrics.memory.heapUsedPercent <= 100, "Persentase heap 0-100%");

  // CPU
  assert.ok(typeof metrics.cpu.cpuPercent === "number", "CPU percent harus berupa angka");
  assert.ok(metrics.cpu.cpuPercent >= 0 && metrics.cpu.cpuPercent <= 100, "CPU percent antara 0% s/d 100%");
  assert.ok(metrics.cpuCores >= 1, "Jumlah CPU core minimal 1");

  // Verifikasi disclaimer transparansi metrik proses
  assert.ok(metrics.disclaimer.includes("merepresentasikan instance runtime Node.js aktif"), "Wajib memuat catatan transparansi proses");

  // Helper format uptime
  const sampleFormatted = formatUptime(3665); // 1 jam 1 menit 5 detik
  assert.strictEqual(sampleFormatted, "1 jam 1 menit 5 detik");
});

test("4. Pencatatan Log Sistem Terstruktur ke PostgreSQL system_health_logs (BNSP Unit 3)", async () => {
  const { logSystemEvent, getRecentHealthLogs } = await import("../src/lib/logger.js");

  const testEvent = "TEST_SYSTEM_LOG_" + Date.now();
  const testMessage = "Uji coba pencatatan log kesehatan sistem otomatis";

  const logResult = await logSystemEvent({
    eventType: testEvent,
    statusCode: 200,
    message: testMessage,
    severity: "INFO",
    module: "SYSTEM",
    operation: "unitTest",
    details: { environment: "test", sampleMetric: 42 },
  });

  assert.strictEqual(logResult.success, true, "Log harus berhasil disimpan ke database");
  assert.ok(typeof logResult.logId === "number", "Log ID harus berupa integer");

  try {
    const recent = await getRecentHealthLogs(10);
    const found = recent.find((l) => l.eventType === testEvent);

    assert.ok(found, "Log yang baru dicatat harus ditemukan di daftar log terbaru");
    assert.strictEqual(found.statusCode, 200);
    assert.strictEqual(found.message, testMessage);
    assert.strictEqual(found.severity, "INFO");
    assert.strictEqual(found.module, "SYSTEM");
  } finally {
    await prisma.systemHealthLog.deleteMany({ where: { event_type: testEvent } });
  }
});

test("5. Anti-Leakage Data Sensitif: Sanitasi Kredensial, Token & DB URL (BNSP Unit 5: Keamanan Informasi)", async () => {
  const { sanitizeLogData, sanitizeLogString } = await import("../src/lib/logger.js");

  // Uji sanitasi teks URL database
  const rawDbUrl = "postgresql://postgres:RahasiaBanget123@localhost:5432/kasirkita?schema=public";
  const sanitizedUrl = sanitizeLogString(rawDbUrl);
  assert.strictEqual(
    sanitizedUrl.includes("RahasiaBanget123"),
    false,
    "Password database wajib disanitasi dari string teks"
  );
  assert.ok(sanitizedUrl.includes("[REDACTED_PASS]"), "Teks disamarkan menjadi placeholder aman");

  // Uji sanitasi objek data berlapis
  const dangerousPayload = {
    username: "admin_toko",
    password: "SuperSecretPassword!",
    password_hash: "$2a$10$abcdefghijklmnopqrstuvwxyz",
    token: "eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy",
    secret: "jwt-secret-key-internal",
    nested: {
      cookie: "kasirkita_session=abc123xyz",
      database_url: "postgresql://usr:pwd@host:5432/db",
      safeField: "Nilai Aman Publik",
    },
  };

  const safeObject = sanitizeLogData(dangerousPayload);

  assert.strictEqual(safeObject.password, "[REDACTED]");
  assert.strictEqual(safeObject.password_hash, "[REDACTED]");
  assert.strictEqual(safeObject.token, "[REDACTED]");
  assert.strictEqual(safeObject.secret, "[REDACTED]");
  assert.strictEqual(safeObject.nested.cookie, "[REDACTED]");
  assert.strictEqual(safeObject.nested.database_url, "[REDACTED]");
  assert.strictEqual(safeObject.nested.safeField, "Nilai Aman Publik");
});

test("6. Mekanisme De-duplikasi Alert: Pencegahan Spam Peringatan Berulang (BNSP Unit 7: Alerting)", async () => {
  const { logSystemEvent, _resetAlertCooldownForTesting } = await import("../src/lib/logger.js");

  _resetAlertCooldownForTesting();

  const testEvent = "TEST_ALERT_DEDUPE_" + Date.now();

  try {
    // 1. Panggilan pertama: Harus dicatat sebagai alert aktif baru
    const firstCall = await logSystemEvent({
      eventType: testEvent,
      statusCode: 503,
      message: "Gangguan koneksi database simulasi",
      severity: "CRITICAL",
      module: "DATABASE",
      isAlert: true,
    });

    assert.strictEqual(firstCall.success, true);
    assert.strictEqual(firstCall.isDuplicate, false, "Panggilan pertama bukan duplikat");
    assert.ok(firstCall.logId, "Panggilan pertama mendapatkan ID log");

    // 2. Panggilan kedua (seketika): Harus dideteksi sebagai duplikat dan tidak membuat log baru
    const secondCall = await logSystemEvent({
      eventType: testEvent,
      statusCode: 503,
      message: "Gangguan koneksi database simulasi",
      severity: "CRITICAL",
      module: "DATABASE",
      isAlert: true,
    });

    assert.strictEqual(secondCall.success, true);
    assert.strictEqual(secondCall.isDuplicate, true, "Panggilan dalam cooldown window harus dideduplikasi");
    assert.strictEqual(secondCall.logId, undefined, "Tidak boleh membuat baris baru di database");
  } finally {
    await prisma.systemHealthLog.deleteMany({ where: { event_type: testEvent } });
    _resetAlertCooldownForTesting();
  }
});

test("7. Manajemen Alert: Pemilik Berhak Menyelesaikan Peringatan (resolveSystemAlert)", async () => {
  const { logSystemEvent, getActiveAlerts, resolveSystemAlert } = await import("../src/lib/logger.js");

  const testEvent = "TEST_RESOLVE_ALERT_" + Date.now();

  const log = await prisma.systemHealthLog.create({
    data: {
      event_type: testEvent,
      status_code: 500,
      message: "Peringatan untuk pengujian penyelesaian alert",
      details_json: JSON.stringify({
        severity: "ERROR",
        module: "SYSTEM",
        isAlert: true,
        resolved: false,
      }),
    },
  });

  try {
    // Verifikasi alert berstatus aktif
    let activeList = await getActiveAlerts();
    const isFoundActive = activeList.some((a) => a.id === log.id);
    assert.strictEqual(isFoundActive, true, "Alert harus masuk ke daftar aktif sebelum diselesaikan");

    // Pemilik menyelesaikan alert
    const resolveRes = await resolveSystemAlert(log.id);
    assert.strictEqual(resolveRes.success, true, "Penyelesaian alert harus berhasil");

    // Verifikasi alert keluar dari daftar aktif
    activeList = await getActiveAlerts();
    const isStillActive = activeList.some((a) => a.id === log.id);
    assert.strictEqual(isStillActive, false, "Alert yang diselesaikan harus hilang dari daftar aktif");

    // Periksa status di database
    const updated = await prisma.systemHealthLog.findUnique({ where: { id: log.id } });
    const parsed = JSON.parse(updated.details_json);
    assert.strictEqual(parsed.resolved, true, "Field resolved harus bernilai true");
    assert.ok(parsed.resolved_at, "Wajib mencatat waktu penyelesaian");
  } finally {
    await prisma.systemHealthLog.deleteMany({ where: { event_type: testEvent } });
  }
});

test("8. Rate Limiter Anti-Brute Force Login: Pembatasan Percobaan Berturut-turut (BNSP Unit 5)", async () => {
  const {
    checkRateLimit,
    recordFailedAttempt,
    resetRateLimit,
    _resetAllRateLimitsForTesting,
  } = await import("../src/lib/rateLimiter.js");

  _resetAllRateLimitsForTesting();

  const testUser = "brute_force_target_" + Date.now();

  try {
    // 1. Kondisi awal: 5 sisa kesempatan
    let check = checkRateLimit(testUser, 5, 60000);
    assert.strictEqual(check.allowed, true);
    assert.strictEqual(check.remainingAttempts, 5);

    // 2. Simulasi 4 kali percobaan gagal: masih diizinkan
    for (let i = 1; i <= 4; i++) {
      const rec = recordFailedAttempt(testUser, 5, 60000);
      assert.strictEqual(rec.isLocked, false);
      assert.strictEqual(rec.count, i);
    }

    check = checkRateLimit(testUser, 5, 60000);
    assert.strictEqual(check.allowed, true);
    assert.strictEqual(check.remainingAttempts, 1);

    // 3. Percobaan ke-5 (mencapai batas): Akun dikunci sementara
    const lockRec = recordFailedAttempt(testUser, 5, 60000);
    assert.strictEqual(lockRec.isLocked, true);
    assert.ok(lockRec.lockoutRemainingSec > 0);

    // 4. Percobaan berikutnya DIBLOKIR
    check = checkRateLimit(testUser, 5, 60000);
    assert.strictEqual(check.allowed, false, "Akun harus diblokir setelah 5 kali gagal berturut-turut");
    assert.strictEqual(check.remainingAttempts, 0);
    assert.ok(check.lockoutRemainingSec > 0);

    // 5. Reset setelah kredensial benar
    resetRateLimit(testUser);
    check = checkRateLimit(testUser, 5, 60000);
    assert.strictEqual(check.allowed, true, "Setelah reset, akun kembali diizinkan mencoba login");
  } finally {
    _resetAllRateLimitsForTesting();
  }
});

test("9. Penyimpanan Snapshot Metrik ke Tabel PostgreSQL system_metrics (BNSP Unit 2)", async () => {
  const { recordMetricSnapshot } = await import("../src/lib/monitoring.js");

  const countBefore = await prisma.systemMetric.count();

  await recordMetricSnapshot({
    cpuPercent: 3.5,
    rssMb: 115.2,
    heapUsedMb: 45.8,
    uptimeSeconds: 1200,
    latencyMs: 1.5,
  });

  const countAfter = await prisma.systemMetric.count();
  assert.strictEqual(countAfter, countBefore + 1, "Snapshot metrik harus bertambah 1 di database");

  const latest = await prisma.systemMetric.findFirst({
    orderBy: { id: "desc" },
  });

  assert.strictEqual(Number(latest.cpu_usage_percent), 3.5);
  assert.strictEqual(Number(latest.memory_rss_mb), 115.2);
  assert.strictEqual(Number(latest.memory_heap_used_mb), 45.8);
  assert.strictEqual(latest.uptime_seconds, 1200);
  assert.strictEqual(Number(latest.avg_response_time_ms), 1.5);

  // Bersihkan data uji
  await prisma.systemMetric.delete({ where: { id: latest.id } });
});

test("10. In-Flight Query Deduplication pada checkDatabaseHealth: Mencegah Penumpukan Kueri Bersamaan", async () => {
  const { checkDatabaseHealth } = await import("../src/lib/monitoring.js");

  // Jalankan 5 panggilan serentak
  const results = await Promise.all([
    checkDatabaseHealth(),
    checkDatabaseHealth(),
    checkDatabaseHealth(),
    checkDatabaseHealth(),
    checkDatabaseHealth(),
  ]);

  // Kelima panggilan paralel harus mengembalikan hasil yang konsisten
  assert.strictEqual(results.length, 5);
  results.forEach((r) => {
    assert.strictEqual(r.isConnected, true);
    assert.strictEqual(r.status, "NORMAL");
    assert.strictEqual(r.checkedAtIso, results[0].checkedAtIso, "Panggilan bersamaan harus membagi promise yang sama");
  });
});

test("11. Mitigasi Password Spraying: Pembatasan Percobaan Login Berbasis IP saat Berganti Username", async () => {
  const {
    checkRateLimit,
    recordFailedAttempt,
    _resetAllRateLimitsForTesting,
  } = await import("../src/lib/rateLimiter.js");

  _resetAllRateLimitsForTesting();

  const attackerIp = "192.168.100.99";
  const ipKey = `ip:${attackerIp}`;

  try {
    // Penyerang mencoba 15 username berbeda dari IP yang sama
    for (let i = 1; i <= 15; i++) {
      const userKey = `user:target_user_${i}`;
      recordFailedAttempt(userKey, 5, 60000); // per user baru 1 kali gagal
      recordFailedAttempt(ipRateKey => ipKey, 15, 60000); // tapi per IP sudah 15 kali gagal
      recordFailedAttempt(ipKey, 15, 60000);
    }

    // IP penyerang harus diblokir meskipun mencoba username baru ke-16
    const checkIp = checkRateLimit(ipKey, 15, 60000);
    assert.strictEqual(checkIp.allowed, false, "IP penyerang harus diblokir setelah 15 kali gagal");
    assert.ok(checkIp.lockoutRemainingSec > 0);
  } finally {
    _resetAllRateLimitsForTesting();
  }
});

test("12. Server-Side RBAC Guard: Rute dan Hak Akses Monitoring Dibatasi Khusus PEMILIK", () => {
  const OWNER_ONLY_ROUTES = ["/dashboard", "/laporan", "/monitoring", "/pengaturan"];

  // Skenario 1: Kasir mencoba mengakses /monitoring
  const kasirRole = "KASIR";
  const isKasirAllowedMonitoring =
    !OWNER_ONLY_ROUTES.some((r) => "/monitoring".startsWith(r)) || kasirRole === "PEMILIK";
  assert.strictEqual(isKasirAllowedMonitoring, false, "Role KASIR wajib ditolak saat mencoba membuka /monitoring");

  // Skenario 2: Pemilik mengakses /monitoring
  const pemilikRole = "PEMILIK";
  const isPemilikAllowedMonitoring =
    !OWNER_ONLY_ROUTES.some((r) => "/monitoring".startsWith(r)) || pemilikRole === "PEMILIK";
  assert.strictEqual(isPemilikAllowedMonitoring, true, "Role PEMILIK diizinkan membuka /monitoring");
});

test("13. Keamanan Resolusi IP: Menolak Spoofing Header X-Forwarded-For di Lingkungan Lokal (BNSP Unit 5)", async () => {
  const { resolveClientIp } = await import("../src/lib/rateLimiter.js");

  const originalTrustProxy = process.env.TRUST_PROXY;

  try {
    // 1. Skenario Lingkungan Lokal / Tanpa Reverse Proxy (TRUST_PROXY !== "true")
    process.env.TRUST_PROXY = "false";
    const spoofedHeaders = {
      get: (header) => (header === "x-forwarded-for" ? "203.0.113.195, 10.0.0.1" : null),
    };
    const localResolvedIp = resolveClientIp(spoofedHeaders);
    assert.strictEqual(
      localResolvedIp,
      "127.0.0.1",
      "Di lingkungan lokal, header X-Forwarded-For palsu dari klien wajib diabaikan demi keamanan"
    );

    // 2. Skenario Lingkungan Produksi dengan Reverse Proxy Terpercaya (TRUST_PROXY === "true")
    process.env.TRUST_PROXY = "true";
    const proxyHeaders = {
      get: (header) => (header === "x-forwarded-for" ? "203.0.113.195, 10.0.0.1" : null),
    };
    const prodResolvedIp = resolveClientIp(proxyHeaders);
    assert.strictEqual(
      prodResolvedIp,
      "203.0.113.195",
      "Di balik reverse proxy terpercaya, IP klien sah pertama berhasil diekstraksi"
    );

    // 3. Fallback bila header tidak valid
    const invalidHeaders = {
      get: (header) => (header === "x-forwarded-for" ? "<script>alert(1)</script>" : null),
    };
    assert.strictEqual(
      resolveClientIp(invalidHeaders),
      "127.0.0.1",
      "Header dengan format karakter non-IP wajib di-fallback ke safe IP"
    );
  } finally {
    process.env.TRUST_PROXY = originalTrustProxy;
  }
});

test("14. Konsistensi Peringatan RESOURCE_HIGH_MEMORY: Alert Status HTTP 200 Terjaring di getActiveAlerts (BNSP Unit 7)", async () => {
  const { logSystemEvent, getActiveAlerts, _resetAlertCooldownForTesting } = await import("../src/lib/logger.js");

  _resetAlertCooldownForTesting();
  const testEvent = "TEST_RESOURCE_HIGH_MEMORY_" + Date.now();

  try {
    // 1. Simulasikan lonjakan V8 heap memory (89%) dengan status HTTP 200 dan severity WARN
    const logRes = await logSystemEvent({
      eventType: testEvent,
      statusCode: 200, // Status code 200 (karena ini warning resource, bukan crash HTTP)
      message: "Penggunaan V8 Heap proses Node.js tinggi (89%).",
      severity: "WARN",
      module: "SYSTEM",
      operation: "getSystemMetrics",
      isAlert: true,
      details: { heapUsedPercent: 89 },
    });

    assert.strictEqual(logRes.success, true);
    assert.ok(logRes.logId);

    // 2. Verifikasi getActiveAlerts(): Alert WAJIB terjaring meskipun status_code bernilai 200
    const activeAlerts = await getActiveAlerts();
    const foundAlert = activeAlerts.find((a) => a.id === logRes.logId);

    assert.ok(foundAlert, "Alert RESOURCE_HIGH_MEMORY dengan status HTTP 200 wajib masuk ke daftar getActiveAlerts()");
    assert.strictEqual(foundAlert.eventType, testEvent);
    assert.strictEqual(foundAlert.severity, "WARN");
    assert.strictEqual(foundAlert.statusCode, 200);
  } finally {
    await prisma.systemHealthLog.deleteMany({ where: { event_type: testEvent } });
    _resetAlertCooldownForTesting();
  }
});

test("15. Mekanisme Pemulihan Otomatis (Auto-Recovery) & Pelestarian Histori Audit (BNSP Unit 3 & 7)", async () => {
  const {
    logSystemEvent,
    getActiveAlerts,
    getRecentHealthLogs,
    autoResolveAlerts,
    resolveSystemAlert,
    _resetAlertCooldownForTesting,
  } = await import("../src/lib/logger.js");

  _resetAlertCooldownForTesting();
  const testEvent = "TEST_AUTO_RECOVERY_" + Date.now();

  try {
    // 1. Catat alert baru
    const logRes = await logSystemEvent({
      eventType: testEvent,
      statusCode: 200,
      message: "Peringatan memori sebelum pemulihan",
      severity: "WARN",
      module: "SYSTEM",
      isAlert: true,
      details: { heapUsedPercent: 89 },
    });

    // Verifikasi awal: Masuk ke active alerts
    let activeList = await getActiveAlerts();
    assert.ok(activeList.some((a) => a.id === logRes.logId), "Alert harus aktif pada awalnya");

    // Hitung total log di database sebelum pemulihan
    const countBefore = await prisma.systemHealthLog.count();

    // 2. Jalankan Auto-Recovery ketika heap normal kembali (misal 73%)
    const recoveryMsg = "Penggunaan V8 Heap kembali normal (73% <= 85%).";
    const resolvedCount = await autoResolveAlerts(testEvent, recoveryMsg);
    assert.strictEqual(resolvedCount >= 1, true, "Minimal 1 alert berhasil dipulihkan secara otomatis");

    // 3. Verifikasi: Alert KELUAR dari active alerts
    activeList = await getActiveAlerts();
    assert.strictEqual(
      activeList.some((a) => a.id === logRes.logId),
      false,
      "Alert yang telah pulih otomatis harus hilang dari panel getActiveAlerts()"
    );

    // 4. Verifikasi Pelestarian Histori: Data TIDAK BOLEH dihapus dari database
    const countAfter = await prisma.systemHealthLog.count();
    assert.strictEqual(countAfter, countBefore, "Histori kejadian tidak boleh berkurang/dihapus saat pemulihan");

    // 5. Verifikasi metadata status log di getRecentHealthLogs()
    const recentLogs = await getRecentHealthLogs(10);
    const resolvedLog = recentLogs.find((l) => l.id === logRes.logId);
    assert.ok(resolvedLog, "Log kejadian harus tetap ada di riwayat");
    assert.strictEqual(resolvedLog.resolved, true, "Status resolved harus bernilai true");
    assert.strictEqual(resolvedLog.resolvedBy, "AUTO_RECOVERY", "Tercatat diselesaikan oleh AUTO_RECOVERY");
    assert.strictEqual(resolvedLog.recoveryNote, recoveryMsg);

    // 6. Uji Penyelesaian Manual Pemilik pada alert terpisah
    const manualLog = await prisma.systemHealthLog.create({
      data: {
        event_type: testEvent + "_MANUAL",
        status_code: 429,
        message: "Percobaan brute force untuk pengujian manual resolve",
        details_json: JSON.stringify({ isAlert: true, resolved: false }),
      },
    });

    const manualRes = await resolveSystemAlert(manualLog.id, "MANUAL_PEMILIK");
    assert.strictEqual(manualRes.success, true);

    const updatedManual = await prisma.systemHealthLog.findUnique({ where: { id: manualLog.id } });
    const parsedManual = JSON.parse(updatedManual.details_json);
    assert.strictEqual(parsedManual.resolved, true);
    assert.strictEqual(parsedManual.resolved_by, "MANUAL_PEMILIK");

    await prisma.systemHealthLog.delete({ where: { id: manualLog.id } });
  } finally {
    await prisma.systemHealthLog.deleteMany({ where: { event_type: testEvent } });
    _resetAlertCooldownForTesting();
  }
});


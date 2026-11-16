import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getTransactionsAction } from "@/actions/reportActions";
import TransaksiClient from "./TransaksiClient";

export const dynamic = "force-dynamic";

export default async function TransaksiPage() {
  const session = await requireAuth(["PEMILIK", "KASIR"]);
  const isPemilik = session.role === "PEMILIK";

  const [initialData, storeSettingsRaw] = await Promise.all([
    getTransactionsAction({ page: 1, limit: 15, dateRange: "ALL" }),
    db.storeSetting.findFirst(),
  ]);

  // Serialisasi data pengaturan toko ke plain object (konversi Prisma Decimal & Date)
  // guna mencegah peringatan serialisasi RSC Next.js / React 19
  const storeSettings = storeSettingsRaw
    ? {
        id: storeSettingsRaw.id,
        nama_toko: storeSettingsRaw.nama_toko,
        alamat: storeSettingsRaw.alamat,
        no_telepon: storeSettingsRaw.no_telepon,
        pesan_kaki_struk: storeSettingsRaw.pesan_kaki_struk,
        qris_image_path: storeSettingsRaw.qris_image_path || "/images/qris-toko.png",
        default_lead_time_days: storeSettingsRaw.default_lead_time_days,
        default_safety_stock_percent: Number(storeSettingsRaw.default_safety_stock_percent || 20),
      }
    : null;

  return (
    <TransaksiClient
      initialData={initialData}
      cashiers={initialData.cashiers}
      isPemilik={isPemilik}
      storeSettings={storeSettings}
    />
  );
}

import { requireAuth } from "@/lib/auth";
import { getSalesReportAction } from "@/actions/reportActions";
import LaporanClient from "./LaporanClient";

export const dynamic = "force-dynamic";

export default async function LaporanPage() {
  // Guard Otentikasi & Otorisasi Sisi Server Khusus Role PEMILIK
  await requireAuth(["PEMILIK"]);

  const initialReportData = await getSalesReportAction();

  return <LaporanClient initialData={initialReportData} />;
}

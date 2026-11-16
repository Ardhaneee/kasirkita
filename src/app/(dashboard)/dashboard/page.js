import { requireAuth } from "@/lib/auth";
import { getDashboardMetricsAction } from "@/actions/reportActions";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Guard Otentikasi & Otorisasi Sisi Server Khusus Role PEMILIK
  await requireAuth(["PEMILIK"]);

  const metricsData = await getDashboardMetricsAction();

  return <DashboardClient initialData={metricsData} />;
}

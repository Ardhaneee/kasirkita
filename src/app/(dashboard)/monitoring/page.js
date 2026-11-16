import { requireAuth } from "@/lib/auth";
import { getMonitoringDataAction } from "@/actions/monitoringActions";
import MonitoringClient from "./MonitoringClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Monitoring Sistem & Kesehatan Layanan — KasirKita",
  description: "Pemantauan runtime proses Node.js, status konektivitas PostgreSQL, dan log kesehatan aplikasi.",
};

export default async function MonitoringPage() {
  // Guard Otentikasi & Otorisasi Sisi Server Khusus Role PEMILIK (RBAC Enforced)
  await requireAuth(["PEMILIK"]);

  const initialData = await getMonitoringDataAction();

  return <MonitoringClient initialData={initialData} />;
}

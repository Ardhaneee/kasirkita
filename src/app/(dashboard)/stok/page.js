import { getSession } from "@/lib/auth";
import {
  getInventoryData,
  getStockMovementsAction,
  getRestockRecommendationsAction,
} from "@/actions/inventoryActions";
import StokClient from "./StokClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Manajemen Inventori & Stok — KasirKita",
  description: "Manajemen stok barang, mutasi inventori, dan rekomendasi Reorder Point (ROP) retail UMKM.",
};

export default async function StokPage() {
  const session = await getSession();
  const isPemilik = session?.role === "PEMILIK";

  const [inventoryData, initialMovements, initialRecommendations] = await Promise.all([
    getInventoryData(),
    isPemilik ? getStockMovementsAction({ limit: 100 }) : Promise.resolve([]),
    isPemilik ? getRestockRecommendationsAction() : Promise.resolve([]),
  ]);

  return (
    <StokClient
      initialProducts={inventoryData.products}
      categories={inventoryData.categories}
      storeSettings={inventoryData.storeSettings}
      initialMovements={initialMovements}
      initialRecommendations={initialRecommendations}
      currentUser={session}
    />
  );
}

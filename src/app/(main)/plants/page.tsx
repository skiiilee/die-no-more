import type { Metadata } from "next";
import { listActivePots } from "@/runtime/plant-queries";
import { PlantList } from "@/ui/plants/PlantList";

export const metadata: Metadata = { title: "내 식물" };

/** S11 내 식물 */
export default async function Page() {
  const pots = await listActivePots();
  return <PlantList pots={pots} />;
}

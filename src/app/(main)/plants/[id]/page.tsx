import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPot } from "@/runtime/plant-queries";
import { PlantDetail } from "@/ui/plants/PlantDetail";

export const metadata: Metadata = { title: "내 화분" };

/** S06 내 화분 상세. Someone else's pot is not found (RLS). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pot = await getPot(id);
  if (!pot) notFound();
  return <PlantDetail pot={pot} />;
}

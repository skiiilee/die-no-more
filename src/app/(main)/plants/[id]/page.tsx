import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPot } from "@/runtime/plant-queries";
import { PlantDetail } from "@/ui/plants/PlantDetail";

export const metadata: Metadata = { title: "내 화분" };

/**
 * S06 내 화분 상세. Someone else's pot is not found (RLS). `photo=failed`
 * comes from S05 when the pot was saved but its photo was not.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { photo }] = await Promise.all([params, searchParams]);
  const pot = await getPot(id);
  if (!pot) notFound();
  return <PlantDetail pot={pot} photoFailed={photo === "failed"} />;
}

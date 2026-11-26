import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listHealthChecks } from "@/runtime/health-queries";
import { getPot } from "@/runtime/plant-queries";
import { getPotCare } from "@/runtime/species-queries";
import { PlantDetail } from "@/ui/plants/PlantDetail";

export const metadata: Metadata = { title: "내 화분" };

// The species care may still ask the providers (25 s) and the care AI (25 s), streamed in like S04-B.
export const maxDuration = 60;

/**
 * S06 내 화분 상세. Someone else's pot is not found (RLS). `photo=failed`
 * comes from S05 when the pot was saved but its photo was not. The species
 * care is not awaited here: the pot shows at once and the care streams in.
 * `health=saved` comes from S07-S after a health check was saved.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { photo, health }] = await Promise.all([params, searchParams]);
  const [pot, healthChecks] = await Promise.all([getPot(id), listHealthChecks(id)]);
  if (!pot) notFound();
  const care = pot.species ? getPotCare(pot.species.id) : null;
  return (
    <PlantDetail
      pot={pot}
      care={care}
      photoFailed={photo === "failed"}
      healthChecks={healthChecks}
      healthSaved={health === "saved"}
    />
  );
}

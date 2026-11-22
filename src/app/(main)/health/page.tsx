import type { Metadata } from "next";
import { healthAiRecipient } from "@/runtime/health-api";
import { listPotChoices } from "@/runtime/plant-queries";
import { HealthCheckScreen } from "@/ui/health/HealthCheckScreen";

export const metadata: Metadata = { title: "건강 점검" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * S07-A 건강 점검 → S07-B 결과. `pot` comes from S06 [건강 점검] and preselects
 * that pot; any other value is ignored. The pot list is the user's own (RLS).
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [{ pot }, pots] = await Promise.all([searchParams, listPotChoices()]);
  const wanted = Array.isArray(pot) ? pot[0] : pot;
  const initialPotId = pots.some((choice) => choice.id === wanted) ? (wanted as string) : null;
  return <HealthCheckScreen pots={pots} initialPotId={initialPotId} aiRecipient={healthAiRecipient()} />;
}

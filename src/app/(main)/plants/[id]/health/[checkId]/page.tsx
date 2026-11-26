import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHealthCheck } from "@/runtime/health-queries";
import { getPot } from "@/runtime/plant-queries";
import { potDisplayName } from "@/types/plant";
import { SavedHealthView } from "@/ui/health/SavedHealthView";

export const metadata: Metadata = { title: "건강 점검 기록" };

/** A saved health check of one own pot (S06 건강 점검 기록). Someone else's is not found (RLS). */
export default async function Page({ params }: { params: Promise<{ id: string; checkId: string }> }) {
  const { id, checkId } = await params;
  const [pot, check] = await Promise.all([getPot(id), getHealthCheck(id, checkId)]);
  if (!pot || !check) notFound();
  return <SavedHealthView potId={pot.id} potName={potDisplayName(pot)} check={check} />;
}

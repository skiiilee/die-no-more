import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCareRecord } from "@/runtime/care-queries";
import { getPot } from "@/runtime/plant-queries";
import { potDisplayName } from "@/types/plant";
import { SavedCareView } from "@/ui/care/SavedCareView";

export const metadata: Metadata = { title: "관리 기록" };

/** A saved S08 record of one own pot (S06 최근 관리 기록). Someone else's is not found (RLS). */
export default async function Page({ params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params;
  const [pot, record] = await Promise.all([getPot(id), getCareRecord(id, recordId)]);
  if (!pot || !record) notFound();
  return <SavedCareView potId={pot.id} potName={potDisplayName(pot)} record={record} />;
}

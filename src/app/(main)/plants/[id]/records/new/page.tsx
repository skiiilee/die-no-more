import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPotChoices } from "@/runtime/plant-queries";
import { CareRecordScreen } from "@/ui/care/CareRecordScreen";
import { FreshWhenShownAgain } from "@/ui/shell/FreshWhenShownAgain";

export const metadata: Metadata = { title: "관리 기록" };

/**
 * S08 관리 기록, opened from S06 [관리 기록] with that pot chosen. The pot
 * list is the user's own (RLS); someone else's pot is not found. Coming back
 * after a save starts an empty form, not the saved one.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, pots] = await Promise.all([params, listPotChoices()]);
  if (!pots.some((pot) => pot.id === id)) notFound();
  return (
    <FreshWhenShownAgain>
      <CareRecordScreen pots={pots} initialPotId={id} />
    </FreshWhenShownAgain>
  );
}

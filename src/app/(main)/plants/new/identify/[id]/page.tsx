import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getIdentificationForPage } from "@/runtime/identification-queries";
import { IdentificationResults } from "@/ui/plants/IdentificationResults";

export const metadata: Metadata = { title: "사진으로 찾은 식물" };

/** S04-A for one photo identification session. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getIdentificationForPage(id);
  if (!view) notFound();
  return <IdentificationResults view={view} />;
}

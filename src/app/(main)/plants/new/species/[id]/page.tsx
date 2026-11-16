import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpeciesPreview } from "@/runtime/species-queries";
import { SpeciesPreviewScreen } from "@/ui/plants/SpeciesPreviewScreen";

export const metadata: Metadata = { title: "식물 정보 확인" };

type SearchParams = Record<string, string | string[] | undefined>;

/** S04-B 식물 정보 확인. `q` is the S04-A query, for [뒤로]. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, { q }] = await Promise.all([params, searchParams]);
  const preview = await getSpeciesPreview(id);
  if (!preview) notFound();
  const query = (Array.isArray(q) ? q[0] : q)?.trim() || null;
  return <SpeciesPreviewScreen preview={preview} query={query} />;
}

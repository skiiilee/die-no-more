import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpeciesPreview } from "@/runtime/species-queries";
import { SpeciesPreviewScreen } from "@/ui/plants/SpeciesPreviewScreen";

export const metadata: Metadata = { title: "식물 정보 확인" };

type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || null;

/**
 * S04-B 식물 정보 확인. [뒤로] returns to the S04-A it came from: `q` for a
 * name search, `session` for a photo identification.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, { q, session }] = await Promise.all([params, searchParams]);
  const preview = await getSpeciesPreview(id);
  if (!preview) notFound();
  const sessionId = first(session);
  const query = first(q);
  const back =
    sessionId && UUID.test(sessionId)
      ? ({ kind: "identify", sessionId } as const)
      : query
        ? ({ kind: "search", query } as const)
        : null;
  return <SpeciesPreviewScreen preview={preview} back={back} />;
}

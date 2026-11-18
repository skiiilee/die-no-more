import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAiCareFill, getSpeciesPreview } from "@/runtime/species-queries";
import { SpeciesPreviewScreen } from "@/ui/plants/SpeciesPreviewScreen";

export const metadata: Metadata = { title: "식물 정보 확인" };

// Provider lookups (25 s, ADR-0003 D7) plus the streamed care AI step (25 s, ADR-0005 D6).
export const maxDuration = 60;

type SearchParams = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || null;

/**
 * S04-B 식물 정보 확인. [뒤로] returns to the S04-A it came from: `q` for a
 * name search, `session` for a photo identification. When the care AI has
 * fields to fill, the screen shows first and those fields stream in.
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
  const aiCare = preview.aiFill.length > 0 ? getAiCareFill(preview) : null;
  return <SpeciesPreviewScreen preview={preview} back={back} aiCare={aiCare} />;
}

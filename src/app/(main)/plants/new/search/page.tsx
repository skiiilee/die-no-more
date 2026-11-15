import type { Metadata } from "next";
import { searchSpeciesForPage } from "@/runtime/species-queries";
import { SpeciesResults } from "@/ui/plants/SpeciesResults";

export const metadata: Metadata = { title: "검색 결과" };

type SearchParams = Record<string, string | string[] | undefined>;

/** S04-A 검색 결과. The query arrives from the S03 search box in the URL. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { q } = await searchParams;
  const outcome = await searchSpeciesForPage(Array.isArray(q) ? q[0] : q);
  return <SpeciesResults outcome={outcome} />;
}

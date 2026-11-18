import { vi } from "vitest";
import type { SpeciesStore } from "@/repo/species-repo";
import { isStorableImageUrl, type AiCare, type FoundSpecies, type PerenualCare, type ProviderSpecies, type SpeciesRecord } from "@/types/species";
import type { CareAiAdapter, CareAiAnswer } from "@/service/adapters/care-ai";
import type { DetailsAnswer, PerenualAdapter, SearchAnswer } from "@/service/adapters/perenual";
import type { KoreanNameAnswer, TrefleAdapter, TrefleSearchAnswer } from "@/service/adapters/trefle";

/** Test doubles shared by species-search and species-preview tests. */

export function record(overrides: Partial<SpeciesRecord> = {}): SpeciesRecord {
  return {
    id: "10000000-0000-0000-0000-000000000001",
    scientificNameKey: "ficus elastica",
    scientificName: "Ficus elastica",
    commonNameEn: "Rubber plant",
    koreanName: null,
    family: "Moraceae",
    perenualId: null,
    trefleId: null,
    imageUrl: null,
    imageCredit: null,
    koreanNameCheckedAt: null,
    careStatus: null,
    careAiCheckedAt: null,
    ...overrides,
  };
}

export function providerSpecies(provider: "perenual" | "trefle", id: number, scientificName: string): ProviderSpecies {
  return { provider, providerId: id, scientificName, commonNameEn: null, family: null, imageUrl: null };
}

export function fakePerenual(
  search: SearchAnswer = { kind: "ok", species: [] },
  details: DetailsAnswer = { kind: "not_found" },
) {
  return { search: vi.fn(async () => search), details: vi.fn(async () => details) } satisfies PerenualAdapter;
}

export function fakeTrefle(
  search: TrefleSearchAnswer = { kind: "ok", species: [] },
  koreanName: KoreanNameAnswer = { kind: "ok", koreanName: null },
) {
  return { search: vi.fn(async () => search), koreanName: vi.fn(async () => koreanName) } satisfies TrefleAdapter;
}

export function fakeCareAi(answer: CareAiAnswer = { kind: "unavailable" }) {
  return { describe: vi.fn(async () => answer) } satisfies CareAiAdapter;
}

export function fakeSpeciesStore(
  options: {
    local?: SpeciesRecord[];
    record?: SpeciesRecord | null;
    care?: PerenualCare | null;
    aiCare?: { care: AiCare; model: string } | null;
    /** Whether this request wins the care AI claim (default true). */
    aiClaim?: boolean;
    dropKeys?: string[];
  } = {},
) {
  let counter = 0;
  /** Everything saveFound returned, for getRecords. */
  const saved: SpeciesRecord[] = [];
  const store = {
    searchLocal: vi.fn(async () => options.local ?? []),
    saveFound: vi.fn(async (found: FoundSpecies[]) => {
      const kept = found.filter((item) => !options.dropKeys?.includes(item.scientificNameKey));
      const records = kept.map((item) =>
        record({
          id: `20000000-0000-0000-0000-00000000000${counter++}`,
          scientificNameKey: item.scientificNameKey,
          scientificName: item.scientificName,
          // Like the real store: expiring photo links are not stored, nor their credit.
          imageUrl: isStorableImageUrl(item.imageUrl) ? item.imageUrl : null,
          imageCredit: isStorableImageUrl(item.imageUrl) ? item.imageCredit : null,
        }),
      );
      saved.push(...records);
      return { records, dropped: found.length - kept.length };
    }),
    getRecord: vi.fn(async () => (options.record === undefined ? record() : options.record)),
    getRecords: vi.fn(async (ids: string[]) => saved.filter((item) => ids.includes(item.id))),
    getCare: vi.fn(async () => options.care ?? null),
    saveKoreanName: vi.fn(async () => {}),
    saveCare: vi.fn(async () => {}),
    getAiCare: vi.fn(async () => options.aiCare ?? null),
    saveAiCare: vi.fn(async () => {}),
    claimAiCare: vi.fn(async () => options.aiClaim ?? true),
    releaseAiCare: vi.fn(async () => {}),
  } satisfies SpeciesStore;
  return store;
}

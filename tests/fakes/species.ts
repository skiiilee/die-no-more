import { vi } from "vitest";
import type { SpeciesStore } from "@/repo/species-repo";
import { isStorableImageUrl, type FoundSpecies, type PerenualCare, type ProviderSpecies, type SpeciesRecord } from "@/types/species";
import type { DetailsAnswer, PerenualAdapter, SearchAnswer } from "@/service/adapters/perenual";
import type { KoreanNameAnswer, TrefleAdapter, TrefleSearchAnswer } from "@/service/adapters/trefle";
import type { Meter } from "@/service/provider-usage";
import type { Metered } from "@/service/species-search";

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
    koreanNameCheckedAt: null,
    careStatus: null,
    ...overrides,
  };
}

export function providerSpecies(provider: "perenual" | "trefle", id: number, scientificName: string): ProviderSpecies {
  return { provider, providerId: id, scientificName, commonNameEn: null, family: null, imageUrl: null };
}

export function fakeMeter(allowed = true): Meter & { record: ReturnType<typeof vi.fn> } {
  return { canCall: vi.fn(async () => allowed), record: vi.fn(async () => {}) };
}

export function fakePerenual(
  search: SearchAnswer = { kind: "ok", species: [], calls: 1 },
  details: DetailsAnswer = { kind: "not_found", calls: 1 },
  meterAllows = true,
) {
  const adapter = { search: vi.fn(async () => search), details: vi.fn(async () => details) };
  return { adapter, meter: fakeMeter(meterAllows) } satisfies Metered<PerenualAdapter>;
}

export function fakeTrefle(
  search: TrefleSearchAnswer = { kind: "ok", species: [], calls: 1 },
  koreanName: KoreanNameAnswer = { kind: "ok", koreanName: null, calls: 1 },
  meterAllows = true,
) {
  const adapter = { search: vi.fn(async () => search), koreanName: vi.fn(async () => koreanName) };
  return { adapter, meter: fakeMeter(meterAllows) } satisfies Metered<TrefleAdapter>;
}

export function fakeSpeciesStore(options: { local?: SpeciesRecord[]; record?: SpeciesRecord | null; care?: PerenualCare | null } = {}) {
  let counter = 0;
  const store = {
    searchLocal: vi.fn(async () => options.local ?? []),
    saveFound: vi.fn(async (found: FoundSpecies[]) =>
      found.map((item) =>
        record({
          id: `20000000-0000-0000-0000-00000000000${counter++}`,
          scientificNameKey: item.scientificNameKey,
          scientificName: item.scientificName,
          // Like the real store: expiring photo links are not stored.
          imageUrl: isStorableImageUrl(item.imageUrl) ? item.imageUrl : null,
        }),
      ),
    ),
    getRecord: vi.fn(async () => (options.record === undefined ? record() : options.record)),
    getCare: vi.fn(async () => options.care ?? null),
    saveKoreanName: vi.fn(async () => {}),
    saveCare: vi.fn(async () => {}),
  } satisfies SpeciesStore;
  return store;
}

import { describe, expect, it, vi } from "vitest";
import { notConnectedTranslator, type Translator } from "./adapters/translator";
import { isKorean, mergeFound, scientificNameKey, searchSpecies, type SearchDeps } from "./species-search";
import { fakePerenual, fakeSpeciesStore, fakeTrefle, providerSpecies, record } from "../../tests/fakes/species";

function deps(overrides: Partial<SearchDeps> = {}): SearchDeps {
  return {
    species: fakeSpeciesStore(),
    perenual: fakePerenual(),
    trefle: fakeTrefle(),
    translator: notConnectedTranslator,
    ...overrides,
  };
}

const SIGNED = "https://s3.example.test/p.jpg?X-Amz-Expires=86400&X-Amz-Signature=abc";
const STABLE = "https://bs.plantnet.org/image/o/abc";

const FOUND_P = { kind: "ok" as const, species: [providerSpecies("perenual", 2961, "Ficus elastica")], calls: 1 };
const FOUND_T = {
  kind: "ok" as const,
  species: [providerSpecies("trefle", 7, "ficus  elastica"), providerSpecies("trefle", 8, "Ficus lyrata")],
  calls: 1,
};

describe("scientificNameKey and merging (ADR-0003 D10)", () => {
  it("normalizes case and spaces", () => {
    expect(scientificNameKey("  Ficus   Elastica ")).toBe("ficus elastica");
  });

  it("merges only exact keys, keeping both provider IDs", () => {
    const merged = mergeFound([...FOUND_P.species, ...FOUND_T.species]);
    expect(merged).toEqual([
      expect.objectContaining({ scientificNameKey: "ficus elastica", perenualId: 2961, trefleId: 7, source: "perenual" }),
      expect.objectContaining({ scientificNameKey: "ficus lyrata", perenualId: null, trefleId: 8, source: "trefle" }),
    ]);
  });

  it("prefers a photo that can be stored over an expiring one", () => {
    const merged = mergeFound([
      { ...providerSpecies("perenual", 1, "Ficus elastica"), imageUrl: SIGNED },
      { ...providerSpecies("trefle", 2, "Ficus elastica"), imageUrl: STABLE },
    ]);
    expect(merged[0].imageUrl).toBe(STABLE);
  });

  it("detects Korean queries", () => {
    expect(isKorean("몬스테라")).toBe(true);
    expect(isKorean("Monstera")).toBe(false);
  });
});

describe("searchSpecies", () => {
  it("rejects a blank or too long query without calling anything", async () => {
    const d = deps();
    expect(await searchSpecies(d, "   ")).toMatchObject({ kind: "invalid" });
    expect(await searchSpecies(d, "가".repeat(61))).toMatchObject({ kind: "invalid" });
    expect(d.species.searchLocal).not.toHaveBeenCalled();
  });

  it("answers from the plant DB first, without provider calls", async () => {
    const d = deps({ species: fakeSpeciesStore({ local: [record({ koreanName: "고무나무" })] }) });
    const outcome = await searchSpecies(d, "고무");
    expect(outcome).toMatchObject({
      kind: "results",
      from: "plant_db",
      candidates: [{ koreanName: "고무나무", scientificName: "Ficus elastica" }],
    });
    expect(d.perenual?.adapter.search).not.toHaveBeenCalled();
    expect(d.trefle?.adapter.search).not.toHaveBeenCalled();
  });

  it("asks both providers with the query as typed and stores the merged results", async () => {
    const d = deps({ perenual: fakePerenual(FOUND_P), trefle: fakeTrefle(FOUND_T) });
    const outcome = await searchSpecies(d, " ficus ");
    expect(d.perenual?.adapter.search).toHaveBeenCalledWith("ficus");
    expect(d.species.saveFound).toHaveBeenCalledWith([
      expect.objectContaining({ scientificNameKey: "ficus elastica" }),
      expect.objectContaining({ scientificNameKey: "ficus lyrata" }),
    ]);
    expect(outcome).toMatchObject({ kind: "results", from: "providers", partial: false });
    expect(outcome.kind === "results" && outcome.candidates.map((c) => c.scientificName)).toEqual([
      "Ficus elastica",
      "Ficus lyrata",
    ]);
    expect(d.perenual?.meter.record).toHaveBeenCalledWith("search", FOUND_P);
  });

  it("shows an expiring Perenual photo on this page without storing it (live check 2026-11-15)", async () => {
    const species = fakeSpeciesStore();
    const perenual = fakePerenual({
      kind: "ok",
      species: [{ ...providerSpecies("perenual", 2961, "Ficus elastica"), imageUrl: SIGNED }],
      calls: 1,
    });
    const outcome = await searchSpecies(deps({ species, perenual }), "ficus");
    expect(outcome.kind === "results" && outcome.candidates[0].imageUrl).toBe(SIGNED);
    const stored = await species.saveFound.mock.results[0].value;
    expect(stored[0].imageUrl).toBeNull();
  });

  it("shows what one provider found and marks the list partial when the other failed", async () => {
    const d = deps({ perenual: fakePerenual({ kind: "unavailable", calls: 2 }), trefle: fakeTrefle(FOUND_T) });
    expect(await searchSpecies(d, "ficus")).toMatchObject({ kind: "results", partial: true });
  });

  it("skips a provider whose daily cap is reached", async () => {
    const d = deps({ perenual: fakePerenual(FOUND_P, undefined, false), trefle: fakeTrefle(FOUND_T) });
    await searchSpecies(d, "ficus");
    expect(d.perenual?.adapter.search).not.toHaveBeenCalled();
  });

  it("shows the fixed quota message when every provider's limit is used up", async () => {
    const d = deps({ perenual: fakePerenual(undefined, undefined, false), trefle: fakeTrefle(undefined, undefined, false) });
    expect(await searchSpecies(d, "ficus")).toEqual({ kind: "quota", query: "ficus" });
  });

  it("reports unavailable when no provider could be reached or none is configured", async () => {
    expect(await searchSpecies(deps({ perenual: null, trefle: null }), "ficus")).toMatchObject({ kind: "unavailable" });
    const failing = deps({
      perenual: fakePerenual({ kind: "quota", calls: 1 }),
      trefle: fakeTrefle({ kind: "unavailable", calls: 1 }),
    });
    expect(await searchSpecies(failing, "ficus")).toMatchObject({ kind: "unavailable" });
  });

  it("reports an empty result and stores nothing", async () => {
    const d = deps();
    expect(await searchSpecies(d, "zzzz")).toEqual({ kind: "empty", query: "zzzz", korean: false, partial: false });
    expect(d.species.saveFound).not.toHaveBeenCalled();
  });

  it("tries the English retry for a Korean query; while translation is not connected it goes to manual entry (ADR-0004 D3)", async () => {
    const translator: Translator = { koreanToEnglish: vi.fn(notConnectedTranslator.koreanToEnglish) };
    const d = deps({ translator });
    expect(await searchSpecies(d, "몬스테라")).toMatchObject({ kind: "empty", korean: true });
    expect(translator.koreanToEnglish).toHaveBeenCalledWith("몬스테라");
    expect(d.perenual?.adapter.search).toHaveBeenCalledTimes(1);
  });

  it("searches again with the English name once translation answers", async () => {
    const translator: Translator = { koreanToEnglish: vi.fn(async () => ({ kind: "ok" as const, text: "ficus" })) };
    const perenual = fakePerenual();
    perenual.adapter.search.mockResolvedValueOnce({ kind: "ok", species: [], calls: 1 }).mockResolvedValueOnce(FOUND_P);
    const outcome = await searchSpecies(deps({ translator, perenual }), "고무나무");
    expect(perenual.adapter.search).toHaveBeenLastCalledWith("ficus");
    expect(outcome).toMatchObject({ kind: "results", query: "고무나무" });
  });
});

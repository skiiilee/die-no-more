import { describe, expect, it } from "vitest";
import type { AiCare, PerenualCare } from "@/types/species";
import { careFacts } from "./care-labels";
import { loadSpeciesPreview, type PreviewDeps } from "./species-preview";
import { fakeCareAi, fakePerenual, fakeSpeciesStore, fakeTrefle, providerSpecies, record } from "../../tests/fakes/species";

const AI: AiCare = {
  careLevel: "쉬움",
  light: "밝은 간접광",
  watering: "흙이 마르면 충분히",
  wateringBenchmark: { min: 5, max: 7 },
  temperature: "18~25도",
  soil: "배수가 좋은 흙",
  fertilizer: "봄·여름 한 달에 한 번",
  description: "실내에서 잘 자라는 식물입니다.",
};

const ID = "10000000-0000-0000-0000-000000000001";
const CARE: PerenualCare = {
  watering: "Average",
  wateringBenchmark: { min: 7, max: 10 },
  sunlight: ["part shade", "full shade"],
  careLevel: "Medium",
  description: "The Indian Rubberplant is a houseplant.",
};

function deps(overrides: Partial<PreviewDeps> = {}): PreviewDeps {
  return { species: fakeSpeciesStore(), perenual: fakePerenual(), trefle: fakeTrefle(), careAi: null, ...overrides };
}

describe("loadSpeciesPreview", () => {
  it("returns null for a species that is not in the plant DB", async () => {
    expect(await loadSpeciesPreview(deps({ species: fakeSpeciesStore({ record: null }) }), ID)).toBeNull();
  });

  it("makes no provider call for a species already checked", async () => {
    const species = fakeSpeciesStore({
      record: record({ koreanName: "고무나무", careStatus: "available", perenualId: 2961 }),
      care: CARE,
    });
    const d = deps({ species });
    const preview = await loadSpeciesPreview(d, ID);
    expect(preview).toMatchObject({ koreanName: "고무나무", care: { status: "available", facts: careFacts(CARE) } });
    expect(d.perenual?.search).not.toHaveBeenCalled();
    expect(d.perenual?.details).not.toHaveBeenCalled();
    expect(d.trefle?.koreanName).not.toHaveBeenCalled();
  });

  it("looks up the Korean name on Trefle once and stores it with its source (ADR-0004 D2)", async () => {
    const species = fakeSpeciesStore({ record: record({ trefleId: 7, careStatus: "not_found" }) });
    const trefle = fakeTrefle(undefined, { kind: "ok", koreanName: "인도고무나무" });
    const preview = await loadSpeciesPreview(deps({ species, trefle }), ID);
    expect(trefle.koreanName).toHaveBeenCalledWith(7);
    expect(species.saveKoreanName).toHaveBeenCalledWith(ID, { koreanName: "인도고무나무", trefleId: 7 });
    expect(preview?.koreanName).toBe("인도고무나무");
  });

  it("finds the Trefle id by exact scientific name, and records 'checked' when Trefle has none", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    const trefle = fakeTrefle({ kind: "ok", species: [providerSpecies("trefle", 9, "Ficus elastica var. decora")] });
    await loadSpeciesPreview(deps({ species, trefle }), ID);
    expect(trefle.koreanName).not.toHaveBeenCalled();
    expect(species.saveKoreanName).toHaveBeenCalledWith(ID, { koreanName: null, trefleId: null });
  });

  it("leaves the Korean name unchecked when Trefle cannot be asked, to try again later", async () => {
    const species = fakeSpeciesStore({ record: record({ trefleId: 7, careStatus: "not_found" }) });
    const trefle = fakeTrefle(undefined, { kind: "unavailable" });
    expect((await loadSpeciesPreview(deps({ species, trefle }), ID))?.koreanName).toBeNull();
    expect(species.saveKoreanName).not.toHaveBeenCalled();
  });

  it("does not request care details above the free range and shows 'no care data' (approved 2026-11-12)", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: 5257, koreanNameCheckedAt: "x" }) });
    const perenual = fakePerenual(undefined, { kind: "outside_free_range" });
    const preview = await loadSpeciesPreview(deps({ species, perenual }), ID);
    expect(species.saveCare).toHaveBeenCalledWith(ID, { status: "outside_free_range", perenualId: 5257, care: null });
    expect(preview?.care).toEqual({ status: "none" });
  });

  it("stores Perenual care for a species in the free range and shows Korean labels", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: 2961, koreanNameCheckedAt: "x" }), care: CARE });
    const perenual = fakePerenual(undefined, { kind: "ok", care: CARE });
    const preview = await loadSpeciesPreview(deps({ species, perenual }), ID);
    expect(species.saveCare).toHaveBeenCalledWith(ID, { status: "available", perenualId: 2961, care: CARE });
    expect(preview?.care).toEqual({
      status: "available",
      facts: {
        careLevel: "보통",
        light: "반그늘, 그늘",
        watering: "보통",
        wateringInterval: "7~10일",
        temperature: null,
        soil: null,
        fertilizer: null,
        description: "The Indian Rubberplant is a houseplant.",
        aiFields: [],
        aiModel: null,
      },
    });
  });

  it("finds the Perenual id by exact scientific name when the species came from Trefle", async () => {
    const species = fakeSpeciesStore({ record: record({ koreanNameCheckedAt: "x" }) });
    const perenual = fakePerenual(
      { kind: "ok", species: [providerSpecies("perenual", 2961, "Ficus elastica")] },
      { kind: "ok", care: CARE },
    );
    await loadSpeciesPreview(deps({ species, perenual }), ID);
    expect(perenual.search).toHaveBeenCalledWith("Ficus elastica");
    expect(perenual.details).toHaveBeenCalledWith(2961);
  });

  it("records 'not found' when Perenual has no exact match", async () => {
    const species = fakeSpeciesStore({ record: record({ koreanNameCheckedAt: "x" }) });
    const perenual = fakePerenual({ kind: "ok", species: [providerSpecies("perenual", 1, "Ficus")] });
    expect((await loadSpeciesPreview(deps({ species, perenual }), ID))?.care).toEqual({ status: "none" });
    expect(species.saveCare).toHaveBeenCalledWith(ID, { status: "not_found", perenualId: null, care: null });
  });

  it("shows 'pending' and stores nothing when Perenual is over quota or down", async () => {
    for (const details of [
      { kind: "quota" as const },
      { kind: "unavailable" as const },
    ]) {
      const species = fakeSpeciesStore({ record: record({ perenualId: 100, koreanNameCheckedAt: "x" }) });
      const preview = await loadSpeciesPreview(deps({ species, perenual: fakePerenual(undefined, details) }), ID);
      expect(preview?.care).toEqual({ status: "pending" });
      expect(species.saveCare).not.toHaveBeenCalled();
    }
  });

  it("does not store 'checked' after a broken answer, so the next visit asks again (PR #15 review, item 2)", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: 100, trefleId: 7 }) });
    const perenual = fakePerenual(undefined, { kind: "unavailable" });
    const trefle = fakeTrefle(undefined, { kind: "unavailable" });
    const d = deps({ species, perenual, trefle });
    expect((await loadSpeciesPreview(d, ID))?.care).toEqual({ status: "pending" });
    await loadSpeciesPreview(d, ID);
    expect(perenual.details).toHaveBeenCalledTimes(2);
    expect(trefle.koreanName).toHaveBeenCalledTimes(2);
    expect(species.saveCare).not.toHaveBeenCalled();
    expect(species.saveKoreanName).not.toHaveBeenCalled();
  });

  it("does not record 'not found' when the id search itself failed", async () => {
    const species = fakeSpeciesStore({ record: record({}) });
    const d = deps({ species, perenual: fakePerenual({ kind: "unavailable" }), trefle: fakeTrefle({ kind: "unavailable" }) });
    expect((await loadSpeciesPreview(d, ID))?.care).toEqual({ status: "pending" });
    expect(species.saveCare).not.toHaveBeenCalled();
    expect(species.saveKoreanName).not.toHaveBeenCalled();
  });
});

describe("careFacts", () => {
  it("shows a value missing from the label tables as Perenual gave it (owner decision 2026-11-15)", () => {
    expect(
      careFacts({
        watering: "Sometimes",
        wateringBenchmark: { min: 5, max: 5 },
        sunlight: ["part shade", "moonlight"],
        careLevel: "Extreme",
        description: null,
      }),
    ).toEqual({
      careLevel: "Extreme",
      light: "반그늘, moonlight",
      watering: "Sometimes",
      wateringInterval: "5일",
      temperature: null,
      soil: null,
      fertilizer: null,
      description: null,
      aiFields: [],
      aiModel: null,
    });
  });

  it("is '정보 없음' (null) only when Perenual gave nothing", () => {
    expect(
      careFacts({ watering: null, wateringBenchmark: null, sunlight: [], careLevel: " ", description: null }),
    ).toEqual({
      careLevel: null,
      light: null,
      watering: null,
      wateringInterval: null,
      temperature: null,
      soil: null,
      fertilizer: null,
      description: null,
      aiFields: [],
      aiModel: null,
    });
  });
});

describe("care AI fill (ADR-0005)", () => {
  it("asks the AI once for a species Perenual left empty, stores its values, and marks the fields it filled", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "outside_free_range" }) });
    const careAi = fakeCareAi({ kind: "ok", care: AI, model: "model-x" });
    const preview = await loadSpeciesPreview(deps({ species, careAi }), ID);
    expect(careAi.describe).toHaveBeenCalledWith("Ficus elastica");
    expect(species.saveAiCare).toHaveBeenCalledWith(ID, { care: AI, model: "model-x" });
    expect(preview?.care).toEqual({
      status: "available",
      facts: {
        careLevel: "쉬움",
        light: "밝은 간접광",
        watering: "흙이 마르면 충분히",
        wateringInterval: "5~7일",
        temperature: "18~25도",
        soil: "배수가 좋은 흙",
        fertilizer: "봄·여름 한 달에 한 번",
        description: "실내에서 잘 자라는 식물입니다.",
        aiFields: ["careLevel", "light", "watering", "wateringInterval", "temperature", "soil", "fertilizer", "description"],
        aiModel: "model-x",
      },
    });
  });

  it("keeps the Perenual value and marks only the fields the AI filled", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: 2961, koreanNameCheckedAt: "x" }), care: CARE });
    const perenual = fakePerenual(undefined, { kind: "ok", care: CARE });
    const careAi = fakeCareAi({ kind: "ok", care: AI, model: "model-x" });
    const preview = await loadSpeciesPreview(deps({ species, perenual, careAi }), ID);
    expect(preview?.care).toMatchObject({
      status: "available",
      facts: { careLevel: "보통", watering: "보통", description: "The Indian Rubberplant is a houseplant.", temperature: "18~25도" },
    });
    if (preview?.care.status !== "available") throw new Error("expected facts");
    expect(preview.care.facts.aiFields).not.toContain("careLevel");
    expect(preview.care.facts.aiFields).not.toContain("description");
    expect(preview.care.facts.aiFields).toContain("temperature");
  });

  it("makes no AI call once the species is checked, and reads the stored values", async () => {
    const species = fakeSpeciesStore({
      record: record({ careStatus: "not_found", careAiCheckedAt: "2026-11-18T00:00:00Z" }),
      aiCare: { care: AI, model: "model-x" },
    });
    const careAi = fakeCareAi();
    const preview = await loadSpeciesPreview(deps({ species, careAi }), ID);
    expect(careAi.describe).not.toHaveBeenCalled();
    expect(species.saveAiCare).not.toHaveBeenCalled();
    expect(preview?.care).toMatchObject({ status: "available", facts: { light: "밝은 간접광" } });
  });

  it("does not mark the species as asked when the AI is unavailable, so the next visit asks again", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "outside_free_range" }) });
    const careAi = fakeCareAi({ kind: "unavailable" });
    const d = deps({ species, careAi });
    expect((await loadSpeciesPreview(d, ID))?.care).toEqual({ status: "none" });
    expect(species.saveAiCare).not.toHaveBeenCalled();
    await loadSpeciesPreview(d, ID);
    expect(careAi.describe).toHaveBeenCalledTimes(2);
  });

  it("marks an empty AI answer as asked, stores nothing, and shows no care data", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    const preview = await loadSpeciesPreview(deps({ species, careAi: fakeCareAi({ kind: "none", model: "model-x" }) }), ID);
    expect(species.saveAiCare).toHaveBeenCalledWith(ID, { care: null, model: null });
    expect(preview?.care).toEqual({ status: "none" });
  });

  it("makes no AI call when the care AI is not configured", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    const preview = await loadSpeciesPreview(deps({ species, careAi: null }), ID);
    expect(species.saveAiCare).not.toHaveBeenCalled();
    expect(preview?.care).toEqual({ status: "none" });
  });
});

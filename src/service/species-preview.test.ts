import { describe, expect, it } from "vitest";
import type { PerenualCare } from "@/types/species";
import { careFacts } from "./care-labels";
import { loadSpeciesPreview, type PreviewDeps } from "./species-preview";
import { fakePerenual, fakeSpeciesStore, fakeTrefle, providerSpecies, record } from "../../tests/fakes/species";

const ID = "10000000-0000-0000-0000-000000000001";
const CARE: PerenualCare = {
  watering: "Average",
  wateringBenchmark: { min: 7, max: 10 },
  sunlight: ["part shade", "full shade"],
  careLevel: "Medium",
};

function deps(overrides: Partial<PreviewDeps> = {}): PreviewDeps {
  return { species: fakeSpeciesStore(), perenual: fakePerenual(), trefle: fakeTrefle(), ...overrides };
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
    expect(d.perenual?.adapter.search).not.toHaveBeenCalled();
    expect(d.perenual?.adapter.details).not.toHaveBeenCalled();
    expect(d.trefle?.adapter.koreanName).not.toHaveBeenCalled();
  });

  it("looks up the Korean name on Trefle once and stores it with its source (ADR-0004 D2)", async () => {
    const species = fakeSpeciesStore({ record: record({ trefleId: 7, careStatus: "not_found" }) });
    const trefle = fakeTrefle(undefined, { kind: "ok", koreanName: "인도고무나무", calls: 1 });
    const preview = await loadSpeciesPreview(deps({ species, trefle }), ID);
    expect(trefle.adapter.koreanName).toHaveBeenCalledWith(7);
    expect(species.saveKoreanName).toHaveBeenCalledWith(ID, { koreanName: "인도고무나무", trefleId: 7 });
    expect(preview?.koreanName).toBe("인도고무나무");
  });

  it("finds the Trefle id by exact scientific name, and records 'checked' when Trefle has none", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    const trefle = fakeTrefle({ kind: "ok", species: [providerSpecies("trefle", 9, "Ficus elastica var. decora")], calls: 1 });
    await loadSpeciesPreview(deps({ species, trefle }), ID);
    expect(trefle.adapter.koreanName).not.toHaveBeenCalled();
    expect(species.saveKoreanName).toHaveBeenCalledWith(ID, { koreanName: null, trefleId: null });
  });

  it("leaves the Korean name unchecked when Trefle cannot be asked, to try again later", async () => {
    const species = fakeSpeciesStore({ record: record({ trefleId: 7, careStatus: "not_found" }) });
    const trefle = fakeTrefle(undefined, { kind: "unavailable", calls: 1 });
    expect((await loadSpeciesPreview(deps({ species, trefle }), ID))?.koreanName).toBeNull();
    expect(species.saveKoreanName).not.toHaveBeenCalled();
  });

  it("does not request care details above the free range and shows 'no care data' (approved 2026-11-12)", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: 5257, koreanNameCheckedAt: "x" }) });
    const perenual = fakePerenual(undefined, { kind: "outside_free_range", calls: 0 });
    const preview = await loadSpeciesPreview(deps({ species, perenual }), ID);
    expect(perenual.meter.canCall).not.toHaveBeenCalled();
    expect(species.saveCare).toHaveBeenCalledWith(ID, { status: "outside_free_range", perenualId: 5257, care: null });
    expect(preview?.care).toEqual({ status: "none" });
  });

  it("stores Perenual care for a species in the free range and shows Korean labels", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: 2961, koreanNameCheckedAt: "x" }), care: CARE });
    const perenual = fakePerenual(undefined, { kind: "ok", care: CARE, calls: 1 });
    const preview = await loadSpeciesPreview(deps({ species, perenual }), ID);
    expect(species.saveCare).toHaveBeenCalledWith(ID, { status: "available", perenualId: 2961, care: CARE });
    expect(preview?.care).toEqual({
      status: "available",
      facts: { careLevel: "보통", light: "반그늘, 그늘", watering: "보통", wateringInterval: "7~10일" },
    });
  });

  it("finds the Perenual id by exact scientific name when the species came from Trefle", async () => {
    const species = fakeSpeciesStore({ record: record({ koreanNameCheckedAt: "x" }) });
    const perenual = fakePerenual(
      { kind: "ok", species: [providerSpecies("perenual", 2961, "Ficus elastica")], calls: 1 },
      { kind: "ok", care: CARE, calls: 1 },
    );
    await loadSpeciesPreview(deps({ species, perenual }), ID);
    expect(perenual.adapter.search).toHaveBeenCalledWith("Ficus elastica");
    expect(perenual.adapter.details).toHaveBeenCalledWith(2961);
  });

  it("records 'not found' when Perenual has no exact match", async () => {
    const species = fakeSpeciesStore({ record: record({ koreanNameCheckedAt: "x" }) });
    const perenual = fakePerenual({ kind: "ok", species: [providerSpecies("perenual", 1, "Ficus")], calls: 1 });
    expect((await loadSpeciesPreview(deps({ species, perenual }), ID))?.care).toEqual({ status: "none" });
    expect(species.saveCare).toHaveBeenCalledWith(ID, { status: "not_found", perenualId: null, care: null });
  });

  it("shows 'pending' and stores nothing when Perenual is over quota or down", async () => {
    for (const details of [
      { kind: "quota" as const, calls: 1 },
      { kind: "unavailable" as const, calls: 2 },
    ]) {
      const species = fakeSpeciesStore({ record: record({ perenualId: 100, koreanNameCheckedAt: "x" }) });
      const preview = await loadSpeciesPreview(deps({ species, perenual: fakePerenual(undefined, details) }), ID);
      expect(preview?.care).toEqual({ status: "pending" });
      expect(species.saveCare).not.toHaveBeenCalled();
    }
  });

  it("shows 'pending' without calling when today's cap is reached", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: 100, koreanNameCheckedAt: "x" }) });
    const perenual = fakePerenual(undefined, undefined, false);
    expect((await loadSpeciesPreview(deps({ species, perenual }), ID))?.care).toEqual({ status: "pending" });
    expect(perenual.adapter.details).not.toHaveBeenCalled();
  });
});

describe("careFacts", () => {
  it("labels only known codes; anything else is '정보 없음' (null)", () => {
    expect(
      careFacts({ watering: "Sometimes", wateringBenchmark: { min: 5, max: 5 }, sunlight: ["moonlight"], careLevel: "Extreme" }),
    ).toEqual({ careLevel: null, light: null, watering: null, wateringInterval: "5일" });
  });
});

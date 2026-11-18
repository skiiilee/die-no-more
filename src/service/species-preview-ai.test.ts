import { describe, expect, it, vi } from "vitest";
import { AI_CARE_FIELDS, type AiCare, type PerenualCare } from "@/types/species";
import { loadSpeciesPreview, type PreviewDeps } from "./species-preview";
import { fakeCareAi, fakePerenual, fakeSpeciesStore, fakeTrefle, record, CLAIM_ID } from "../../tests/fakes/species";

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

describe("care AI fill (ADR-0005)", () => {
  it("asks the AI once for a species Perenual left empty, stores its values, and marks the fields it filled", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "outside_free_range" }) });
    const careAi = fakeCareAi({ kind: "ok", care: AI, model: "model-x" });
    const preview = await loadSpeciesPreview(deps({ species, careAi }), ID);
    expect(careAi.describe).toHaveBeenCalledWith("Ficus elastica", AI_CARE_FIELDS);
    expect(species.saveAiCare).toHaveBeenCalledWith(ID, CLAIM_ID, { care: AI, model: "model-x" });
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
    expect(species.saveAiCare).toHaveBeenCalledWith(ID, CLAIM_ID, { care: null, model: null });
    expect(preview?.care).toEqual({ status: "none" });
  });

  it("makes no AI call when the care AI is not configured", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    const preview = await loadSpeciesPreview(deps({ species, careAi: null }), ID);
    expect(species.saveAiCare).not.toHaveBeenCalled();
    expect(preview?.care).toEqual({ status: "none" });
  });
});

describe("care AI: single-flight, missing fields, Perenual outage (review P1, P2)", () => {
  it("shows AI values when Perenual could not be asked (status unknown), instead of pending", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: null }) });
    const careAi = fakeCareAi({ kind: "ok", care: AI, model: "model-x" });
    const preview = await loadSpeciesPreview(deps({ species, careAi, perenual: null }), ID);
    expect(preview?.care).toMatchObject({ status: "available", facts: { light: "밝은 간접광" } });
    expect(careAi.describe).toHaveBeenCalled();
  });

  it("stays pending when Perenual could not be asked and the AI has nothing", async () => {
    const species = fakeSpeciesStore({ record: record({ perenualId: null }) });
    const preview = await loadSpeciesPreview(deps({ species, careAi: fakeCareAi({ kind: "none", model: "model-x" }), perenual: null }), ID);
    expect(preview?.care).toEqual({ status: "pending" });
  });

  it("asks only for the fields Perenual left empty", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "available" }), care: CARE });
    const careAi = fakeCareAi({ kind: "none", model: "model-x" });
    await loadSpeciesPreview(deps({ species, careAi }), ID);
    expect(careAi.describe).toHaveBeenCalledWith("Ficus elastica", ["temperature", "soil", "fertilizer"]);
  });

  it("makes no AI call when the claim belongs to another request, stores nothing, and shows pending", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }), aiClaim: false });
    const careAi = fakeCareAi({ kind: "ok", care: AI, model: "model-x" });
    const preview = await loadSpeciesPreview(deps({ species, careAi }), ID);
    expect(careAi.describe).not.toHaveBeenCalled();
    expect(species.saveAiCare).not.toHaveBeenCalled();
    expect(preview?.care).toEqual({ status: "pending" });
  });

  it("still shows Perenual values when another request holds the claim", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "available" }), care: CARE, aiClaim: false });
    const preview = await loadSpeciesPreview(deps({ species, careAi: fakeCareAi() }), ID);
    expect(preview?.care).toMatchObject({ status: "available", facts: { watering: "보통", aiFields: [] } });
  });

  it("asks the AI once when two requests open the same species at the same time", async () => {
    // Shared store whose claim behaves like claim_care_ai(): the first caller wins.
    let claimed = false;
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    species.claimAiCare.mockImplementation(async () => {
      await Promise.resolve();
      if (claimed) return null;
      claimed = true;
      return CLAIM_ID;
    });
    let finish: () => void = () => {};
    const careAi = {
      describe: vi.fn(
        () =>
          new Promise<{ kind: "ok"; care: AiCare; model: string }>((resolve) => {
            finish = () => resolve({ kind: "ok", care: AI, model: "model-x" });
          }),
      ),
    };
    const first = loadSpeciesPreview(deps({ species, careAi }), ID);
    const second = loadSpeciesPreview(deps({ species, careAi }), ID);
    await vi.waitFor(() => expect(careAi.describe).toHaveBeenCalled());
    finish();
    const [a, b] = await Promise.all([first, second]);
    expect(careAi.describe).toHaveBeenCalledTimes(1);
    expect(species.saveAiCare).toHaveBeenCalledTimes(1);
    const statuses = [a?.care.status, b?.care.status].sort();
    expect(statuses).toEqual(["available", "pending"]);
  });

  it("gives the claim back after an unavailable answer, so the next visit can ask", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    await loadSpeciesPreview(deps({ species, careAi: fakeCareAi({ kind: "unavailable" }) }), ID);
    expect(species.releaseAiCare).toHaveBeenCalledWith(ID, CLAIM_ID);
    expect(species.saveAiCare).not.toHaveBeenCalled();
  });

  it("gives the claim back when the call throws", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    const careAi = { describe: vi.fn(async () => { throw new Error("boom"); }) };
    await expect(loadSpeciesPreview(deps({ species, careAi }), ID)).rejects.toThrow("boom");
    expect(species.releaseAiCare).toHaveBeenCalledWith(ID, CLAIM_ID);
  });

  it("does not release a claim after a successful save", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    await loadSpeciesPreview(deps({ species, careAi: fakeCareAi({ kind: "ok", care: AI, model: "model-x" }) }), ID);
    expect(species.releaseAiCare).not.toHaveBeenCalled();
  });

  it("stores nothing and shows pending when its claim expired and another request took it", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }), aiClaimKept: false });
    const careAi = fakeCareAi({ kind: "ok", care: AI, model: "model-x" });
    const preview = await loadSpeciesPreview(deps({ species, careAi }), ID);
    expect(species.saveAiCare).toHaveBeenCalledWith(ID, CLAIM_ID, { care: AI, model: "model-x" });
    expect(species.releaseAiCare).not.toHaveBeenCalled();
    expect(preview?.care).toEqual({ status: "pending" });
  });

  it("releases only its own claim (passes its claim id) after a failed call", async () => {
    const species = fakeSpeciesStore({ record: record({ careStatus: "not_found" }) });
    species.claimAiCare.mockResolvedValueOnce("claim-a");
    await loadSpeciesPreview(deps({ species, careAi: fakeCareAi({ kind: "quota" }) }), ID);
    expect(species.releaseAiCare).toHaveBeenCalledWith(ID, "claim-a");
  });
});

import { describe, expect, it, vi } from "vitest";
import { potInsertRow } from "@/repo/plant-repo";
import type { PlantRegistration, SpeciesSummary } from "@/types/plant";
import { loadRegistrationContext, registerPot } from "./plant-service";

const SPECIES: SpeciesSummary = {
  id: "10000000-0000-0000-0000-000000000001",
  koreanName: null,
  scientificName: "Monstera deliciosa",
};

function fakeStore(options: { species?: SpeciesSummary | null; insert?: "ok" | "fail" } = {}) {
  const inserted: PlantRegistration[] = [];
  return {
    inserted,
    getSpecies: vi.fn(async (id: string) => (options.species && options.species.id === id ? options.species : null)),
    insertPot: vi.fn(async (registration: PlantRegistration) => {
      if (options.insert === "fail") return { ok: false as const };
      inserted.push(registration);
      return { ok: true as const, id: "20000000-0000-0000-0000-00000000000a" };
    }),
  };
}

describe("loadRegistrationContext", () => {
  it("shows the typed name for a manual entry, without reminders", async () => {
    const context = await loadRegistrationContext(fakeStore(), { mode: "manual", name: "고무나무" }, true);
    expect(context).toEqual({
      ok: true,
      identity: { kind: "manual", name: "고무나무" },
      species: null,
      plantName: "고무나무",
      reminders: { water: false, fertilizer: false },
    });
  });

  it("labels an unknown species plainly", async () => {
    const context = await loadRegistrationContext(fakeStore(), { mode: "unknown" }, false);
    expect(context).toMatchObject({ ok: true, plantName: "종 미상" });
  });

  it("uses the scientific name when the species has no Korean name yet", async () => {
    const context = await loadRegistrationContext(
      fakeStore({ species: SPECIES }),
      { mode: "species", species: SPECIES.id },
      false,
    );
    expect(context).toMatchObject({ ok: true, plantName: "Monstera deliciosa", species: SPECIES });
  });

  it("refuses a species id that is not in the plant DB", async () => {
    const context = await loadRegistrationContext(
      fakeStore({ species: null }),
      { mode: "species", species: SPECIES.id },
      false,
    );
    expect(context).toMatchObject({ ok: false });
  });
});

describe("registerPot", () => {
  const form = { mode: "manual", name: "고무나무", environment: "indoor", nickname: "거실", memo: "메모" };

  it("stores a valid pot and returns its id", async () => {
    const store = fakeStore();
    const result = await registerPot(store, form, false);
    expect(result).toEqual({ ok: true, id: "20000000-0000-0000-0000-00000000000a" });
    expect(store.inserted[0]).toMatchObject({ identity: { kind: "manual", name: "고무나무" }, nickname: "거실" });
  });

  it("does not save invalid input and echoes what the user typed", async () => {
    const store = fakeStore();
    const result = await registerPot(store, { ...form, environment: "", potMaterial: "wood" }, false);
    expect(result).toEqual({
      ok: false,
      state: {
        status: "invalid",
        errors: { environment: expect.any(String), potMaterial: expect.any(String) },
        values: { nickname: "거실", memo: "메모", environment: "", potMaterial: "wood" },
      },
    });
    expect(store.insertPot).not.toHaveBeenCalled();
  });

  it("keeps the input when the database save fails", async () => {
    const result = await registerPot(fakeStore({ insert: "fail" }), form, false);
    expect(result).toEqual({
      ok: false,
      state: { status: "save_failed", errors: {}, values: { nickname: "거실", memo: "메모", environment: "indoor" } },
    });
  });

  it("refuses to save when the chosen species no longer exists", async () => {
    const store = fakeStore({ species: null });
    const result = await registerPot(store, { mode: "species", species: SPECIES.id, environment: "indoor" }, false);
    expect(result).toMatchObject({ ok: false, state: { status: "invalid", errors: { identity: expect.any(String) } } });
    expect(store.insertPot).not.toHaveBeenCalled();
  });

  it("never stores a reminder that S05 did not offer", async () => {
    const store = fakeStore();
    await registerPot(store, { ...form, waterReminder: "on", fertilizerReminder: "on" }, true);
    expect(store.inserted[0]).toMatchObject({ waterReminder: false, fertilizerReminder: false });
  });
});

describe("potInsertRow", () => {
  const base: Omit<PlantRegistration, "identity"> = {
    nickname: null,
    location: null,
    environment: "indoor",
    lastWatered: "unknown",
    lightLevel: null,
    lastRepotted: "never",
    potMaterial: null,
    memo: null,
    waterReminder: false,
    fertilizerReminder: false,
  };

  it("keeps a manual name apart from any species (D12)", () => {
    expect(potInsertRow({ ...base, identity: { kind: "manual", name: "고무나무" } })).toMatchObject({
      species_id: null,
      user_entered_name: "고무나무",
    });
  });

  it("stores a confirmed species and no typed name", () => {
    expect(potInsertRow({ ...base, identity: { kind: "species", speciesId: SPECIES.id } })).toMatchObject({
      species_id: SPECIES.id,
      user_entered_name: null,
    });
  });

  it("stores the initial state as chosen categories, never as dates", () => {
    const row = potInsertRow({ ...base, identity: { kind: "unknown" } });
    expect(row).toMatchObject({
      species_id: null,
      user_entered_name: null,
      initial_last_watered_range: "unknown",
      initial_last_repotted_range: "never",
    });
    expect(Object.keys(row).some((key) => key.includes("date") || key.endsWith("_at"))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { PlantStoreError, supabasePlantStore } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

type Result = { data: unknown; error: { message: string } | null };

/** Minimal query builder: every chain ends in the given result. */
function fakeClient(result: Result): SupabaseServerClient {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return { from: () => builder } as unknown as SupabaseServerClient;
}

const POT_ROW = {
  id: "20000000-0000-0000-0000-00000000000a",
  nickname: null,
  user_entered_name: "고무나무",
  environment: "indoor",
  location: null,
  memo: "첫 줄\n둘째 줄",
  initial_last_watered_range: "about_1_week",
  light_level: "medium",
  initial_last_repotted_range: "unknown",
  pot_material: "plastic",
  initial_state_recorded_at: "2026-11-15T00:00:00Z",
  water_reminder_enabled: false,
  fertilizer_reminder_enabled: false,
  created_at: "2026-11-15T00:00:00Z",
  species: null,
};

const DB_ERROR = { message: "connection refused" };

describe("getPot (PR #13 review, item 3)", () => {
  it("returns the pot when the row exists", async () => {
    const pot = await supabasePlantStore(fakeClient({ data: POT_ROW, error: null })).getPot(POT_ROW.id);
    expect(pot).toMatchObject({ id: POT_ROW.id, userEnteredName: "고무나무", memo: "첫 줄\n둘째 줄" });
  });

  it("returns null when no row comes back (missing, or hidden by RLS)", async () => {
    await expect(supabasePlantStore(fakeClient({ data: null, error: null })).getPot(POT_ROW.id)).resolves.toBeNull();
  });

  it("throws on a failed query instead of reporting the pot as missing", async () => {
    const lookup = supabasePlantStore(fakeClient({ data: null, error: DB_ERROR })).getPot(POT_ROW.id);
    await expect(lookup).rejects.toBeInstanceOf(PlantStoreError);
  });

  it("keeps database detail out of the error message", async () => {
    const lookup = supabasePlantStore(fakeClient({ data: null, error: DB_ERROR })).getPot(POT_ROW.id);
    await expect(lookup).rejects.not.toThrow(/connection refused/);
  });
});

describe("getSpecies", () => {
  it("returns null when the species is not in the plant DB", async () => {
    await expect(supabasePlantStore(fakeClient({ data: null, error: null })).getSpecies("x")).resolves.toBeNull();
  });

  it("throws on a failed query", async () => {
    await expect(
      supabasePlantStore(fakeClient({ data: null, error: DB_ERROR })).getSpecies("x"),
    ).rejects.toBeInstanceOf(PlantStoreError);
  });
});

describe("listActivePots", () => {
  it("throws on a failed query", async () => {
    await expect(
      supabasePlantStore(fakeClient({ data: null, error: DB_ERROR })).listActivePots(),
    ).rejects.toBeInstanceOf(PlantStoreError);
  });
});

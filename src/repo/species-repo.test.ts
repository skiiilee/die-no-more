import { describe, expect, it } from "vitest";
import type { FoundSpecies } from "@/types/species";
import { PlantStoreError } from "./plant-repo";
import { careRows, insertRow, missingFields, supabaseSpeciesStore, toCare, type Row } from "./species-repo";
import type { SupabaseServerClient } from "./supabase-client";

const CARE = {
  watering: "Average",
  wateringBenchmark: { min: 7, max: 10 },
  sunlight: ["part shade"],
  careLevel: "Medium",
  description: "A rubber plant.",
};

describe("species_care rows for Perenual values", () => {
  it("stores each value as its own field with source and fetch time (04-data-sources)", () => {
    expect(careRows("s1", CARE, "2026-11-15T00:00:00Z")).toEqual([
      { species_id: "s1", field: "watering", value: "Average", source: "perenual", fetched_at: "2026-11-15T00:00:00Z" },
      {
        species_id: "s1",
        field: "watering_benchmark",
        value: { min: 7, max: 10, unit: "days" },
        source: "perenual",
        fetched_at: "2026-11-15T00:00:00Z",
      },
      { species_id: "s1", field: "light", value: ["part shade"], source: "perenual", fetched_at: "2026-11-15T00:00:00Z" },
      { species_id: "s1", field: "care_level", value: "Medium", source: "perenual", fetched_at: "2026-11-15T00:00:00Z" },
      {
        species_id: "s1",
        field: "description",
        value: "A rubber plant.",
        source: "perenual",
        fetched_at: "2026-11-15T00:00:00Z",
      },
    ]);
  });

  it("stores nothing for values Perenual did not give", () => {
    expect(careRows("s1", { watering: null, wateringBenchmark: null, sunlight: [], careLevel: null, description: null }, "t")).toEqual([]);
  });

  it("reads stored rows back into the same shape", () => {
    const rows = careRows("s1", CARE, "t").map(({ field, value }) => ({ field, value }));
    expect(toCare(rows)).toEqual(CARE);
    expect(toCare([])).toBeNull();
  });
});

const SIGNED = "https://s3.example.test/p.jpg?X-Amz-Expires=86400&X-Amz-Signature=abc";
const FOUND: FoundSpecies = {
  scientificNameKey: "ficus elastica",
  scientificName: "Ficus elastica",
  commonNameEn: "Rubber plant",
  family: "Moraceae",
  perenualId: 2961,
  trefleId: null,
  imageUrl: SIGNED,
  imageCredit: null,
  source: "perenual",
};
const ROW: Row = {
  id: "s1",
  scientific_name_key: "ficus elastica",
  scientific_name: "Ficus elastica",
  common_name_en: null,
  korean_name: "고무나무",
  family: null,
  perenual_id: null,
  trefle_id: 7,
  image_url: null,
  image_credit: null,
  korean_name_checked_at: null,
  care_status: null,
  care_ai_checked_at: null,
};

describe("storing search results", () => {
  it("never stores an expiring photo link", () => {
    expect(insertRow(FOUND).image_url).toBeNull();
    expect(insertRow({ ...FOUND, imageUrl: "https://bs.plantnet.org/image/o/abc" }).image_url).toBe(
      "https://bs.plantnet.org/image/o/abc",
    );
  });

  it("fills only empty fields and never replaces a stored value", () => {
    expect(missingFields(ROW, { ...FOUND, trefleId: 99 })).toEqual({
      perenual_id: 2961,
      common_name_en: "Rubber plant",
      family: "Moraceae",
    });
  });
});

type DbError = { code: string; message: string } | null;

/**
 * Minimal plant_species client for saveFound: the first upsert is the batch,
 * later ones are single rows. `stored` is what the read-back returns.
 */
function fakeClient(options: { batch?: DbError; items?: Record<string, DbError>; stored: Row[]; update?: DbError }) {
  let upserts = 0;
  const builder = {
    upsert: async (rows: { scientific_name_key: string }[]) => {
      upserts += 1;
      return { error: upserts === 1 ? (options.batch ?? null) : (options.items?.[rows[0].scientific_name_key] ?? null) };
    },
    select: () => ({ in: async () => ({ data: options.stored, error: null }) }),
    update: () => ({ eq: async () => ({ error: options.update ?? null }) }),
  };
  return { from: () => builder } as unknown as SupabaseServerClient;
}

const UNIQUE = { code: "23505", message: "duplicate key value violates unique constraint" };
const DENIED = { code: "42501", message: "permission denied" };
const LYRATA: FoundSpecies = { ...FOUND, scientificNameKey: "ficus lyrata", scientificName: "Ficus lyrata", perenualId: 2963 };
const rowFor = (found: FoundSpecies, id: string): Row => ({
  ...ROW,
  id,
  scientific_name_key: found.scientificNameKey,
  scientific_name: found.scientificName,
  perenual_id: found.perenualId,
  common_name_en: found.commonNameEn,
  family: found.family,
});

describe("saveFound (PR #15 review, item 3)", () => {
  it("stores the results and returns them in the order found", async () => {
    const store = supabaseSpeciesStore(fakeClient({ stored: [rowFor(LYRATA, "b"), rowFor(FOUND, "a")] }));
    const saved = await store.saveFound([FOUND, LYRATA]);
    expect(saved.records.map((r) => r.id)).toEqual(["a", "b"]);
    expect(saved.dropped).toBe(0);
  });

  it("throws on a write failure other than a provider ID clash, even when reads still work", async () => {
    const store = supabaseSpeciesStore(fakeClient({ batch: DENIED, stored: [] }));
    await expect(store.saveFound([FOUND, LYRATA])).rejects.toBeInstanceOf(PlantStoreError);
  });

  it("throws when a single-row retry fails for another reason", async () => {
    const store = supabaseSpeciesStore(
      fakeClient({ batch: UNIQUE, items: { "ficus elastica": UNIQUE, "ficus lyrata": DENIED }, stored: [] }),
    );
    await expect(store.saveFound([FOUND, LYRATA])).rejects.toBeInstanceOf(PlantStoreError);
  });

  it("keeps the rows that could be stored and counts the clashing one as dropped", async () => {
    const store = supabaseSpeciesStore(
      fakeClient({ batch: UNIQUE, items: { "ficus elastica": UNIQUE }, stored: [rowFor(LYRATA, "b")] }),
    );
    const saved = await store.saveFound([FOUND, LYRATA]);
    expect(saved.records.map((r) => r.scientificNameKey)).toEqual(["ficus lyrata"]);
    expect(saved.dropped).toBe(1);
  });

  it("throws when filling missing fields fails for a reason other than a clash", async () => {
    const stored = [{ ...rowFor(FOUND, "a"), perenual_id: null }];
    const store = supabaseSpeciesStore(fakeClient({ stored, update: DENIED }));
    await expect(store.saveFound([FOUND])).rejects.toBeInstanceOf(PlantStoreError);
  });
});

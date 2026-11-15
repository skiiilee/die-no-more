import { describe, expect, it } from "vitest";
import type { FoundSpecies } from "@/types/species";
import { careRows, insertRow, missingFields, toCare, type Row } from "./species-repo";

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
  korean_name_checked_at: null,
  care_status: null,
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

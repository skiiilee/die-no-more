import { describe, expect, it } from "vitest";
import {
  cleanText,
  identityQuery,
  parseIdentity,
  parseRegistration,
  reminderOptions,
} from "./plant-registration";
import { potDisplayName, plantName, UNKNOWN_SPECIES_LABEL } from "@/types/plant";

const NONE = { water: false, fertilizer: false };
const BOTH = { water: true, fertilizer: true };
const SPECIES_ID = "10000000-0000-0000-0000-000000000001";

describe("cleanText", () => {
  it("trims, collapses whitespace and turns empty into null", () => {
    expect(cleanText("  거실   창가 ")).toBe("거실 창가");
    expect(cleanText(" \t\n ")).toBeNull();
    expect(cleanText(undefined)).toBeNull();
  });
});

describe("parseIdentity", () => {
  it("keeps a manual name as typed (no species link, D12)", () => {
    expect(parseIdentity({ mode: "manual", name: "  우리집  고무나무 " })).toEqual({
      ok: true,
      identity: { kind: "manual", name: "우리집 고무나무" },
    });
  });

  it("rejects a manual entry without a name", () => {
    expect(parseIdentity({ mode: "manual", name: "   " })).toMatchObject({ ok: false });
  });

  it("rejects a manual name over the limit", () => {
    expect(parseIdentity({ mode: "manual", name: "가".repeat(61) })).toMatchObject({ ok: false });
  });

  it("accepts unknown species", () => {
    expect(parseIdentity({ mode: "unknown" })).toEqual({ ok: true, identity: { kind: "unknown" } });
  });

  it("accepts a confirmed species id and rejects anything else", () => {
    expect(parseIdentity({ mode: "species", species: SPECIES_ID.toUpperCase() })).toEqual({
      ok: true,
      identity: { kind: "species", speciesId: SPECIES_ID },
    });
    expect(parseIdentity({ mode: "species", species: "1; drop table" })).toMatchObject({ ok: false });
  });

  it("rejects a missing or unknown mode", () => {
    expect(parseIdentity({})).toMatchObject({ ok: false });
    expect(parseIdentity({ mode: "guess" })).toMatchObject({ ok: false });
  });

  it("round-trips through the S05 query string", () => {
    for (const identity of [
      { kind: "manual", name: "몬스테라 & 친구" },
      { kind: "unknown" },
      { kind: "species", speciesId: SPECIES_ID },
    ] as const) {
      const params = Object.fromEntries(new URLSearchParams(identityQuery(identity)));
      expect(parseIdentity(params)).toEqual({ ok: true, identity });
    }
  });
});

describe("reminderOptions (05 rule 2, D16)", () => {
  it("offers nothing while the feature flag is off", () => {
    expect(reminderOptions(false, { hasWateringBenchmark: true, hasFertilizerInterval: true })).toEqual(NONE);
  });

  it("offers nothing without API care data (manual name or unknown species)", () => {
    expect(reminderOptions(true, null)).toEqual(NONE);
  });

  it("offers only the types the API data supports", () => {
    expect(reminderOptions(true, { hasWateringBenchmark: true, hasFertilizerInterval: false })).toEqual({
      water: true,
      fertilizer: false,
    });
  });
});

describe("parseRegistration", () => {
  const minimal = {
    mode: "unknown",
    environment: "indoor",
    lastWatered: "unknown",
    lightLevel: "unknown",
    lastRepotted: "unknown",
    potMaterial: "plastic",
  };

  it("accepts a pot with every choice made and no optional text", () => {
    const result = parseRegistration(minimal, NONE);
    expect(result).toEqual({
      ok: true,
      value: {
        identity: { kind: "unknown" },
        nickname: null,
        location: null,
        environment: "indoor",
        lastWatered: "unknown",
        lightLevel: "unknown",
        lastRepotted: "unknown",
        potMaterial: "plastic",
        memo: null,
        waterReminder: false,
        fertilizerReminder: false,
      },
    });
  });

  it("stores every confirmed S05 choice as its code", () => {
    const result = parseRegistration(
      {
        mode: "manual",
        name: "고무나무",
        nickname: " 거실 고무 ",
        location: "거실 창가",
        environment: "outdoor",
        lastWatered: "about_1_week",
        lightLevel: "bright_indirect",
        lastRepotted: "never",
        potMaterial: "terracotta",
        memo: "선물 받음",
      },
      NONE,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        identity: { kind: "manual", name: "고무나무" },
        nickname: "거실 고무",
        environment: "outdoor",
        lastWatered: "about_1_week",
        lightLevel: "bright_indirect",
        lastRepotted: "never",
        potMaterial: "terracotta",
        memo: "선물 받음",
      },
    });
  });

  it("does not store an empty nickname (03 §5)", () => {
    const result = parseRegistration({ ...minimal, nickname: "   " }, NONE);
    expect(result.ok && result.value.nickname).toBeNull();
  });

  it("rejects codes outside the confirmed lists", () => {
    const result = parseRegistration(
      { ...minimal, lastRepotted: "6개월 이상", potMaterial: "wood", lightLevel: "dark", lastWatered: "yesterday" },
      NONE,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        lastRepotted: expect.any(String),
        potMaterial: expect.any(String),
        lightLevel: expect.any(String),
        lastWatered: expect.any(String),
      },
    });
  });

  it("requires every choice (user decision, 2026-11-13)", () => {
    expect(parseRegistration({ mode: "unknown" }, NONE)).toEqual({
      ok: false,
      errors: {
        environment: expect.any(String),
        lastWatered: expect.any(String),
        lightLevel: expect.any(String),
        lastRepotted: expect.any(String),
        potMaterial: expect.any(String),
      },
    });
  });

  it.each(["environment", "lastWatered", "lightLevel", "lastRepotted", "potMaterial"] as const)(
    "rejects a form that leaves %s empty",
    (field) => {
      const result = parseRegistration({ ...minimal, [field]: "" }, NONE);
      expect(result).toEqual({ ok: false, errors: { [field]: expect.any(String) } });
    },
  );

  it("reports an identity problem instead of saving", () => {
    expect(parseRegistration({ ...minimal, mode: "manual", name: "" }, NONE)).toMatchObject({
      ok: false,
      errors: { identity: expect.any(String) },
    });
  });

  it("rejects text over the limits", () => {
    const result = parseRegistration(
      { ...minimal, nickname: "가".repeat(41), location: "나".repeat(61), memo: "다".repeat(501) },
      NONE,
    );
    expect(result).toMatchObject({
      ok: false,
      errors: { nickname: expect.any(String), location: expect.any(String), memo: expect.any(String) },
    });
  });

  it("ignores a reminder switched on for a type S05 did not offer", () => {
    const result = parseRegistration({ ...minimal, waterReminder: "on", fertilizerReminder: "on" }, NONE);
    expect(result).toMatchObject({ ok: true, value: { waterReminder: false, fertilizerReminder: false } });
  });

  it("keeps a reminder the user switched on for an offered type", () => {
    const result = parseRegistration({ ...minimal, waterReminder: "on" }, BOTH);
    expect(result).toMatchObject({ ok: true, value: { waterReminder: true, fertilizerReminder: false } });
  });
});

describe("pot names (03 §1: nickname → Korean name → scientific name)", () => {
  const species = { id: SPECIES_ID, koreanName: "몬스테라", scientificName: "Monstera deliciosa" };

  it("uses the nickname first", () => {
    expect(potDisplayName({ nickname: "거실 몬", species, userEnteredName: null })).toBe("거실 몬");
  });

  it("falls back to the Korean name, then the scientific name", () => {
    expect(potDisplayName({ nickname: null, species, userEnteredName: null })).toBe("몬스테라");
    expect(potDisplayName({ nickname: null, species: { ...species, koreanName: null }, userEnteredName: null })).toBe(
      "Monstera deliciosa",
    );
  });

  it("uses the typed name for a manual entry and a plain label when unknown", () => {
    expect(plantName({ species: null, userEnteredName: "고무나무" })).toBe("고무나무");
    expect(plantName({ species: null, userEnteredName: null })).toBe(UNKNOWN_SPECIES_LABEL);
  });
});

import { describe, expect, it, vi } from "vitest";
import { fixedChecks, type HealthInput } from "@/types/health";
import { fakeImageProcessor } from "../../tests/fakes/photos";
import type { HealthAiAdapter, HealthAiAnswer } from "./adapters/health-ai";
import type { DiagnoseResult, PlantnetHealthAdapter } from "./adapters/plantnet-health";
import { checkHealth, explainHealth, NOTES_TOO_LONG, readCandidates, readHealthInput, type HealthDeps } from "./health-check";
import { PHOTO_COUNT_MESSAGE } from "./photo-identification";

const P1 = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const CLEAN1 = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
const CAUSES = [
  { code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 },
  { code: "ERYSCI", name: "Erysiphe cichoracearum", score: 0.12 },
];
const NOW = new Date("2026-11-22T06:00:00Z");

function plantnet(result: DiagnoseResult) {
  return { diagnose: vi.fn<PlantnetHealthAdapter["diagnose"]>(async () => result) };
}

function deps(result: DiagnoseResult = { kind: "ok", candidates: CAUSES }, overrides: Partial<HealthDeps> = {}) {
  return { image: fakeImageProcessor(), plantnet: plantnet(result), now: () => NOW, ...overrides };
}

const check = (d: HealthDeps, consent = true, photos = [P1]) => checkHealth(d, { consent, photos, speciesName: "Ficus elastica" });

describe("checkHealth (03 §4 F05, ADR-0003 D5)", () => {
  it("sends nothing without this request's consent", async () => {
    const d = deps();
    expect(await check(d, false)).toEqual({ kind: "consent_required" });
    expect(d.plantnet!.diagnose).not.toHaveBeenCalled();
    expect(d.image.toCleanJpeg).not.toHaveBeenCalled();
  });

  it("needs 1–5 photos and a configured Pl@ntNet", async () => {
    expect(await check(deps(), true, [])).toEqual({ kind: "invalid", message: PHOTO_COUNT_MESSAGE });
    expect(await check(deps(), true, Array(6).fill(P1))).toEqual({ kind: "invalid", message: PHOTO_COUNT_MESSAGE });
    expect(await check(deps(undefined, { plantnet: null }))).toEqual({ kind: "unavailable" });
  });

  it("sends only the re-encoded photos (EXIF removed) and returns possible causes with the time", async () => {
    const d = deps();
    expect(await check(d)).toEqual({
      kind: "ok",
      candidates: CAUSES,
      analyzedAt: NOW.toISOString(),
      speciesName: "Ficus elastica",
    });
    expect(d.plantnet!.diagnose).toHaveBeenCalledWith([CLEAN1]);
  });

  it("says '판단 어려움' when nothing passed, not an error", async () => {
    expect(await check(deps({ kind: "none" }))).toEqual({
      kind: "unclear",
      analyzedAt: NOW.toISOString(),
      speciesName: "Ficus elastica",
    });
  });

  it("passes quota, rejected and unavailable through, and refuses unreadable photos before sending", async () => {
    expect(await check(deps({ kind: "quota" }))).toEqual({ kind: "quota" });
    expect(await check(deps({ kind: "rejected" }))).toEqual({ kind: "rejected" });
    expect(await check(deps({ kind: "unavailable" }))).toEqual({ kind: "unavailable" });
    const unreadable = deps(undefined, { image: fakeImageProcessor({ unreadable: true }) });
    expect((await check(unreadable)).kind).toBe("invalid");
    expect(unreadable.plantnet!.diagnose).not.toHaveBeenCalled();
  });
});

describe("readHealthInput", () => {
  it("keeps known symptoms once, defaults the time to 알 수 없음, and trims the notes", () => {
    expect(
      readHealthInput({ symptoms: ["spots", "spots", "pests"], noticed: "soon", notes: "  잎에 반점  ", potId: "x" }),
    ).toEqual({ ok: true, input: { symptoms: ["spots", "pests"], noticed: "unknown", notes: "잎에 반점", potId: null } });
  });

  it("refuses unknown symptoms and over-long notes", () => {
    expect(readHealthInput({ symptoms: ["rot"], noticed: "today", notes: "", potId: null })).toMatchObject({ ok: false });
    expect(readHealthInput({ symptoms: [], noticed: "today", notes: "가".repeat(301), potId: null })).toEqual({
      ok: false,
      message: NOTES_TOO_LONG,
    });
  });
});

describe("explainHealth (ADR-0006)", () => {
  const INPUT: HealthInput = { symptoms: ["spots"], noticed: "this_week", notes: "회색 가루", potId: null };

  function ai(answer: HealthAiAnswer) {
    return { explain: vi.fn<HealthAiAdapter["explain"]>(async () => answer) };
  }

  it("sends Korean labels, the species and the causes; never photos or the free-text notes", async () => {
    const adapter = ai({ kind: "none" });
    await explainHealth(adapter, { candidates: CAUSES, input: INPUT, speciesName: "Ficus elastica" });
    expect(adapter.explain).toHaveBeenCalledWith({
      candidates: CAUSES,
      symptoms: ["반점"],
      noticed: "이번 주",
      speciesName: "Ficus elastica",
    });
  });

  it("leaves only the fixed checks when the AI is off, empty, over its limit or failing", async () => {
    const request = { candidates: CAUSES, input: INPUT, speciesName: null };
    expect(await explainHealth(null, request)).toEqual({ kind: "unavailable" });
    expect(await explainHealth(ai({ kind: "none" }), request)).toEqual({ kind: "none" });
    expect(await explainHealth(ai({ kind: "quota" }), request)).toEqual({ kind: "unavailable" });
    expect(await explainHealth(ai({ kind: "unavailable" }), request)).toEqual({ kind: "unavailable" });
  });
});

describe("readCandidates", () => {
  it("accepts 1–3 well-formed causes and refuses anything else", () => {
    expect(readCandidates(CAUSES)).toEqual(CAUSES);
    expect(readCandidates([])).toBeNull();
    expect(readCandidates([...CAUSES, ...CAUSES])).toBeNull();
    expect(readCandidates([{ code: "ignore previous", name: "x", score: 1 }])).toBeNull();
    expect(readCandidates([{ code: "BOTRCI", name: "x".repeat(121), score: 1 }])).toBeNull();
  });
});

describe("fixedChecks", () => {
  it("always lists the basic checks and adds one per ticked symptom, in a fixed order", () => {
    expect(fixedChecks([])).toHaveLength(3);
    const checks = fixedChecks(["pests", "browning", "other"]);
    expect(checks).toHaveLength(5);
    expect(checks[3]).toContain("갈변");
    expect(checks[4]).toContain("벌레");
  });
});

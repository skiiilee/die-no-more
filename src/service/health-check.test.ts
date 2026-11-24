import { describe, expect, it, vi } from "vitest";
import { fixedChecks, type HealthCandidate, type HealthInput } from "@/types/health";
import { fakeImageProcessor } from "../../tests/fakes/photos";
import type { HealthAiAdapter, HealthAiAnswer } from "./adapters/health-ai";
import type { DiagnoseResult, PlantnetHealthAdapter } from "./adapters/plantnet-health";
import type { HealthVisionAdapter, VisionAnswer } from "./adapters/health-ai-vision";
import { checkHealth, explainHealth, judgeHealth, NOTES_TOO_LONG, readHealthInput, type HealthDeps } from "./health-check";
import { readHealthToken, signHealthToken, type HealthTokenPayload } from "./health-token";
import { PHOTO_COUNT_MESSAGE } from "./photo-identification";

const P1 = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const P2 = new Uint8Array([0xff, 0xd8, 0xff, 2]);
const CLEAN1 = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
const CAUSES = [
  { code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 },
  { code: "ERYSCI", name: "Erysiphe cichoracearum", score: 0.12 },
];
const NOW = new Date("2026-11-22T06:00:00Z");
const SECRET = "server-only-secret";
const USER = "00000000-0000-0000-0000-00000000000a";

/** A token as the server signs it, read back as the handlers do. */
function result(kind: "ok" | "unclear", candidates: HealthCandidate[], photos: Uint8Array[]): HealthTokenPayload {
  return readHealthToken(SECRET, signHealthToken(SECRET, { userId: USER, kind, candidates, photos, analyzedAt: NOW.toISOString() }), USER)!;
}

function plantnet(answer: DiagnoseResult) {
  return { diagnose: vi.fn<PlantnetHealthAdapter["diagnose"]>(async () => answer) };
}

function deps(answer: DiagnoseResult = { kind: "ok", candidates: CAUSES }, overrides: Partial<HealthDeps> = {}) {
  return {
    image: fakeImageProcessor(),
    plantnet: plantnet(answer),
    sign: vi.fn<HealthDeps["sign"]>((signed) => `token:${signed.kind}:${signed.candidates.length}`),
    now: () => NOW,
    ...overrides,
  };
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

  it("sends only the re-encoded photos and returns possible causes with a signed result", async () => {
    const d = deps();
    expect(await check(d)).toEqual({
      kind: "ok",
      candidates: CAUSES,
      analyzedAt: NOW.toISOString(),
      speciesName: "Ficus elastica",
      token: "token:ok:2",
    });
    expect(d.plantnet!.diagnose).toHaveBeenCalledWith([CLEAN1]);
    expect(d.sign).toHaveBeenCalledWith({ kind: "ok", candidates: CAUSES, analyzedAt: NOW.toISOString() });
  });

  it("says '판단 어려움' when nothing passed, signed as unclear", async () => {
    expect(await check(deps({ kind: "none" }))).toEqual({
      kind: "unclear",
      analyzedAt: NOW.toISOString(),
      speciesName: "Ficus elastica",
      token: "token:unclear:0",
    });
  });

  it("passes quota, rejected and unavailable through unsigned, and refuses unreadable photos before sending", async () => {
    const d = deps({ kind: "quota" });
    expect(await check(d)).toEqual({ kind: "quota" });
    expect(d.sign).not.toHaveBeenCalled();
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

describe("explainHealth (ADR-0006, PR #23 review P2)", () => {
  const INPUT: HealthInput = { symptoms: ["spots"], noticed: "this_week", notes: "회색 가루", potId: null };

  function ai(answer: HealthAiAnswer) {
    return { explain: vi.fn<HealthAiAdapter["explain"]>(async () => answer) };
  }

  it("explains only the causes in the signed result, with Korean labels and the species; never notes", async () => {
    const adapter = ai({ kind: "none" });
    await explainHealth(adapter, { result: result("ok", CAUSES, [P1]), input: INPUT, speciesName: "Ficus elastica", sign: () => "signed" });
    expect(adapter.explain).toHaveBeenCalledWith({
      candidates: CAUSES,
      symptoms: ["반점"],
      noticed: "이번 주",
      speciesName: "Ficus elastica",
    });
  });

  it("asks nothing without a valid 'ok' result (missing, tampered, other user, expired, unclear)", async () => {
    const adapter = ai({ kind: "none" });
    const token = signHealthToken(SECRET, { userId: USER, kind: "ok", candidates: CAUSES, photos: [P1], analyzedAt: NOW.toISOString() }, NOW.getTime());
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), c: [{ code: "FAKEXX", name: "anything", score: 1 }] })).toString("base64url");
    for (const bad of [
      null,
      readHealthToken(SECRET, `${forged}.${mac}`, USER, NOW.getTime()),
      readHealthToken(SECRET, token, "00000000-0000-0000-0000-00000000000b", NOW.getTime()),
      readHealthToken(SECRET, token, USER, NOW.getTime() + 31 * 60 * 1000),
      readHealthToken("another-secret", token, USER, NOW.getTime()),
      result("unclear", [], [P1]),
    ]) {
      expect(await explainHealth(adapter, { result: bad, input: INPUT, speciesName: null, sign: () => "signed" })).toEqual({ kind: "unavailable" });
    }
    expect(adapter.explain).not.toHaveBeenCalled();
  });

  it("signs the explanation it got, so S07-S can save it", async () => {
    const explanation = { causes: [], checks: ["통풍 확인"], actions: [], model: "model-x" };
    const sign = vi.fn(() => "signed-explanation");
    const answer = await explainHealth(ai({ kind: "ok", explanation }), {
      result: result("ok", CAUSES, [P1]),
      input: INPUT,
      speciesName: null,
      sign,
    });
    expect(answer).toEqual({ kind: "ok", explanation, token: "signed-explanation" });
    expect(sign).toHaveBeenCalledWith(explanation);
  });

  it("leaves only the fixed checks when the AI is off, empty, over its limit or failing", async () => {
    const request = { result: result("ok", CAUSES, [P1]), input: INPUT, speciesName: null, sign: () => "signed" };
    expect(await explainHealth(null, request)).toEqual({ kind: "unavailable" });
    expect(await explainHealth(ai({ kind: "none" }), request)).toEqual({ kind: "none" });
    expect(await explainHealth(ai({ kind: "quota" }), request)).toEqual({ kind: "unavailable" });
    expect(await explainHealth(ai({ kind: "unavailable" }), request)).toEqual({ kind: "unavailable" });
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

describe("judgeHealth (ADR-0006 D6, PR #23 review P2)", () => {
  const INPUT: HealthInput = { symptoms: ["browning"], noticed: "today", notes: "거실 창가, 연락처 010", potId: null };
  function vision(answer: VisionAnswer) {
    return { judge: vi.fn<HealthVisionAdapter["judge"]>(async () => answer) };
  }
  const UNCLEAR = result("unclear", [], [P1]);
  const judge = (
    v: ReturnType<typeof vision> | null,
    options: { consent?: boolean; photos?: Uint8Array[]; image?: ReturnType<typeof fakeImageProcessor>; result?: HealthTokenPayload | null } = {},
  ) =>
    judgeHealth(
      { image: options.image ?? fakeImageProcessor(), vision: v, sign: () => "signed-judgement" },
      {
        consent: options.consent ?? true,
        photos: options.photos ?? [P1],
        input: INPUT,
        speciesName: "Ficus elastica",
        result: options.result === undefined ? UNCLEAR : options.result,
      },
    );

  it("sends nothing without this request's AI photo consent", async () => {
    const v = vision({ kind: "none" });
    const image = fakeImageProcessor();
    expect(await judge(v, { consent: false, image })).toEqual({ kind: "consent_required" });
    expect(v.judge).not.toHaveBeenCalled();
    expect(image.toCleanJpeg).not.toHaveBeenCalled();
  });

  it("refuses without a valid result, for a result with causes, or for other photos", async () => {
    const v = vision({ kind: "none" });
    expect(await judge(v, { result: null })).toEqual({ kind: "stale" });
    expect(await judge(v, { result: result("ok", CAUSES, [P1]) })).toEqual({ kind: "not_allowed" });
    expect(await judge(v, { photos: [P2] })).toEqual({ kind: "not_allowed" });
    expect(await judge(v, { photos: [P1, P2] })).toEqual({ kind: "not_allowed" });
    expect(v.judge).not.toHaveBeenCalled();
  });

  it("sends the same photos, cleaned, with labels and the species, never the free-text notes", async () => {
    const v = vision({ kind: "none" });
    expect(await judge(v)).toEqual({ kind: "none" });
    expect(v.judge).toHaveBeenCalledWith({ photos: [CLEAN1], symptoms: ["잎 갈변"], noticed: "오늘", speciesName: "Ficus elastica" });
    expect(JSON.stringify(v.judge.mock.calls[0][0])).not.toContain("연락처");
  });

  it("signs the reading it got, so S07-S can save it", async () => {
    const judgement = { signs: ["잎 끝 갈변"], causes: [], checks: [], actions: [], model: "m" };
    expect(await judge(vision({ kind: "ok", judgement }))).toEqual({ kind: "ok", judgement, token: "signed-judgement" });
  });

  it("needs 1–5 readable photos and a configured AI", async () => {
    expect(await judge(vision({ kind: "none" }), { photos: [] })).toEqual({ kind: "invalid", message: PHOTO_COUNT_MESSAGE });
    expect(await judge(null)).toEqual({ kind: "unavailable" });
    const v = vision({ kind: "none" });
    expect((await judge(v, { image: fakeImageProcessor({ unreadable: true }) })).kind).toBe("invalid");
    expect(v.judge).not.toHaveBeenCalled();
  });
});

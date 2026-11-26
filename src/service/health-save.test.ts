import { describe, expect, it, vi } from "vitest";
import type { HealthInput } from "@/types/health";
import { fakeImageProcessor } from "../../tests/fakes/photos";
import { saveHealthCheck, SAVE_MESSAGES, UNCERTAINTY, type HealthSaveDeps, type SignedAi } from "./health-save";
import { readAiAnswer, readHealthToken, resultDigest, signAiAnswer, signHealthToken, type HealthTokenPayload } from "./health-token";

const SECRET = "server-only-secret";
const USER = "00000000-0000-0000-0000-00000000000a";
const POT = "20000000-0000-0000-0000-00000000000a";
const CHECK = "40000000-0000-0000-0000-0000000000c1";
const P1 = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const P2 = new Uint8Array([0xff, 0xd8, 0xff, 2]);
const CLEAN1 = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1]);
const CAUSES = [{ code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 }];
const AT = "2026-11-24T06:00:00.000Z";
const INPUT: HealthInput = { symptoms: ["spots"], noticed: "this_week", notes: "잎에 회색 가루", potId: POT };

function signed(kind: "ok" | "unclear", photos: Uint8Array[] = [P1]) {
  const token = signHealthToken(SECRET, { userId: USER, kind, candidates: kind === "ok" ? CAUSES : [], photos, analyzedAt: AT });
  return { token, payload: readHealthToken(SECRET, token, USER) as HealthTokenPayload };
}

function explanationFor(resultToken: string): SignedAi {
  const content = { causes: [{ code: "BOTRCI", text: "습할 때 생길 수 있음" }], checks: ["통풍 확인"], actions: [], model: "model-x" };
  return readAiAnswer(SECRET, signAiAnswer(SECRET, { userId: USER, resultToken, kind: "explain", content }), USER, resultToken);
}

function judgementFor(resultToken: string): SignedAi {
  const content = { signs: ["잎 끝 갈변"], causes: [{ name: "건조", reason: "잎 끝이 말라 보임" }], checks: [], actions: [], model: "model-x" };
  return readAiAnswer(SECRET, signAiAnswer(SECRET, { userId: USER, resultToken, kind: "judge", content }), USER, resultToken);
}

/** newId() gives "id-1" (the clean-up request), then "id-2", "id-3"… (the photo files). */
function baseDeps() {
  let n = 0;
  return {
    image: fakeImageProcessor(),
    photos: {
      userId: vi.fn<HealthSaveDeps["photos"]["userId"]>(async () => USER),
      upload: vi.fn<HealthSaveDeps["photos"]["upload"]>(async () => true),
      removeObject: vi.fn<HealthSaveDeps["photos"]["removeObject"]>(async () => true),
      markDeletion: vi.fn<HealthSaveDeps["photos"]["markDeletion"]>(async () => undefined),
    },
    health: {
      findByDigest: vi.fn<HealthSaveDeps["health"]["findByDigest"]>(async () => null),
      planCleanup: vi.fn<HealthSaveDeps["health"]["planCleanup"]>(async () => true),
      save: vi.fn<HealthSaveDeps["health"]["save"]>(async () => ({ checkId: CHECK, potId: POT, created: true })),
    },
    potExists: vi.fn(async () => true),
    newId: () => `id-${++n}`,
  };
}

function deps(overrides: Partial<ReturnType<typeof baseDeps>> = {}) {
  return { ...baseDeps(), ...overrides } satisfies HealthSaveDeps;
}

const save = (
  d: ReturnType<typeof deps>,
  request: Partial<Parameters<typeof saveHealthCheck>[1]> & { result: HealthTokenPayload | null; resultToken?: string },
) => saveHealthCheck(d, { resultToken: "", photos: [P1], input: INPUT, explanation: null, judgement: null, ...request });

describe("saveHealthCheck (S07-S)", () => {
  it("records the paths, uploads, and stores the signed result with the signed AI explanation", async () => {
    const d = deps();
    const { token, payload } = signed("ok");
    expect(await save(d, { result: payload, resultToken: token, explanation: explanationFor(token) })).toEqual({
      kind: "saved",
      potId: POT,
      checkId: CHECK,
    });
    expect(d.health.planCleanup).toHaveBeenCalledWith("id-1", [`${USER}/id-2.jpg`]);
    expect(d.health.planCleanup.mock.invocationCallOrder[0]).toBeLessThan(d.photos.upload.mock.invocationCallOrder[0]);
    expect(d.photos.upload).toHaveBeenCalledWith(`${USER}/id-2.jpg`, CLEAN1);
    expect(d.health.save).toHaveBeenCalledWith(
      POT,
      {
        outcome: "found",
        causes: CAUSES,
        symptoms: ["spots"],
        noticed: "this_week",
        notes: "잎에 회색 가루",
        analyzed_at: AT,
        uncertainty: UNCERTAINTY,
        ai_explanation: { causes: [{ code: "BOTRCI", text: "습할 때 생길 수 있음" }], checks: ["통풍 확인"], actions: [] },
        ai_judgement: null,
        ai_model: "model-x",
      },
      [`${USER}/id-2.jpg`],
      { resultDigest: resultDigest(token), cleanupRequest: "id-1" },
    );
    expect(d.photos.removeObject).not.toHaveBeenCalled();
  });

  it("stores an unclear result with the signed AI photo reading", async () => {
    const d = deps();
    const { token, payload } = signed("unclear");
    expect((await save(d, { result: payload, resultToken: token, judgement: judgementFor(token) })).kind).toBe("saved");
    expect(d.health.save.mock.calls[0][1]).toMatchObject({
      outcome: "unclear",
      causes: [],
      ai_explanation: null,
      ai_judgement: { signs: ["잎 끝 갈변"], causes: [{ name: "건조", reason: "잎 끝이 말라 보임" }] },
      ai_model: "model-x",
    });
  });

  it("stores nothing without a valid result, or for other photos, or with unsigned or mismatched AI text", async () => {
    const d = deps();
    const ok = signed("ok");
    const unclear = signed("unclear");
    expect(await save(d, { result: null })).toEqual({ kind: "stale" });
    expect(await save(d, { result: ok.payload, photos: [P2] })).toEqual({ kind: "not_allowed" });
    expect(await save(d, { result: ok.payload, explanation: "invalid" })).toEqual({ kind: "not_allowed" });
    // An AI text signed for a different result is not this result's text.
    expect(
      await save(d, { result: ok.payload, resultToken: ok.token, explanation: explanationFor(unclear.token) }),
    ).toEqual({ kind: "not_allowed" });
    expect(await save(d, { result: ok.payload, resultToken: ok.token, judgement: judgementFor(ok.token) })).toEqual({
      kind: "not_allowed",
    });
    expect(
      await save(d, { result: unclear.payload, resultToken: unclear.token, explanation: explanationFor(unclear.token) }),
    ).toEqual({ kind: "not_allowed" });
    expect(d.photos.upload).not.toHaveBeenCalled();
    expect(d.health.save).not.toHaveBeenCalled();
  });

  it("needs a pot of the user's own", async () => {
    const { payload } = signed("ok");
    expect(await save(deps(), { result: payload, input: { ...INPUT, potId: null } })).toEqual({
      kind: "invalid",
      message: SAVE_MESSAGES.noPot,
    });
    const d = deps({ potExists: vi.fn(async () => false) });
    expect(await save(d, { result: payload })).toEqual({ kind: "not_found" });
    expect(d.photos.upload).not.toHaveBeenCalled();
    expect(await save(deps({ potExists: vi.fn(async () => Promise.reject(new Error("db"))) }), { result: payload })).toEqual({
      kind: "failed",
    });
  });

  it("answers a repeated save of the same result with the saved check, uploading nothing (PR #26 review P2)", async () => {
    const d = deps();
    d.health.findByDigest.mockResolvedValueOnce({ checkId: CHECK, potId: POT });
    const { token, payload } = signed("ok");
    expect(await save(d, { result: payload, resultToken: token })).toEqual({ kind: "saved", potId: POT, checkId: CHECK });
    expect(d.health.findByDigest).toHaveBeenCalledWith(resultDigest(token));
    expect(d.health.planCleanup).not.toHaveBeenCalled();
    expect(d.photos.upload).not.toHaveBeenCalled();
    expect(d.health.save).not.toHaveBeenCalled();
  });

  it("keeps the first of two concurrent saves and removes the second one's files", async () => {
    const d = deps();
    d.health.save.mockResolvedValueOnce({ checkId: CHECK, potId: POT, created: false });
    const { token, payload } = signed("ok");
    expect(await save(d, { result: payload, resultToken: token })).toEqual({ kind: "saved", potId: POT, checkId: CHECK });
    expect(d.photos.removeObject).toHaveBeenCalledWith(`${USER}/id-2.jpg`);
    expect(d.photos.markDeletion).toHaveBeenCalledWith("id-1", `${USER}/id-2.jpg`, { ok: true });
  });

  it("uploads nothing when the paths cannot be recorded first", async () => {
    const d = deps();
    d.health.planCleanup.mockResolvedValueOnce(false);
    expect(await save(d, { result: signed("ok").payload })).toEqual({ kind: "failed" });
    expect(d.photos.upload).not.toHaveBeenCalled();
  });

  it("removes this request's files when an upload or the database save fails, and marks each one", async () => {
    const two = signed("ok", [P1, P2]);
    const failingUpload = deps();
    failingUpload.photos.upload.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await save(failingUpload, { result: two.payload, photos: [P1, P2] })).toEqual({ kind: "failed" });
    expect(failingUpload.photos.removeObject.mock.calls.map((call) => call[0])).toEqual([`${USER}/id-2.jpg`, `${USER}/id-3.jpg`]);
    expect(failingUpload.photos.markDeletion).toHaveBeenCalledTimes(2);
    expect(failingUpload.health.save).not.toHaveBeenCalled();

    const failingSave = deps();
    failingSave.health.save.mockResolvedValueOnce(null);
    expect(await save(failingSave, { result: two.payload, photos: [P1, P2] })).toEqual({ kind: "failed" });
    expect(failingSave.photos.removeObject.mock.calls.map((call) => call[0])).toEqual([`${USER}/id-2.jpg`, `${USER}/id-3.jpg`]);
  });

  it("keeps a file Storage would not remove on record as failed, for the clean-up job (PR #26 review P2)", async () => {
    const d = deps();
    d.health.save.mockResolvedValueOnce(null);
    d.photos.removeObject.mockResolvedValueOnce(false);
    expect(await save(d, { result: signed("ok").payload })).toEqual({ kind: "failed" });
    expect(d.photos.markDeletion).toHaveBeenCalledWith("id-1", `${USER}/id-2.jpg`, {
      ok: false,
      error: "unsaved health check photo",
    });
  });

  it("refuses unreadable photos before recording or uploading anything", async () => {
    const { payload } = signed("ok");
    const d = deps({ image: fakeImageProcessor({ unreadable: true }) });
    expect((await save(d, { result: payload })).kind).toBe("invalid");
    expect(d.health.planCleanup).not.toHaveBeenCalled();
    expect(d.photos.upload).not.toHaveBeenCalled();
  });
});

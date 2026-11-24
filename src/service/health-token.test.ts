import { describe, expect, it } from "vitest";
import { photoHash, readAiAnswer, readHealthToken, samePhotos, signAiAnswer, signHealthToken, TOKEN_TTL_MS } from "./health-token";

const SECRET = "server-only-secret";
const USER = "00000000-0000-0000-0000-00000000000a";
const P1 = new Uint8Array([1, 2, 3]);
const CAUSES = [{ code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 }];
const NOW = 1_800_000_000_000;

describe("health result token (PR #23 review P2)", () => {
  const token = signHealthToken(SECRET, { userId: USER, kind: "ok", candidates: CAUSES, photos: [P1], analyzedAt: "2026-11-24T06:00:00.000Z" }, NOW);

  it("reads back what the server signed, for the same user, until it expires", () => {
    expect(readHealthToken(SECRET, token, USER, NOW + 1000)).toEqual({
      v: 1,
      u: USER,
      k: "ok",
      c: CAUSES,
      p: [photoHash(P1)],
      t: "2026-11-24T06:00:00.000Z",
      e: NOW + TOKEN_TTL_MS,
    });
    expect(readHealthToken(SECRET, token, USER, NOW + TOKEN_TTL_MS)).toBeNull();
  });

  it("refuses broken, tampered, foreign or differently keyed tokens", () => {
    const [body, mac] = token.split(".");
    for (const bad of [undefined, 42, "", "abc", `${body}.`, `${body}.${mac}.x`, `${body}x.${mac}`, `${body}.${mac.slice(1)}`]) {
      expect(readHealthToken(SECRET, bad, USER, NOW)).toBeNull();
    }
    expect(readHealthToken(SECRET, token, "00000000-0000-0000-0000-00000000000b", NOW)).toBeNull();
    expect(readHealthToken("other-secret", token, USER, NOW)).toBeNull();
  });

  it("carries no secret, and matches only the same photos in the same order", () => {
    expect(Buffer.from(token.split(".")[0], "base64url").toString()).not.toContain(SECRET);
    const payload = readHealthToken(SECRET, token, USER, NOW)!;
    expect(samePhotos(payload, [P1])).toBe(true);
    expect(samePhotos(payload, [new Uint8Array([1, 2, 4])])).toBe(false);
    expect(samePhotos(payload, [P1, P1])).toBe(false);
  });
});

describe("signed AI answers (S07-S saves only what the server received)", () => {
  const result = signHealthToken(SECRET, { userId: USER, kind: "ok", candidates: CAUSES, photos: [P1], analyzedAt: "2026-11-24T06:00:00.000Z" }, NOW);
  const explanation = { causes: [{ code: "BOTRCI", text: "습할 때 생길 수 있음" }], checks: ["통풍 확인"], actions: [], model: "model-x" };
  const signed = signAiAnswer(SECRET, { userId: USER, resultToken: result, kind: "explain", content: explanation }, NOW);

  it("reads back the AI text and model for the same user and the same result", () => {
    expect(readAiAnswer(SECRET, signed, USER, result, NOW + 1000)).toEqual({
      v: 1,
      u: USER,
      r: expect.any(String),
      k: "explain",
      m: "model-x",
      d: { causes: explanation.causes, checks: ["통풍 확인"], actions: [] },
      e: NOW + TOKEN_TTL_MS,
    });
  });

  it("refuses it for another result, another user, after expiry, or when edited", () => {
    const other = signHealthToken(SECRET, { userId: USER, kind: "ok", candidates: CAUSES, photos: [new Uint8Array([9])], analyzedAt: "2026-11-24T06:00:00.000Z" }, NOW);
    expect(readAiAnswer(SECRET, signed, USER, other, NOW)).toBeNull();
    expect(readAiAnswer(SECRET, signed, "00000000-0000-0000-0000-00000000000b", result, NOW)).toBeNull();
    expect(readAiAnswer(SECRET, signed, USER, result, NOW + TOKEN_TTL_MS)).toBeNull();
    const [body, mac] = signed.split(".");
    const edited = Buffer.from(Buffer.from(body, "base64url").toString().replace("통풍 확인", "살균제 사용")).toString("base64url");
    expect(readAiAnswer(SECRET, `${edited}.${mac}`, USER, result, NOW)).toBeNull();
  });

  it("never accepts a result token as an AI answer, or an AI answer as a result token", () => {
    expect(readAiAnswer(SECRET, result, USER, result, NOW)).toBeNull();
    expect(readHealthToken(SECRET, signed, USER, NOW)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { photoHash, readHealthToken, samePhotos, signHealthToken, TOKEN_TTL_MS } from "./health-token";

const SECRET = "server-only-secret";
const USER = "00000000-0000-0000-0000-00000000000a";
const P1 = new Uint8Array([1, 2, 3]);
const CAUSES = [{ code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 }];
const NOW = 1_800_000_000_000;

describe("health result token (PR #23 review P2)", () => {
  const token = signHealthToken(SECRET, { userId: USER, kind: "ok", candidates: CAUSES, photos: [P1] }, NOW);

  it("reads back what the server signed, for the same user, until it expires", () => {
    expect(readHealthToken(SECRET, token, USER, NOW + 1000)).toEqual({
      v: 1,
      u: USER,
      k: "ok",
      c: CAUSES,
      p: [photoHash(P1)],
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

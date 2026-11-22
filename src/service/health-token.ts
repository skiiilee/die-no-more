import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { HealthCandidate } from "@/types/health";

/**
 * Signed S07 result token (PR #23 review P2). The server signs what
 * Pl@ntNet actually answered, so the follow-up AI requests can only use
 * that answer:
 * - /explain takes the possible causes from the token, never from the body;
 * - /ai-judge needs an 'unclear' token and the same photos (by SHA-256) that
 *   Pl@ntNet judged (ADR-0006 D6).
 * The token is bound to the user and expires after 30 minutes. Nothing is
 * stored. The signing key is derived from a server-only secret with a fixed
 * purpose label, so it is never the secret itself.
 */

export const TOKEN_TTL_MS = 30 * 60 * 1000;

export type HealthTokenPayload = {
  v: 1;
  /** The signed-in user the result belongs to. */
  u: string;
  k: "ok" | "unclear";
  /** The causes Pl@ntNet returned (empty when unclear). */
  c: HealthCandidate[];
  /** SHA-256 (hex) of each photo as received, in order. */
  p: string[];
  /** Expiry, ms since epoch. */
  e: number;
};

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

function signingKey(secret: string): Buffer {
  return createHash("sha256").update(`die-no-more/health-result-token/v1:${secret}`).digest();
}

function mac(secret: string, body: string): Buffer {
  return createHmac("sha256", signingKey(secret)).update(body).digest();
}

export function photoHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function signHealthToken(
  secret: string,
  result: { userId: string; kind: "ok" | "unclear"; candidates: HealthCandidate[]; photos: Uint8Array[] },
  nowMs: number = Date.now(),
): string {
  const payload: HealthTokenPayload = {
    v: 1,
    u: result.userId,
    k: result.kind,
    c: result.candidates,
    p: result.photos.map(photoHash),
    e: nowMs + TOKEN_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(mac(secret, body))}`;
}

/**
 * The payload of a token this server signed for `userId` that has not
 * expired, or null for anything else (tampered, other user, expired, broken).
 */
export function readHealthToken(
  secret: string,
  token: unknown,
  userId: string,
  nowMs: number = Date.now(),
): HealthTokenPayload | null {
  if (typeof token !== "string" || token.length > 8192) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = mac(secret, body);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  let payload: HealthTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HealthTokenPayload;
  } catch {
    return null;
  }
  if (payload?.v !== 1 || payload.u !== userId || typeof payload.e !== "number" || payload.e <= nowMs) return null;
  if ((payload.k !== "ok" && payload.k !== "unclear") || !Array.isArray(payload.c) || !Array.isArray(payload.p)) return null;
  return payload;
}

/** True when `photos` are exactly the photos the token was signed for, in order. */
export function samePhotos(payload: HealthTokenPayload, photos: Uint8Array[]): boolean {
  return photos.length === payload.p.length && photos.every((photo, index) => photoHash(photo) === payload.p[index]);
}

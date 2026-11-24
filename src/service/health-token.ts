import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AiJudgement, HealthCandidate, HealthExplanation } from "@/types/health";

/**
 * Signed S07 result token (PR #23 review P2). The server signs what
 * Pl@ntNet actually answered, so the follow-up AI requests can only use
 * that answer:
 * - /explain takes the possible causes from the token, never from the body;
 * - /ai-judge needs an 'unclear' token and the same photos (by SHA-256) that
 *   Pl@ntNet judged (ADR-0006 D6).
 * - /save (S07-S) stores only a result, photos and AI texts that carry these
 *   signatures, so nothing the browser made up is ever saved as a result.
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
  /** When Pl@ntNet answered (ISO). */
  t: string;
  /** Expiry, ms since epoch. */
  e: number;
};

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

type Purpose = "health-result-token" | "health-ai-answer";

function signingKey(secret: string, purpose: Purpose): Buffer {
  return createHash("sha256").update(`die-no-more/${purpose}/v1:${secret}`).digest();
}

function mac(secret: string, body: string, purpose: Purpose = "health-result-token"): Buffer {
  return createHmac("sha256", signingKey(secret, purpose)).update(body).digest();
}

function sealed(secret: string, payload: unknown, purpose: Purpose): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(mac(secret, body, purpose))}`;
}

/** The JSON inside a token this server sealed for `purpose`, or null. */
function opened(secret: string, token: unknown, purpose: Purpose): unknown {
  if (typeof token !== "string" || token.length > 16384) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const expected = mac(secret, body, purpose);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function photoHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function signHealthToken(
  secret: string,
  result: {
    userId: string;
    kind: "ok" | "unclear";
    candidates: HealthCandidate[];
    photos: Uint8Array[];
    analyzedAt: string;
  },
  nowMs: number = Date.now(),
): string {
  const payload: HealthTokenPayload = {
    v: 1,
    u: result.userId,
    k: result.kind,
    c: result.candidates,
    p: result.photos.map(photoHash),
    t: result.analyzedAt,
    e: nowMs + TOKEN_TTL_MS,
  };
  return sealed(secret, payload, "health-result-token");
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
  const payload = opened(secret, token, "health-result-token") as HealthTokenPayload | null;
  if (payload?.v !== 1 || payload.u !== userId || typeof payload.e !== "number" || payload.e <= nowMs) return null;
  if ((payload.k !== "ok" && payload.k !== "unclear") || !Array.isArray(payload.c) || !Array.isArray(payload.p)) return null;
  if (typeof payload.t !== "string" || Number.isNaN(Date.parse(payload.t))) return null;
  return payload;
}

/** True when `photos` are exactly the photos the token was signed for, in order. */
export function samePhotos(payload: HealthTokenPayload, photos: Uint8Array[]): boolean {
  return photos.length === payload.p.length && photos.every((photo, index) => photoHash(photo) === payload.p[index]);
}

/** Fingerprint of a result token, so an AI answer is tied to that exact result. */
export function resultDigest(resultToken: string): string {
  return createHash("sha256").update(resultToken).digest("hex");
}

export type AiAnswerPayload =
  | { v: 1; u: string; r: string; k: "explain"; m: string; d: Omit<HealthExplanation, "model">; e: number }
  | { v: 1; u: string; r: string; k: "judge"; m: string; d: Omit<AiJudgement, "model">; e: number };

/**
 * Signs an AI answer the server itself received, tied to the result token it
 * was asked for (S07-S saves it only with that result).
 */
export function signAiAnswer(
  secret: string,
  answer: { userId: string; resultToken: string } & (
    | { kind: "explain"; content: HealthExplanation }
    | { kind: "judge"; content: AiJudgement }
  ),
  nowMs: number = Date.now(),
): string {
  const { model, ...rest } = answer.content;
  return sealed(
    secret,
    { v: 1, u: answer.userId, r: resultDigest(answer.resultToken), k: answer.kind, m: model, d: rest, e: nowMs + TOKEN_TTL_MS },
    "health-ai-answer",
  );
}

/** A signed AI answer for this user and this result token, not expired, or null. */
export function readAiAnswer(
  secret: string,
  token: unknown,
  userId: string,
  resultToken: string,
  nowMs: number = Date.now(),
): AiAnswerPayload | null {
  const payload = opened(secret, token, "health-ai-answer") as AiAnswerPayload | null;
  if (payload?.v !== 1 || payload.u !== userId || payload.r !== resultDigest(resultToken)) return null;
  if (typeof payload.e !== "number" || payload.e <= nowMs || typeof payload.m !== "string") return null;
  return payload.k === "explain" || payload.k === "judge" ? payload : null;
}

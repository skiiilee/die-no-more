import type { IdentifiedSpecies } from "@/types/photo";
import { httpsUrl, jsonBody, record, retryAfter, text, type HttpCall, type HttpResult, type ProviderPostClient } from "./http";
import type { UsageSettlement } from "./perenual";

/**
 * Pl@ntNet photo identification (docs/04-api-design.md "Pl@ntNet" and
 * "Live check (2026-11-17)"). Only this provider ever receives user photos
 * (ADR-0003 D5), and only after the user agreed for that request.
 *
 * - POST /v2/identify/all with 1–5 `images`, one `organs` value each ("auto").
 * - 200: `results[]` ordered by score; each has species names, family and,
 *   with include-related-images, reference photos with a licence citation.
 * - 404 "Species not found": not a plant, or no prediction. A normal answer.
 * - 429: daily quota, with Retry-After (next 00:00 UTC).
 * - Every answer carries `RateLimit: "dailyQuota";r=<left>;t=<seconds to reset>`.
 * A 200 whose body is not the expected shape is a failure, never "no match".
 */

const ENDPOINT = "https://my-api.plantnet.org/v2/identify/all";
/** Candidates shown on S04-A. */
export const MAX_RESULTS = 5;

export type IdentifyResult =
  | { kind: "ok"; species: IdentifiedSpecies[]; version: string | null }
  | { kind: "none" }
  | { kind: "quota" }
  | { kind: "rejected" }
  | { kind: "unavailable" };

export type PlantnetAdapter = { identify(images: Uint8Array[]): Promise<IdentifyResult> };

const DAY_MS = 24 * 60 * 60 * 1000;

function nextUtcMidnight(nowMs: number): number {
  return nowMs - (nowMs % DAY_MS) + DAY_MS;
}

/** Remaining calls and seconds to reset from the RateLimit header, when present. */
export function parseRateLimit(headers: Headers): { remaining: number; resetSeconds: number } | null {
  const raw = headers.get("ratelimit");
  const remaining = raw?.match(/(?:^|;)\s*r=(\d+)/)?.[1];
  const reset = raw?.match(/(?:^|;)\s*t=(\d+)/)?.[1];
  return remaining !== undefined && reset !== undefined ? { remaining: Number(remaining), resetSeconds: Number(reset) } : null;
}

/**
 * Usage row for a Pl@ntNet attempt (ADR-0004 D5: the provider's answer comes
 * first). A 429 is the daily quota: recorded as quota_exceeded, which stops
 * Pl@ntNet until the next UTC day. A success that used the last call sets
 * retry_at to the provider's reset time.
 */
export function plantnetUsage(result: HttpResult, nowMs: number = Date.now()): UsageSettlement {
  if (result.kind !== "response" || result.status >= 500) return { status: "failure", retryAt: null };
  if (result.status === 429) {
    return { status: "quota_exceeded", retryAt: retryAfter(result.headers, nowMs, nextUtcMidnight(nowMs) - nowMs) };
  }
  const rate = parseRateLimit(result.headers);
  if (rate && rate.remaining === 0) return { status: "success", retryAt: new Date(nowMs + rate.resetSeconds * 1000) };
  return { status: "success", retryAt: null };
}

function referencePhoto(value: unknown): { imageUrl: string | null; imageCredit: string | null } {
  const images = Array.isArray(value) ? value : [];
  for (const item of images) {
    const image = record(item);
    const urls = record(image?.url);
    const url = httpsUrl(urls?.m) ?? httpsUrl(urls?.s) ?? httpsUrl(urls?.o);
    if (url) return { imageUrl: url, imageCredit: text(image?.citation) };
  }
  return { imageUrl: null, imageCredit: null };
}

/** Results of a 200 answer, or null when the body is not a result list. */
export function parseIdentify(body: unknown): { species: IdentifiedSpecies[]; version: string | null } | null {
  const answer = record(body);
  if (!answer || !Array.isArray(answer.results)) return null;
  const species: IdentifiedSpecies[] = [];
  for (const item of answer.results) {
    const result = record(item);
    const named = record(result?.species);
    const scientificName = text(named?.scientificNameWithoutAuthor);
    const score = result?.score;
    if (!scientificName || typeof score !== "number" || !Number.isFinite(score)) continue;
    const commonNames = Array.isArray(named?.commonNames) ? named.commonNames : [];
    species.push({
      score,
      scientificName,
      commonNameEn: text(commonNames.find((name) => text(name))),
      family: text(record(named?.family)?.scientificNameWithoutAuthor),
      ...referencePhoto(result?.images),
    });
  }
  // Keep Pl@ntNet's order (best first); it is the rank shown on S04-A.
  return { species: species.slice(0, MAX_RESULTS), version: text(answer.version) };
}

function answer(call: HttpCall): IdentifyResult {
  const { result } = call;
  if (result.kind === "blocked") {
    return { kind: result.reason === "usage_unavailable" ? "unavailable" : "quota" };
  }
  if (result.kind === "failed") return { kind: "unavailable" };
  if (result.status === 404) return { kind: "none" };
  if (result.status === 429) return { kind: "quota" };
  if (result.status === 400 || result.status === 413 || result.status === 415) return { kind: "rejected" };
  if (result.status !== 200) return { kind: "unavailable" };
  const parsed = parseIdentify(jsonBody(result));
  if (!parsed) return { kind: "unavailable" };
  return parsed.species.length > 0 ? { kind: "ok", ...parsed } : { kind: "none" };
}

/** The key goes in the query string of a server call only; URLs are never logged. */
export function plantnet(client: ProviderPostClient, apiKey: string): PlantnetAdapter {
  return {
    async identify(images) {
      const url = new URL(ENDPOINT);
      url.searchParams.set("include-related-images", "true");
      url.searchParams.set("nb-results", String(MAX_RESULTS));
      url.searchParams.set("lang", "en");
      url.searchParams.set("api-key", apiKey);
      const form = () => {
        const body = new FormData();
        images.forEach((bytes, index) => {
          body.append("images", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), `photo-${index + 1}.jpg`);
          body.append("organs", "auto");
        });
        return body;
      };
      return answer(await client.post(url.toString(), form, "identify"));
    },
  };
}

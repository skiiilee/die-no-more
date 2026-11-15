import type { ProviderSpecies } from "@/types/species";
import { httpsUrl, jsonBody, record, retryAfter, text, type HttpResult, type ProviderClient } from "./http";
import type { ProviderFailure, UsageSettlement } from "./perenual";

/**
 * Trefle adapter (docs/04-api-design.md). Name search, and Korean names from
 * `main_species.common_names.ko` on the plant details (live check 2026-11-13).
 * 60 requests/minute: a 429 is a short back-off until its Retry-After time
 * (ADR-0004 D5), never a daily stop. A 200 whose body is not the expected
 * shape is a failure, not "no data" (PR #15 review, item 2).
 */

const BASE = "https://trefle.io/api/v1";

/** Back-off when a 429 carries no usable Retry-After: Trefle's window is one minute. */
const DEFAULT_BACKOFF_MS = 60_000;

export type TrefleSearchAnswer = { kind: "ok"; species: ProviderSpecies[] } | ProviderFailure;
export type KoreanNameAnswer = { kind: "ok"; koreanName: string | null } | ProviderFailure;

/** Usage row for a Trefle attempt: a 429 records when Trefle may be asked again. */
export function trefleUsage(result: HttpResult, nowMs: number = Date.now()): UsageSettlement {
  if (result.kind === "response" && result.status === 429) {
    return { status: "failure", retryAt: retryAfter(result.headers, nowMs, DEFAULT_BACKOFF_MS) };
  }
  if (result.kind !== "response" || result.status >= 500) return { status: "failure", retryAt: null };
  return { status: "success", retryAt: null };
}

function failure(result: HttpResult): ProviderFailure {
  if (result.kind === "blocked" && (result.reason === "limit" || result.reason === "quota")) return { kind: "quota" };
  return { kind: "unavailable" };
}

/** Search results, or null when the body is not a result list. */
export function parseSearch(body: unknown): ProviderSpecies[] | null {
  const data = record(body)?.data;
  if (!Array.isArray(data)) return null;
  const species: ProviderSpecies[] = [];
  for (const item of data) {
    const row = record(item);
    const id = row?.id;
    const scientificName = text(row?.scientific_name);
    if (!row || typeof id !== "number" || !Number.isInteger(id) || !scientificName) continue;
    species.push({
      provider: "trefle",
      providerId: id,
      scientificName,
      commonNameEn: text(row.common_name),
      family: text(row.family),
      imageUrl: httpsUrl(row.image_url),
    });
  }
  return species;
}

/**
 * First Korean common name. `{ ok: true, name: null }` when a valid plant
 * record has none; `{ ok: false }` when the body is not a plant record.
 */
export function parseKoreanName(body: unknown): { ok: true; name: string | null } | { ok: false } {
  const data = record(record(body)?.data);
  if (!data) return { ok: false };
  const names = record(record(data.main_species)?.common_names ?? data.common_names);
  const korean = names?.ko;
  if (Array.isArray(korean)) {
    for (const name of korean) {
      const value = text(name);
      if (value) return { ok: true, name: value.replace(/\s+/g, " ") };
    }
  }
  return { ok: true, name: null };
}

export function trefle(client: ProviderClient, token: string) {
  const url = (path: string, params: Record<string, string> = {}) =>
    `${BASE}${path}?${new URLSearchParams({ token, ...params }).toString()}`;

  return {
    async search(query: string): Promise<TrefleSearchAnswer> {
      const { result } = await client.get(url("/plants/search", { q: query }), "search");
      if (result.kind === "response" && result.status === 200) {
        const species = parseSearch(jsonBody(result));
        return species ? { kind: "ok", species } : { kind: "unavailable" };
      }
      return failure(result);
    },

    async koreanName(id: number): Promise<KoreanNameAnswer> {
      const { result } = await client.get(url(`/plants/${id}`), "korean_name");
      if (result.kind === "response" && result.status === 200) {
        const parsed = parseKoreanName(jsonBody(result));
        return parsed.ok ? { kind: "ok", koreanName: parsed.name } : { kind: "unavailable" };
      }
      if (result.kind === "response" && result.status === 404) return { kind: "ok", koreanName: null };
      return failure(result);
    },
  };
}

export type TrefleAdapter = ReturnType<typeof trefle>;

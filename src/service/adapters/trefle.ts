import type { ProviderSpecies } from "@/types/species";
import { httpsUrl, jsonBody, record, text, type HttpClient } from "./http";
import type { ProviderFailure } from "./perenual";

/**
 * Trefle adapter (docs/04-api-design.md). Name search, and Korean names from
 * `main_species.common_names.ko` on the plant details (live check 2026-11-13).
 * 60 requests/minute: a 429 is a short back-off, not a daily quota.
 */

const BASE = "https://trefle.io/api/v1";

export type TrefleSearchAnswer = ({ kind: "ok"; species: ProviderSpecies[] } | ProviderFailure) & { calls: number };
export type KoreanNameAnswer = ({ kind: "ok"; koreanName: string | null } | ProviderFailure) & { calls: number };

export function parseSearch(body: unknown): ProviderSpecies[] {
  const data = record(body)?.data;
  if (!Array.isArray(data)) return [];
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

/** First Korean common name, or null when Trefle has none. */
export function parseKoreanName(body: unknown): string | null {
  const data = record(record(body)?.data);
  const names = record(record(data?.main_species)?.common_names ?? data?.common_names);
  const korean = names?.ko;
  if (!Array.isArray(korean)) return null;
  for (const name of korean) {
    const value = text(name);
    if (value) return value.replace(/\s+/g, " ");
  }
  return null;
}

export function trefle(client: HttpClient, token: string) {
  const url = (path: string, params: Record<string, string> = {}) =>
    `${BASE}${path}?${new URLSearchParams({ token, ...params }).toString()}`;

  return {
    async search(query: string): Promise<TrefleSearchAnswer> {
      const call = await client.get(url("/plants/search", { q: query }));
      const { result } = call;
      if (result.kind === "response" && result.status === 200) {
        return { kind: "ok", species: parseSearch(jsonBody(result)), calls: call.attempts };
      }
      return { kind: "unavailable", calls: call.attempts };
    },

    async koreanName(id: number): Promise<KoreanNameAnswer> {
      const call = await client.get(url(`/plants/${id}`));
      const { result } = call;
      if (result.kind === "response" && result.status === 200) {
        return { kind: "ok", koreanName: parseKoreanName(jsonBody(result)), calls: call.attempts };
      }
      if (result.kind === "response" && result.status === 404) return { kind: "ok", koreanName: null, calls: call.attempts };
      return { kind: "unavailable", calls: call.attempts };
    },
  };
}

export type TrefleAdapter = ReturnType<typeof trefle>;

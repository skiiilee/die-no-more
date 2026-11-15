import type { PerenualCare, ProviderSpecies, UsageStatus } from "@/types/species";
import { httpsUrl, jsonBody, record, text, type HttpCall, type HttpResult, type ProviderClient } from "./http";

/**
 * Perenual adapter (docs/04-api-design.md "Provider check" and "Live check").
 * Search works for every species; care details on the free plan only for
 * species IDs 1–3000. Above that the API answers 429 "Please Upgrade Plan",
 * which means "outside the free range", not a quota: never retried.
 * A 200 whose body is not the expected shape is a failure, never "no data",
 * so a broken answer is not stored as a checked result (PR #15 review, item 2).
 */

const BASE = "https://perenual.com/api/v2";

/** Highest species ID whose care details the free plan returns. */
export const FREE_RANGE_MAX_ID = 3000;

export type ProviderFailure = { kind: "quota" } | { kind: "unavailable" };
export type SearchAnswer = { kind: "ok"; species: ProviderSpecies[] } | ProviderFailure;
export type DetailsAnswer =
  | { kind: "ok"; care: PerenualCare }
  | { kind: "outside_free_range" }
  | { kind: "not_found" }
  | ProviderFailure;

/** How one attempt is recorded in api_usage_logs. */
export type UsageSettlement = { status: Exclude<UsageStatus, "reserved">; retryAt: Date | null };

function isUpgradeAnswer(result: HttpResult): boolean {
  return result.kind === "response" && result.status === 429 && /upgrade/i.test(result.body);
}

/** Usage row for a Perenual attempt: a 429 other than "Please Upgrade Plan" is the daily quota. */
export function perenualUsage(result: HttpResult): UsageSettlement {
  if (result.kind !== "response" || result.status >= 500) return { status: "failure", retryAt: null };
  if (result.status === 429 && !isUpgradeAnswer(result)) return { status: "quota_exceeded", retryAt: null };
  return { status: "success", retryAt: null };
}

/** Non-OK answers shared by search and details. */
function failure(call: HttpCall): ProviderFailure {
  const { result } = call;
  if (result.kind === "blocked") return { kind: result.reason === "limit" || result.reason === "quota" ? "quota" : "unavailable" };
  if (result.kind === "response" && result.status === 429) return { kind: "quota" };
  return { kind: "unavailable" };
}

function firstScientificName(value: unknown): string | null {
  if (Array.isArray(value)) return text(value.find((item) => text(item)));
  return text(value);
}

function photo(value: unknown): string | null {
  const image = record(value);
  return image ? (httpsUrl(image.small_url) ?? httpsUrl(image.thumbnail) ?? httpsUrl(image.regular_url)) : null;
}

/** species-list items, or null when the body is not a species list. */
export function parseSearch(body: unknown): ProviderSpecies[] | null {
  const data = record(body)?.data;
  if (!Array.isArray(data)) return null;
  const species: ProviderSpecies[] = [];
  for (const item of data) {
    const row = record(item);
    const id = row?.id;
    const scientificName = firstScientificName(row?.scientific_name);
    if (!row || typeof id !== "number" || !Number.isInteger(id) || !scientificName) continue;
    species.push({
      provider: "perenual",
      providerId: id,
      scientificName,
      commonNameEn: text(row.common_name),
      family: text(row.family),
      imageUrl: photo(row.default_image),
    });
  }
  return species;
}

/**
 * `watering_general_benchmark` came back as {"value": "\"7-10\"", "unit": "days"}.
 * Accepts only "<min>-<max>" or "<n>" days after stripping quotes and spaces;
 * anything else is "no benchmark", so no reminder and no invented interval (D16).
 */
export function parseBenchmark(value: unknown): { min: number; max: number } | null {
  const benchmark = record(value);
  if (!benchmark || text(benchmark.unit)?.toLowerCase() !== "days") return null;
  const raw = typeof benchmark.value === "number" ? String(benchmark.value) : text(benchmark.value);
  if (!raw) return null;
  const match = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(raw.replace(/["'\s]/g, ""));
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  return min >= 1 && min <= max && max <= 365 ? { min, max } : null;
}

/** Species details, or null when the body is not a species record (no numeric id). */
export function parseDetails(body: unknown): PerenualCare | null {
  const row = record(body);
  if (!row || typeof row.id !== "number") return null;
  const sunlight = Array.isArray(row.sunlight)
    ? row.sunlight.map((item) => text(item)?.toLowerCase()).filter((item): item is string => Boolean(item))
    : [];
  return {
    watering: text(row.watering),
    wateringBenchmark: parseBenchmark(row.watering_general_benchmark),
    sunlight,
    careLevel: text(row.care_level),
    description: text(row.description),
  };
}

export function perenual(client: ProviderClient, key: string) {
  const url = (path: string, params: Record<string, string> = {}) =>
    `${BASE}${path}?${new URLSearchParams({ key, ...params }).toString()}`;

  return {
    async search(query: string): Promise<SearchAnswer> {
      const call = await client.get(url("/species-list", { q: query }), "search");
      if (call.result.kind === "response" && call.result.status === 200) {
        const species = parseSearch(jsonBody(call.result));
        return species ? { kind: "ok", species } : { kind: "unavailable" };
      }
      return failure(call);
    },

    /** Care details. IDs above the free range are not requested at all. */
    async details(id: number): Promise<DetailsAnswer> {
      if (id > FREE_RANGE_MAX_ID) return { kind: "outside_free_range" };
      const call = await client.get(url(`/species/details/${id}`), "details");
      const { result } = call;
      if (result.kind === "response" && result.status === 200) {
        const care = parseDetails(jsonBody(result));
        return care ? { kind: "ok", care } : { kind: "unavailable" };
      }
      if (isUpgradeAnswer(result)) return { kind: "outside_free_range" };
      if (result.kind === "response" && result.status === 404) return { kind: "not_found" };
      return failure(call);
    },
  };
}

export type PerenualAdapter = ReturnType<typeof perenual>;

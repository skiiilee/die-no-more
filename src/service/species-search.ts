import { PlantStoreError } from "@/repo/plant-repo";
import type { SpeciesStore } from "@/repo/species-repo";
import {
  isStorableImageUrl,
  type FoundSpecies,
  type ProviderSpecies,
  type SearchOutcome,
  type SpeciesCandidate,
  type SpeciesRecord,
} from "@/types/species";
import type { PerenualAdapter } from "./adapters/perenual";
import type { TrefleAdapter } from "./adapters/trefle";
import type { Translator } from "./adapters/translator";
import { cleanText } from "./plant-registration";

/**
 * Name search (docs/stage2/04-data-sources.md "이름 검색 순서"):
 * ① plant DB → ② Perenual and Trefle with the query as typed → ③ when the
 * query is Korean and nothing was found, an English translation (not
 * connected yet, ADR-0004 D3/D4: skipped) → ④ manual entry.
 * Provider results are stored in the plant DB keyed by scientific name (D10).
 * Daily caps and back-off are enforced per HTTP attempt inside the adapters'
 * client (provider-usage.ts), so this file never counts calls itself.
 */

export const MAX_QUERY_LENGTH = 60;
const MAX_CANDIDATES = 20;

export type SearchDeps = {
  species: SpeciesStore;
  perenual: PerenualAdapter | null;
  trefle: TrefleAdapter | null;
  translator: Translator;
};

type ProviderStatus = "ok" | "quota" | "unavailable";
type ProviderRound = { found: ProviderSpecies[]; statuses: ProviderStatus[] };

/** ADR-0003 D10 key: lowercase, trimmed, single spaces. */
export function scientificNameKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

export function isKorean(text: string): boolean {
  return /[ㄱ-ㆎ가-힣]/.test(text);
}

/** Merges provider answers by scientific-name key, keeping the first answer's order. */
export function mergeFound(found: ProviderSpecies[]): FoundSpecies[] {
  const merged = new Map<string, FoundSpecies>();
  for (const item of found) {
    const key = scientificNameKey(item.scientificName);
    if (!key) continue;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        scientificNameKey: key,
        scientificName: item.scientificName.replace(/\s+/g, " ").trim(),
        commonNameEn: item.commonNameEn,
        family: item.family,
        perenualId: item.provider === "perenual" ? item.providerId : null,
        trefleId: item.provider === "trefle" ? item.providerId : null,
        imageUrl: item.imageUrl,
        // Perenual and Trefle search results carry no photo credit.
        imageCredit: null,
        source: item.provider,
      });
      continue;
    }
    if (item.provider === "perenual") existing.perenualId ??= item.providerId;
    if (item.provider === "trefle") existing.trefleId ??= item.providerId;
    // A photo that can be stored beats one that expires (isStorableImageUrl).
    if (!isStorableImageUrl(existing.imageUrl) && isStorableImageUrl(item.imageUrl)) existing.imageUrl = item.imageUrl;
    existing.imageUrl ??= item.imageUrl;
    existing.commonNameEn ??= item.commonNameEn;
    existing.family ??= item.family;
  }
  return [...merged.values()].slice(0, MAX_CANDIDATES);
}

export function toCandidate(record: SpeciesRecord): SpeciesCandidate {
  return {
    id: record.id,
    koreanName: record.koreanName,
    scientificName: record.scientificName,
    imageUrl: record.imageUrl,
    imageCredit: record.imageCredit,
  };
}

async function ask(
  adapter: PerenualAdapter | TrefleAdapter | null,
  query: string,
): Promise<{ status: ProviderStatus; found: ProviderSpecies[] }> {
  if (!adapter) return { status: "unavailable", found: [] };
  const answer = await adapter.search(query);
  return answer.kind === "ok" ? { status: "ok", found: answer.species } : { status: answer.kind, found: [] };
}

async function askProviders(deps: SearchDeps, query: string): Promise<ProviderRound> {
  const answers = await Promise.all([ask(deps.perenual, query), ask(deps.trefle, query)]);
  return { found: answers.flatMap((answer) => answer.found), statuses: answers.map((answer) => answer.status) };
}

function noResults(query: string, statuses: ProviderStatus[]): SearchOutcome {
  const partial = statuses.some((status) => status !== "ok");
  if (statuses.every((status) => status === "quota")) return { kind: "quota", query };
  if (statuses.every((status) => status !== "ok")) return { kind: "unavailable", query };
  return { kind: "empty", query, korean: isKorean(query), partial };
}

export async function searchSpecies(deps: SearchDeps, rawQuery: string | null | undefined): Promise<SearchOutcome> {
  const query = cleanText(rawQuery) ?? "";
  if (!query) return { kind: "invalid", query, message: "찾을 식물 이름을 입력해 주세요." };
  if (query.length > MAX_QUERY_LENGTH) {
    return { kind: "invalid", query, message: `검색어는 ${MAX_QUERY_LENGTH}자 이내로 입력해 주세요.` };
  }

  const local = await deps.species.searchLocal(query);
  if (local.length > 0) {
    return { kind: "results", query, from: "plant_db", candidates: local.map(toCandidate), partial: false, dropped: false };
  }

  let round = await askProviders(deps, query);
  if (round.found.length === 0 && isKorean(query) && round.statuses.some((status) => status === "ok")) {
    const english = await deps.translator.koreanToEnglish(query);
    if (english.kind === "ok") round = await askProviders(deps, english.text);
  }

  const merged = mergeFound(round.found);
  if (merged.length === 0) return noResults(query, round.statuses);

  const saved = await deps.species.saveFound(merged);
  // Found but nothing could be stored: a failure to retry, never an empty list (PR #15 review, item 3).
  if (saved.records.length === 0) throw new PlantStoreError("saveFound: no result could be stored");
  // Expiring photos are not stored, but they are still valid for this page.
  const shownPhoto = new Map(merged.map((item) => [item.scientificNameKey, item.imageUrl]));
  return {
    kind: "results",
    query,
    from: "providers",
    candidates: saved.records.map((record) => ({
      ...toCandidate(record),
      imageUrl: record.imageUrl ?? shownPhoto.get(record.scientificNameKey) ?? null,
    })),
    partial: round.statuses.some((status) => status !== "ok"),
    dropped: saved.dropped > 0,
  };
}

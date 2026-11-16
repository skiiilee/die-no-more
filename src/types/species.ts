/**
 * Name search shapes (S03 → S04-A → S04-B), docs/stage2/04-data-sources.md.
 * Provider answers are normalized here; raw responses are never stored (D6).
 */

export type SearchProvider = "perenual" | "trefle";

/** One species as a provider's search returned it, before it is stored. */
export type ProviderSpecies = {
  provider: SearchProvider;
  providerId: number;
  /** Scientific name without author, as the provider gave it. */
  scientificName: string;
  commonNameEn: string | null;
  family: string | null;
  /** https reference photo from the provider, if any. */
  imageUrl: string | null;
};

/** A stored plant DB row as search and S04 read it. */
export type SpeciesRecord = {
  id: string;
  scientificNameKey: string;
  scientificName: string;
  commonNameEn: string | null;
  koreanName: string | null;
  family: string | null;
  perenualId: number | null;
  trefleId: number | null;
  imageUrl: string | null;
  koreanNameCheckedAt: string | null;
  careStatus: CareStatus | null;
};

/** S04-A row. The English common name is never shown (03 §1). */
export type SpeciesCandidate = {
  id: string;
  koreanName: string | null;
  scientificName: string;
  imageUrl: string | null;
};

/**
 * S04-A outcome.
 * - results: candidates to choose from. `partial` when a provider could not be asked.
 * - empty: nothing found. `korean` when the query was Korean (no English retry
 *   until translation is connected, ADR-0004 D3).
 * - quota: every provider's daily limit is used up (03 §3 fixed message).
 * - unavailable: no provider could be reached or none is configured.
 */
export type SearchOutcome =
  | {
      kind: "results";
      query: string;
      from: "plant_db" | "providers";
      candidates: SpeciesCandidate[];
      partial: boolean;
      /** Some results could not be stored (provider ID already used by another name) and were left out. */
      dropped: boolean;
    }
  | { kind: "empty"; query: string; korean: boolean; partial: boolean }
  | { kind: "quota"; query: string }
  | { kind: "unavailable"; query: string }
  | { kind: "invalid"; query: string; message: string };

/** Result of the Perenual care lookup kept on the species row. */
export type CareStatus = "available" | "outside_free_range" | "not_found";

/** Perenual care values, normalized (docs/04-api-design.md "Live check"). */
export type PerenualCare = {
  /** Frequent | Average | Minimum | None, as given. */
  watering: string | null;
  /** Days between waterings, only when the benchmark parses (D16). */
  wateringBenchmark: { min: number; max: number } | null;
  /** Sunlight strings, lower-cased. */
  sunlight: string[];
  /** Low | Medium | High (or Moderate), as given. */
  careLevel: string | null;
  /** Short description, English original (translated later, ADR-0004 D2). */
  description: string | null;
};

/** S04-B: what the species screen shows. Labels are Korean, values only from providers. */
export type SpeciesPreview = {
  id: string;
  koreanName: string | null;
  scientificName: string;
  imageUrl: string | null;
  /**
   * available: care facts below come from Perenual.
   * none: Perenual has no care data for this species (outside the free range
   *   or no match): no water reminder, S13 '직접 입력하기' (approved 2026-11-12).
   * pending: Perenual could not be asked right now; try again later.
   */
  care: { status: "available"; facts: CareFacts } | { status: "none" } | { status: "pending" };
};

/**
 * S04-B values. Known codes get Korean labels; anything else is shown as the
 * provider gave it (owner decision 2026-11-15). Null means '정보 없음'.
 */
export type CareFacts = {
  careLevel: string | null;
  light: string | null;
  watering: string | null;
  /** e.g. "7~10일" (soil check interval reference, D16). */
  wateringInterval: string | null;
  /** English original until translation is connected (ADR-0004 D3). */
  description: string | null;
};

/** A species merged from provider answers by scientific-name key (D10), ready to store. */
export type FoundSpecies = {
  scientificNameKey: string;
  scientificName: string;
  commonNameEn: string | null;
  family: string | null;
  perenualId: number | null;
  trefleId: number | null;
  imageUrl: string | null;
  /** Provider that found it first. */
  source: SearchProvider;
};

/** api_usage_logs status. 'reserved' until the attempt ends; it still counts (PR #15 review, item 1). */
export type UsageStatus = "reserved" | "success" | "failure" | "quota_exceeded";

/**
 * Whether a provider photo URL can be stored. Perenual serves pre-signed links
 * that expire after 24 hours (live check 2026-11-15), so those are shown on the
 * current results page only and never written to the plant DB.
 */
export function isStorableImageUrl(url: string | null): url is string {
  if (!url) return false;
  try {
    const params = new URL(url).searchParams;
    return !["X-Amz-Expires", "X-Amz-Signature", "Expires", "Signature"].some((name) => params.has(name));
  } catch {
    return false;
  }
}

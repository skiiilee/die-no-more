import type { SpeciesStore } from "@/repo/species-repo";
import { AI_CARE_FIELDS, type AiCare, type CareField, type CareStatus, type PerenualCare, type SpeciesPreview, type SpeciesRecord } from "@/types/species";
import type { CareAiAdapter } from "./adapters/care-ai";
import type { PerenualAdapter } from "./adapters/perenual";
import type { TrefleAdapter } from "./adapters/trefle";
import { careFacts, mergeCareFacts } from "./care-labels";
import { scientificNameKey } from "./species-search";

/**
 * S04-B 식물 정보 확인. Asks each provider at most once per species and keeps
 * the answer on the plant DB row, so reopening the screen costs no calls:
 * - Korean name from Trefle `common_names.ko` (ADR-0004 D2). Translation is
 *   not connected yet, so a species without one shows its scientific name.
 * - Perenual care values (D16). IDs above 3000 are outside the free range and
 *   are not requested; the screen offers S13 instead (approved 2026-11-12).
 * - Care AI (ADR-0005): fills the care fields Perenual leaves empty. Asked once
 *   per species; its values are stored with the model name and marked 'AI 생성'.
 * Only a well-formed answer is stored. Failures, caps, back-off and malformed
 * bodies leave the row unchecked so the next visit tries again.
 */

export type PreviewDeps = {
  species: SpeciesStore;
  perenual: PerenualAdapter | null;
  trefle: TrefleAdapter | null;
  /** Null when the care AI is not configured (ADR-0005 D1). */
  careAi: CareAiAdapter | null;
};

/** Finds a provider ID by exact scientific-name key (D10), never by a similar name. */
async function findId(
  adapter: PerenualAdapter | TrefleAdapter,
  record: SpeciesRecord,
): Promise<{ kind: "found"; id: number } | { kind: "none" } | { kind: "failed" }> {
  const answer = await adapter.search(record.scientificName);
  if (answer.kind !== "ok") return { kind: "failed" };
  const match = answer.species.find((item) => scientificNameKey(item.scientificName) === record.scientificNameKey);
  return match ? { kind: "found", id: match.providerId } : { kind: "none" };
}

async function ensureKoreanName(deps: PreviewDeps, record: SpeciesRecord): Promise<string | null> {
  const trefle = deps.trefle;
  if (record.koreanName || record.koreanNameCheckedAt || !trefle) return record.koreanName;
  let trefleId = record.trefleId;
  if (trefleId === null) {
    const found = await findId(trefle, record);
    if (found.kind === "failed") return null;
    if (found.kind === "none") {
      await deps.species.saveKoreanName(record.id, { koreanName: null, trefleId: null });
      return null;
    }
    trefleId = found.id;
  }
  const answer = await trefle.koreanName(trefleId);
  if (answer.kind !== "ok") return null;
  await deps.species.saveKoreanName(record.id, { koreanName: answer.koreanName, trefleId });
  return answer.koreanName;
}

/** Runs the Perenual lookup once; null when Perenual could not be asked now. */
async function lookUpCare(deps: PreviewDeps, record: SpeciesRecord): Promise<CareStatus | null> {
  const perenual = deps.perenual;
  if (!perenual) return null;
  let perenualId = record.perenualId;
  if (perenualId === null) {
    const found = await findId(perenual, record);
    if (found.kind === "failed") return null;
    if (found.kind === "none") {
      await deps.species.saveCare(record.id, { status: "not_found", perenualId: null, care: null });
      return "not_found";
    }
    perenualId = found.id;
  }
  const answer = await perenual.details(perenualId);
  if (answer.kind === "quota" || answer.kind === "unavailable") return null;
  const status: CareStatus = answer.kind === "ok" ? "available" : answer.kind;
  await deps.species.saveCare(record.id, {
    status,
    perenualId,
    care: answer.kind === "ok" ? answer.care : null,
  });
  return status;
}

/** Care fields the provider did not fill: only these are asked of the care AI (ADR-0005 D2). */
function missingFields(perenual: PerenualCare | null): CareField[] {
  const facts = perenual ? careFacts(perenual) : null;
  return AI_CARE_FIELDS.filter((field) => facts === null || facts[field] === null);
}

/**
 * The care AI values for the species. Asked once per species (ADR-0005 D2):
 * - a checked species reads its stored values;
 * - nothing is asked when no field is missing, or when the AI is not configured;
 * - only one request at a time may ask (claim, review P1): a request that loses
 *   the claim gets "busy" (shown as pending) and the winner stores the values;
 * - a failed call gives the claim back, so the next visit asks again;
 * - release and save only act while the claim is still this request's (claim
 *   id, review 2026-11-18): a request whose claim expired stores nothing;
 * - an empty answer is marked as asked and stores nothing.
 */
async function ensureAiCare(
  deps: PreviewDeps,
  record: SpeciesRecord,
  missing: CareField[],
): Promise<{ care: AiCare; model: string } | "busy" | null> {
  if (record.careAiCheckedAt) return (await deps.species.getAiCare(record.id)) ?? null;
  const ai = deps.careAi;
  if (!ai || missing.length === 0) return null;
  const claim = await deps.species.claimAiCare(record.id);
  if (!claim) return "busy";
  try {
    const answer = await ai.describe(record.scientificName, missing);
    if (answer.kind === "quota" || answer.kind === "unavailable") {
      await deps.species.releaseAiCare(record.id, claim);
      return null;
    }
    const care = answer.kind === "ok" ? answer.care : null;
    const stored = await deps.species.saveAiCare(record.id, claim, { care, model: care ? answer.model : null });
    // Our claim expired and another request took it: it stores the answer, not us.
    if (!stored) return "busy";
    return care ? { care, model: answer.model } : null;
  } catch (error) {
    await deps.species.releaseAiCare(record.id, claim);
    throw error;
  }
}

/**
 * Perenual and the care AI are looked up separately (review P1): a Perenual
 * outage no longer blocks the AI, and stored AI values are shown even while
 * Perenual is pending. Pending only when neither source has a value and
 * Perenual could not be asked, or another request is asking the AI right now
 * (its values will be there on the next visit, so "none" would be wrong).
 */
async function ensureCare(deps: PreviewDeps, record: SpeciesRecord): Promise<SpeciesPreview["care"]> {
  const status = record.careStatus ?? (await lookUpCare(deps, record));
  const perenual = status === "available" ? await deps.species.getCare(record.id) : null;
  const answer = await ensureAiCare(deps, record, missingFields(perenual));
  const ai = answer === "busy" ? null : answer;
  const facts = mergeCareFacts(perenual, ai?.care ?? null, ai?.model ?? null);
  if (facts) return { status: "available", facts };
  return status === null || answer === "busy" ? { status: "pending" } : { status: "none" };
}

export async function loadSpeciesPreview(deps: PreviewDeps, id: string): Promise<SpeciesPreview | null> {
  const record = await deps.species.getRecord(id);
  if (!record) return null;
  const [koreanName, care] = await Promise.all([ensureKoreanName(deps, record), ensureCare(deps, record)]);
  return {
    id: record.id,
    koreanName,
    scientificName: record.scientificName,
    imageUrl: record.imageUrl,
    imageCredit: record.imageCredit,
    care,
  };
}

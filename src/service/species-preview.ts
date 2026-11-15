import type { SpeciesStore } from "@/repo/species-repo";
import type { CareStatus, SpeciesPreview, SpeciesRecord } from "@/types/species";
import { FREE_RANGE_MAX_ID, type PerenualAdapter } from "./adapters/perenual";
import type { TrefleAdapter } from "./adapters/trefle";
import { careFacts } from "./care-labels";
import { scientificNameKey, type Metered } from "./species-search";

/**
 * S04-B 식물 정보 확인. Asks each provider at most once per species and keeps
 * the answer on the plant DB row, so reopening the screen costs no calls:
 * - Korean name from Trefle `common_names.ko` (ADR-0004 D2). Translation is
 *   not connected yet, so a species without one shows its scientific name.
 * - Perenual care values (D16). IDs above 3000 are outside the free range and
 *   are not requested; the screen offers S13 instead (approved 2026-11-12).
 * Provider failures leave the row unchecked so the next visit tries again.
 */

export type PreviewDeps = {
  species: SpeciesStore;
  perenual: Metered<PerenualAdapter> | null;
  trefle: Metered<TrefleAdapter> | null;
};

/** Finds a provider ID by exact scientific-name key (D10), never by a similar name. */
async function findId(
  provider: Metered<PerenualAdapter> | Metered<TrefleAdapter>,
  record: SpeciesRecord,
): Promise<{ kind: "found"; id: number } | { kind: "none" } | { kind: "failed" }> {
  if (!(await provider.meter.canCall())) return { kind: "failed" };
  const answer = await provider.adapter.search(record.scientificName);
  await provider.meter.record("search", answer);
  if (answer.kind !== "ok") return { kind: "failed" };
  const match = answer.species.find((item) => scientificNameKey(item.scientificName) === record.scientificNameKey);
  return match ? { kind: "found", id: match.providerId } : { kind: "none" };
}

async function ensureKoreanName(deps: PreviewDeps, record: SpeciesRecord): Promise<string | null> {
  if (record.koreanName || record.koreanNameCheckedAt || !deps.trefle) return record.koreanName;
  const trefle = deps.trefle;
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
  if (!(await trefle.meter.canCall())) return null;
  const answer = await trefle.adapter.koreanName(trefleId);
  await trefle.meter.record("korean_name", answer);
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
  // details() skips the call for IDs above the free range, so the gate is only for real calls.
  const needsCall = perenualId <= FREE_RANGE_MAX_ID;
  if (needsCall && !(await perenual.meter.canCall())) return null;
  const answer = await perenual.adapter.details(perenualId);
  await perenual.meter.record("details", answer);
  if (answer.kind === "quota" || answer.kind === "unavailable") return null;
  const status: CareStatus = answer.kind === "ok" ? "available" : answer.kind;
  await deps.species.saveCare(record.id, {
    status,
    perenualId,
    care: answer.kind === "ok" ? answer.care : null,
  });
  return status;
}

async function ensureCare(deps: PreviewDeps, record: SpeciesRecord): Promise<SpeciesPreview["care"]> {
  const status = record.careStatus ?? (await lookUpCare(deps, record));
  if (status === null) return { status: "pending" };
  if (status !== "available") return { status: "none" };
  const care = await deps.species.getCare(record.id);
  return care ? { status: "available", facts: careFacts(care) } : { status: "none" };
}

export async function loadSpeciesPreview(deps: PreviewDeps, id: string): Promise<SpeciesPreview | null> {
  const record = await deps.species.getRecord(id);
  if (!record) return null;
  const [koreanName, care] = await Promise.all([ensureKoreanName(deps, record), ensureCare(deps, record)]);
  return { id: record.id, koreanName, scientificName: record.scientificName, imageUrl: record.imageUrl, care };
}

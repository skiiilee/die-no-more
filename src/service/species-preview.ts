import type { SpeciesStore } from "@/repo/species-repo";
import type { CareStatus, SpeciesPreview, SpeciesRecord } from "@/types/species";
import type { PerenualAdapter } from "./adapters/perenual";
import type { TrefleAdapter } from "./adapters/trefle";
import { careFacts } from "./care-labels";
import { scientificNameKey } from "./species-search";

/**
 * S04-B 식물 정보 확인. Asks each provider at most once per species and keeps
 * the answer on the plant DB row, so reopening the screen costs no calls:
 * - Korean name from Trefle `common_names.ko` (ADR-0004 D2). Translation is
 *   not connected yet, so a species without one shows its scientific name.
 * - Perenual care values (D16). IDs above 3000 are outside the free range and
 *   are not requested; the screen offers S13 instead (approved 2026-11-12).
 * Only a well-formed answer is stored. Failures, caps, back-off and malformed
 * bodies leave the row unchecked so the next visit tries again.
 */

export type PreviewDeps = {
  species: SpeciesStore;
  perenual: PerenualAdapter | null;
  trefle: TrefleAdapter | null;
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

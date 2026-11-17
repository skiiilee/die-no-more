import type { IdentificationStore } from "@/repo/identification-repo";
import type { SpeciesStore } from "@/repo/species-repo";
import { PHOTO_RULES, type IdentificationView, type IdentifyAnswer, type StoredCandidate } from "@/types/photo";
import type { FoundSpecies } from "@/types/species";
import type { ImageProcessor } from "./adapters/image";
import type { PlantnetAdapter } from "./adapters/plantnet";
import { cleanPhotos } from "./photo-cleaning";
import { scientificNameKey } from "./species-search";

/**
 * Photo identification (03 §3-3, ADR-0003 D5–D7).
 * 1. Consent is required on every request (D5). Without it no photo is
 *    decoded and nothing is sent.
 * 2. The photos come with the request and are checked and re-encoded here
 *    (EXIF removed) before they are sent. They are never stored (D6, changed
 *    2026-11-18): S03-P keeps them in the browser tab for another try.
 * 3. A session is written as `processing` before the call, then `completed`
 *    or `failed`, so the request is on record either way.
 * 4. Each candidate is stored in the plant DB by scientific-name key (D10),
 *    so S04-B works the same as for name search. The candidates themselves
 *    stay in the session; nothing here is the user's choice of species.
 */

export type IdentifyDeps = {
  image: ImageProcessor;
  sessions: IdentificationStore;
  species: SpeciesStore;
  plantnet: PlantnetAdapter | null;
  now?: () => Date;
};

export const PHOTO_COUNT_MESSAGE = `사진을 1장에서 ${PHOTO_RULES.maxCount}장까지 골라 주세요.`;

async function markFailed(sessions: IdentificationStore, id: string, code: string): Promise<void> {
  try {
    await sessions.fail(id, code);
  } catch {
    // The session stays 'processing'; the answer to the user is the same.
    console.error("Could not record a failed identification");
  }
}

export async function identifyPhotos(
  deps: IdentifyDeps,
  input: { photos: Uint8Array[]; consent: boolean },
): Promise<IdentifyAnswer> {
  if (input.consent !== true) return { kind: "consent_required" };
  if (input.photos.length < 1 || input.photos.length > PHOTO_RULES.maxCount) {
    return { kind: "invalid", message: PHOTO_COUNT_MESSAGE };
  }
  if (!deps.plantnet) return { kind: "unavailable" };

  const cleaned = await cleanPhotos(deps.image, input.photos);
  if (!cleaned.ok) return { kind: "invalid", message: cleaned.message };

  let sessionId: string;
  try {
    sessionId = await deps.sessions.create();
  } catch {
    return { kind: "failed" };
  }

  const result = await deps.plantnet.identify(cleaned.photos);
  if (result.kind === "quota" || result.kind === "rejected" || result.kind === "unavailable") {
    await markFailed(deps.sessions, sessionId, result.kind);
    return { kind: result.kind };
  }

  try {
    const fetchedAt = (deps.now?.() ?? new Date()).toISOString();
    const candidates: StoredCandidate[] = [];
    if (result.kind === "ok") {
      // One entry per scientific-name key, in Pl@ntNet's order.
      const found = new Map<string, FoundSpecies>();
      const scores = new Map<string, number>();
      for (const item of result.species) {
        const key = scientificNameKey(item.scientificName);
        if (!key || found.has(key)) continue;
        found.set(key, {
          scientificNameKey: key,
          scientificName: item.scientificName.replace(/\s+/g, " ").trim(),
          commonNameEn: item.commonNameEn,
          family: item.family,
          perenualId: null,
          trefleId: null,
          imageUrl: item.imageUrl,
          imageCredit: item.imageCredit,
          source: "plantnet",
        });
        scores.set(key, item.score);
      }
      const ordered = [...found.values()];
      const { records } = await deps.species.saveFound(ordered);
      const byKey = new Map(records.map((record) => [record.scientificNameKey, record]));
      for (const item of ordered) {
        const record = byKey.get(item.scientificNameKey);
        if (!record) continue;
        candidates.push({
          rank: candidates.length + 1,
          score: scores.get(item.scientificNameKey) ?? 0,
          speciesId: record.id,
          scientificName: item.scientificName,
          imageUrl: item.imageUrl,
          imageCredit: item.imageCredit,
          provider: "plantnet",
          fetchedAt,
        });
      }
    }
    await deps.sessions.complete(sessionId, candidates, result.kind === "ok" ? result.version : null);
    return { kind: "ok", sessionId };
  } catch {
    await markFailed(deps.sessions, sessionId, "save_failed");
    return { kind: "failed" };
  }
}

/** Candidates kept in a session, skipping anything that is not the stored shape. */
export function parseStoredCandidates(value: unknown): StoredCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): StoredCandidate[] => {
    const c = item as Partial<StoredCandidate> | null;
    if (!c || typeof c.speciesId !== "string" || typeof c.rank !== "number" || typeof c.scientificName !== "string") {
      return [];
    }
    return [
      {
        rank: c.rank,
        score: typeof c.score === "number" ? c.score : 0,
        speciesId: c.speciesId,
        scientificName: c.scientificName,
        imageUrl: typeof c.imageUrl === "string" ? c.imageUrl : null,
        imageCredit: typeof c.imageCredit === "string" ? c.imageCredit : null,
        provider: "plantnet",
        fetchedAt: typeof c.fetchedAt === "string" ? c.fetchedAt : "",
      },
    ];
  });
}

/**
 * S04-A for a session. Korean names come from the plant DB as it is now, so a
 * name found later (S04-B, Trefle) shows here too. Scores are not returned.
 */
export async function loadIdentification(
  deps: { sessions: IdentificationStore; species: SpeciesStore },
  id: string,
): Promise<IdentificationView | null> {
  const session = await deps.sessions.get(id);
  if (!session) return null;
  if (session.status !== "completed") return { kind: session.status, sessionId: session.id };

  const stored = parseStoredCandidates(session.candidates).sort((a, b) => a.rank - b.rank);
  const records = await deps.species.getRecords(stored.map((c) => c.speciesId));
  const byId = new Map(records.map((record) => [record.id, record]));
  return {
    kind: "completed",
    sessionId: session.id,
    candidates: stored.flatMap((c) => {
      const record = byId.get(c.speciesId);
      if (!record) return [];
      return [
        {
          rank: c.rank,
          speciesId: c.speciesId,
          koreanName: record.koreanName,
          scientificName: record.scientificName,
          // The photo Pl@ntNet showed for this result, with its credit.
          imageUrl: c.imageUrl,
          imageCredit: c.imageUrl ? c.imageCredit : null,
        },
      ];
    }),
  };
}

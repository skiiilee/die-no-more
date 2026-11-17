/**
 * Photo upload and photo identification shapes (S03 → S03-P → S04-A),
 * ADR-0003 D4–D7. Shared by the browser (checks before upload) and the server
 * (checks again; the server result is what counts).
 */

export const PHOTO_RULES = {
  /** Photos per identification request (D4, Pl@ntNet allows 1–5). */
  maxCount: 5,
  /** Original file picked in the browser (D4). */
  maxOriginalBytes: 15 * 1024 * 1024,
  /** File after browser resizing, and after server re-encoding (D4, bucket limit). */
  maxUploadBytes: 3 * 1024 * 1024,
  /** Long side after resizing (D4). */
  longSide: 1600,
  /** JPEG quality used for re-encoding (D4). */
  jpegQuality: 0.85,
  /** Unattached photos are removed after this long (D6). */
  unattachedLifetimeMs: 24 * 60 * 60 * 1000,
} as const;

/** Types the browser may pick. HEIC only when the browser can decode it (D4). */
export const PICKABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

/** POST /api/uploads answer. */
export type UploadAnswer = { kind: "ok"; id: string } | { kind: "invalid"; message: string } | { kind: "failed" };

/**
 * POST /api/identifications answer.
 * - ok: candidates (possibly none) are stored in the session; open S04-A.
 * - consent_required: the request did not carry this request's consent (D5); nothing was sent.
 * - photos_missing: a photo was deleted or expired (D6); pick photos again.
 * - quota: Pl@ntNet's daily limit (ours or theirs) is used up; resets 09:00 KST (ADR-0004 D5).
 * - rejected: Pl@ntNet refused the photos as images.
 * - unavailable: Pl@ntNet could not be reached or is not configured.
 * - failed: our own storage failed.
 */
export type IdentifyAnswer =
  | { kind: "ok"; sessionId: string }
  | { kind: "invalid"; message: string }
  | { kind: "consent_required" }
  | { kind: "photos_missing" }
  | { kind: "quota" }
  | { kind: "rejected" }
  | { kind: "unavailable" }
  | { kind: "failed" };

/** One normalized Pl@ntNet result, before it is stored. */
export type IdentifiedSpecies = {
  /** 0–1 similarity score as Pl@ntNet gave it. Not a probability (04-api-design). */
  score: number;
  scientificName: string;
  commonNameEn: string | null;
  family: string | null;
  /** Pl@ntNet reference photo of the species (non-expiring bs.plantnet.org link). */
  imageUrl: string | null;
  /** Licence credit for that photo, e.g. "Author / Pl@ntNet, cc-by-sa". */
  imageCredit: string | null;
};

/**
 * Candidate as kept in identification_sessions.candidates (D6: normalized,
 * order and score kept, with provider and fetch time). Never the user's choice:
 * that is stored on the pot as species_id.
 */
export type StoredCandidate = {
  rank: number;
  score: number;
  speciesId: string;
  scientificName: string;
  imageUrl: string | null;
  imageCredit: string | null;
  provider: "plantnet";
  fetchedAt: string;
};

/** S04-A for a photo identification. Scores are not shown (03 §3-4). */
export type IdentificationView =
  | {
      kind: "completed";
      sessionId: string;
      candidates: {
        rank: number;
        speciesId: string;
        koreanName: string | null;
        scientificName: string;
        imageUrl: string | null;
        imageCredit: string | null;
      }[];
    }
  | { kind: "failed"; sessionId: string }
  | { kind: "processing"; sessionId: string };

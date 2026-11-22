import {
  HEALTH_LIMITS,
  NOTICED,
  SYMPTOMS,
  type ExplainAnswer,
  type HealthAnswer,
  type HealthCandidate,
  type HealthInput,
  type JudgeAnswer,
  type NoticedCode,
  type SymptomCode,
} from "@/types/health";
import { PHOTO_RULES } from "@/types/photo";
import type { HealthAiAdapter } from "./adapters/health-ai";
import type { HealthVisionAdapter } from "./adapters/health-ai-vision";
import type { ImageProcessor } from "./adapters/image";
import type { PlantnetHealthAdapter } from "./adapters/plantnet-health";
import { samePhotos, type HealthTokenPayload } from "./health-token";
import { cleanPhotos } from "./photo-cleaning";
import { PHOTO_COUNT_MESSAGE } from "./photo-identification";

/**
 * S07 건강 점검, first step (03 §4 F05, ADR-0003 D5, ADR-0006).
 * 1. Consent is required on every request (D5). Without it no photo is
 *    decoded and nothing is sent.
 * 2. Photos are checked and re-encoded (EXIF removed) and sent to Pl@ntNet
 *    only. Nothing is stored yet: saving to a pot (S07-S) is the next step.
 * 3. The answer lists possible causes, never a diagnosis. Nothing above the
 *    score bar is '판단 어려움' (unclear), not an error.
 * 4. The AI explanation is a second request, sent after S07-B is on screen
 *    (like ADR-0005 D6). It gets codes, names, symptoms, the time and the
 *    species; never photos and never the free-text notes (ADR-0006 D2).
 * 5. Both AI requests trust only the signed result token, never what the
 *    browser says Pl@ntNet answered (PR #23 review P2).
 */

export type HealthDeps = {
  image: ImageProcessor;
  plantnet: PlantnetHealthAdapter | null;
  /** Signs what Pl@ntNet answered for this user and these photos (health-token.ts). */
  sign: (result: { kind: "ok" | "unclear"; candidates: HealthCandidate[] }) => string;
  now?: () => Date;
};

export const NOTES_TOO_LONG = `추가 설명은 ${HEALTH_LIMITS.notes}자까지 쓸 수 있습니다.`;

const SYMPTOM_CODES: readonly string[] = SYMPTOMS.map((symptom) => symptom.code);
const NOTICED_CODES: readonly string[] = NOTICED.map((option) => option.code);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The S07-A fields as sent by the browser, checked. Unknown symptom codes are refused, not ignored. */
export function readHealthInput(raw: {
  symptoms: unknown;
  noticed: unknown;
  notes: unknown;
  potId: unknown;
}): { ok: true; input: HealthInput } | { ok: false; message: string } {
  const symptoms = Array.isArray(raw.symptoms) ? raw.symptoms : [];
  if (!symptoms.every((code) => typeof code === "string" && SYMPTOM_CODES.includes(code))) {
    return { ok: false, message: "증상 선택을 다시 확인해 주세요." };
  }
  const noticed = typeof raw.noticed === "string" && NOTICED_CODES.includes(raw.noticed) ? raw.noticed : "unknown";
  const notes = typeof raw.notes === "string" ? raw.notes.trim() : "";
  if (notes.length > HEALTH_LIMITS.notes) return { ok: false, message: NOTES_TOO_LONG };
  const potId = typeof raw.potId === "string" && UUID.test(raw.potId) ? raw.potId : null;
  return {
    ok: true,
    input: {
      symptoms: [...new Set(symptoms as SymptomCode[])],
      noticed: noticed as NoticedCode,
      notes,
      potId,
    },
  };
}

export async function checkHealth(
  deps: HealthDeps,
  request: { consent: boolean; photos: Uint8Array[]; speciesName: string | null },
): Promise<HealthAnswer> {
  if (request.consent !== true) return { kind: "consent_required" };
  if (request.photos.length < 1 || request.photos.length > PHOTO_RULES.maxCount) {
    return { kind: "invalid", message: PHOTO_COUNT_MESSAGE };
  }
  if (!deps.plantnet) return { kind: "unavailable" };

  const cleaned = await cleanPhotos(deps.image, request.photos);
  if (!cleaned.ok) return { kind: "invalid", message: cleaned.message };

  const result = await deps.plantnet.diagnose(cleaned.photos);
  const analyzedAt = (deps.now?.() ?? new Date()).toISOString();
  switch (result.kind) {
    case "ok": {
      const token = deps.sign({ kind: "ok", candidates: result.candidates });
      return { kind: "ok", candidates: result.candidates, analyzedAt, speciesName: request.speciesName, token };
    }
    case "none":
      return { kind: "unclear", analyzedAt, speciesName: request.speciesName, token: deps.sign({ kind: "unclear", candidates: [] }) };
    default:
      return { kind: result.kind };
  }
}

const label = (options: readonly { code: string; label: string }[], code: string) =>
  options.find((option) => option.code === code)?.label ?? code;

/**
 * The AI explanation of a result. `result` is the verified token payload (null
 * when the token was missing, tampered, another user's or expired); the causes
 * come from it, never from the request body (PR #23 review P2).
 */
export async function explainHealth(
  ai: HealthAiAdapter | null,
  request: { result: HealthTokenPayload | null; input: HealthInput; speciesName: string | null },
): Promise<ExplainAnswer> {
  const result = request.result;
  if (!result || result.k !== "ok" || result.c.length === 0) return { kind: "unavailable" };
  if (!ai) return { kind: "unavailable" };
  const answer = await ai.explain({
    candidates: result.c,
    symptoms: request.input.symptoms.map((code) => label(SYMPTOMS, code)),
    noticed: label(NOTICED, request.input.noticed),
    speciesName: request.speciesName,
  });
  if (answer.kind === "ok") return answer;
  return answer.kind === "none" ? { kind: "none" } : { kind: "unavailable" };
}

/**
 * S07-B when Pl@ntNet found nothing: the photo AI's reading (ADR-0006 D6).
 * Needs this request's own AI photo consent; without it no photo is decoded
 * or sent. The server enforces D6 itself (PR #23 review P2): only with a
 * verified 'unclear' token for exactly these photos. Photos are cleaned (EXIF
 * removed) first; notes are never sent.
 */
export async function judgeHealth(
  deps: { image: HealthDeps["image"]; vision: HealthVisionAdapter | null },
  request: {
    consent: boolean;
    photos: Uint8Array[];
    input: HealthInput;
    speciesName: string | null;
    result: HealthTokenPayload | null;
  },
): Promise<JudgeAnswer> {
  if (request.consent !== true) return { kind: "consent_required" };
  if (request.photos.length < 1 || request.photos.length > PHOTO_RULES.maxCount) {
    return { kind: "invalid", message: PHOTO_COUNT_MESSAGE };
  }
  if (!request.result) return { kind: "stale" };
  if (request.result.k !== "unclear" || !samePhotos(request.result, request.photos)) return { kind: "not_allowed" };
  if (!deps.vision) return { kind: "unavailable" };
  const cleaned = await cleanPhotos(deps.image, request.photos);
  if (!cleaned.ok) return { kind: "invalid", message: cleaned.message };
  const answer = await deps.vision.judge({
    photos: cleaned.photos,
    symptoms: request.input.symptoms.map((code) => label(SYMPTOMS, code)),
    noticed: label(NOTICED, request.input.noticed),
    speciesName: request.speciesName,
  });
  return answer;
}

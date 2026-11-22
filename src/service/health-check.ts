import {
  HEALTH_LIMITS,
  NOTICED,
  SYMPTOMS,
  type ExplainAnswer,
  type HealthAnswer,
  type HealthCandidate,
  type HealthInput,
  type NoticedCode,
  type SymptomCode,
} from "@/types/health";
import { PHOTO_RULES } from "@/types/photo";
import type { HealthAiAdapter } from "./adapters/health-ai";
import type { ImageProcessor } from "./adapters/image";
import type { PlantnetHealthAdapter } from "./adapters/plantnet-health";
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
 */

export type HealthDeps = { image: ImageProcessor; plantnet: PlantnetHealthAdapter | null; now?: () => Date };

export const NOTES_TOO_LONG = `추가 설명은 ${HEALTH_LIMITS.notes}자까지 쓸 수 있습니다.`;

const SYMPTOM_CODES: readonly string[] = SYMPTOMS.map((symptom) => symptom.code);
const NOTICED_CODES: readonly string[] = NOTICED.map((option) => option.code);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[0-9A-Z]{3,10}$/;

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
    case "ok":
      return { kind: "ok", candidates: result.candidates, analyzedAt, speciesName: request.speciesName };
    case "none":
      return { kind: "unclear", analyzedAt, speciesName: request.speciesName };
    default:
      return { kind: result.kind };
  }
}

/** Candidates sent back by the browser for the explanation, checked again (they are only text to the AI). */
export function readCandidates(value: unknown): HealthCandidate[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > HEALTH_LIMITS.candidates) return null;
  const candidates: HealthCandidate[] = [];
  for (const item of value) {
    const candidate = item as Partial<HealthCandidate> | null;
    if (
      typeof candidate?.code !== "string" ||
      !CODE.test(candidate.code) ||
      typeof candidate.name !== "string" ||
      candidate.name.length > 120 ||
      typeof candidate.score !== "number" ||
      !Number.isFinite(candidate.score)
    ) {
      return null;
    }
    candidates.push({ code: candidate.code, name: candidate.name, score: candidate.score });
  }
  return candidates;
}

const label = (options: readonly { code: string; label: string }[], code: string) =>
  options.find((option) => option.code === code)?.label ?? code;

export async function explainHealth(
  ai: HealthAiAdapter | null,
  request: { candidates: HealthCandidate[]; input: HealthInput; speciesName: string | null },
): Promise<ExplainAnswer> {
  if (!ai) return { kind: "unavailable" };
  const answer = await ai.explain({
    candidates: request.candidates,
    symptoms: request.input.symptoms.map((code) => label(SYMPTOMS, code)),
    noticed: label(NOTICED, request.input.noticed),
    speciesName: request.speciesName,
  });
  if (answer.kind === "ok") return answer;
  return answer.kind === "none" ? { kind: "none" } : { kind: "unavailable" };
}

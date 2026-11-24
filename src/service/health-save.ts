import type { HealthStore } from "@/repo/health-repo";
import type { PotPhotoStore } from "@/repo/pot-photo-repo";
import type { HealthInput, SaveAnswer } from "@/types/health";
import type { ImageProcessor } from "./adapters/image";
import { resultDigest, samePhotos, type AiAnswerPayload, type HealthTokenPayload } from "./health-token";
import { cleanPhotos } from "./photo-cleaning";

/**
 * S07-S 이 화분에 결과 저장 (ADR-0003 D6, ADR-0006 D5, owner decision
 * 2026-11-24: AI texts are saved with the result). Only what the server
 * signed is stored:
 * - the Pl@ntNet result and the exact photos come from the result token;
 * - an AI text is saved only with its own signature for that same result.
 * The photos are re-encoded (EXIF removed), uploaded to the private bucket,
 * then the check, photo rows and links are written in one transaction. If
 * that fails, the uploaded files are removed in the same request.
 */

export const SAVE_MESSAGES = {
  noPot: "결과를 저장할 화분을 골라 주세요.",
} as const;

/** Written with every saved check; the screen says the same (03 §4). */
export const UNCERTAINTY = "사진만으로 원인을 확정할 수 없음";

export type HealthSaveDeps = {
  image: ImageProcessor;
  photos: Pick<PotPhotoStore, "userId" | "upload" | "removeObject">;
  health: Pick<HealthStore, "save">;
  /** True when the pot is the user's own (RLS); throws when the lookup fails. */
  potExists(potId: string): Promise<boolean>;
  newId(): string;
};

/** A signed AI text: the verified payload, absent, or present but not valid. */
export type SignedAi = AiAnswerPayload | null | "invalid";

export async function saveHealthCheck(
  deps: HealthSaveDeps,
  request: {
    result: HealthTokenPayload | null;
    /** The result token as sent, to tie each AI text to this exact result. */
    resultToken: string;
    photos: Uint8Array[];
    input: HealthInput;
    explanation: SignedAi;
    judgement: SignedAi;
  },
): Promise<SaveAnswer> {
  const { result, explanation, judgement } = request;
  if (!result) return { kind: "stale" };
  if (!samePhotos(result, request.photos)) return { kind: "not_allowed" };
  // An AI text must be the kind that belongs to this result, signed for it.
  if (explanation === "invalid" || judgement === "invalid") return { kind: "not_allowed" };
  const digest = resultDigest(request.resultToken);
  if ((explanation && explanation.r !== digest) || (judgement && judgement.r !== digest)) return { kind: "not_allowed" };
  if (explanation && (explanation.k !== "explain" || result.k !== "ok")) return { kind: "not_allowed" };
  if (judgement && (judgement.k !== "judge" || result.k !== "unclear")) return { kind: "not_allowed" };

  const potId = request.input.potId;
  if (!potId) return { kind: "invalid", message: SAVE_MESSAGES.noPot };
  try {
    if (!(await deps.potExists(potId))) return { kind: "not_found" };
  } catch {
    return { kind: "failed" };
  }
  const userId = await deps.photos.userId();
  if (!userId) return { kind: "failed" };

  const cleaned = await cleanPhotos(deps.image, request.photos);
  if (!cleaned.ok) return { kind: "invalid", message: cleaned.message };

  const uploaded: string[] = [];
  const removeUploaded = () => Promise.all(uploaded.map((path) => deps.photos.removeObject(path).catch(() => false)));
  for (const photo of cleaned.photos) {
    const path = `${userId}/${deps.newId()}.jpg`;
    const ok = await deps.photos.upload(path, photo).catch(() => false);
    if (!ok) {
      await removeUploaded();
      return { kind: "failed" };
    }
    uploaded.push(path);
  }

  const aiModel = explanation?.m ?? judgement?.m ?? null;
  const checkId = await deps.health
    .save(
      potId,
      {
        outcome: result.k === "ok" ? "found" : "unclear",
        causes: result.c,
        symptoms: request.input.symptoms,
        noticed: request.input.noticed,
        notes: request.input.notes || null,
        analyzed_at: result.t,
        uncertainty: UNCERTAINTY,
        ai_explanation: explanation?.k === "explain" ? explanation.d : null,
        ai_judgement: judgement?.k === "judge" ? judgement.d : null,
        ai_model: aiModel,
      },
      uploaded,
    )
    .catch(() => null);
  if (!checkId) {
    await removeUploaded();
    return { kind: "failed" };
  }
  return { kind: "saved", potId, checkId };
}

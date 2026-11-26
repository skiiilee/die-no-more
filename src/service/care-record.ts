import type { CareRecordRow, CareStore } from "@/repo/care-repo";
import type { PotPhotoStore } from "@/repo/pot-photo-repo";
import {
  CARE_ACTIONS,
  CARE_LIMITS,
  SOIL_STATES,
  type CareAction,
  type CareActionCode,
  type CareInput,
  type CareSaveAnswer,
  type SoilStateCode,
} from "@/types/care";
import { PHOTO_RULES } from "@/types/photo";
import type { ImageProcessor } from "./adapters/image";
import { cleanPhotos } from "./photo-cleaning";
import { uploadTracked } from "./tracked-upload";

/**
 * S08 관리 기록 저장 (03 §7 F08–F09, wireframe §7). One form, one save:
 * - only what was entered is stored; each ticked activity is one care log,
 *   the soil state and observation text one observation (a soil check is
 *   never a watering), plus 0–5 photos and the common memo;
 * - an empty form is not saved;
 * - the browser sends one key per form, so a double submit or a retry after a
 *   lost answer returns the record saved first (the database enforces it too);
 * - photos are re-encoded (EXIF removed) and uploaded the way S07-S does
 *   (tracked-upload.ts), then everything is written in one transaction.
 */

export const CARE_MESSAGES = {
  noPot: "기록할 화분을 골라 주세요.",
  time: "수행 날짜와 시간을 확인해 주세요.",
  future: "아직 오지 않은 시간은 기록할 수 없습니다.",
  tooOld: `${CARE_LIMITS.pastDays}일보다 오래된 날짜는 기록할 수 없습니다.`,
  water: `물의 양은 1~${CARE_LIMITS.waterMaxMl.toLocaleString("ko-KR")}ml 사이의 숫자로 입력해 주세요.`,
  actionNotes: `활동 메모는 ${CARE_LIMITS.actionNotes}자까지 쓸 수 있습니다.`,
  observation: `관찰 내용은 ${CARE_LIMITS.observation}자까지 쓸 수 있습니다.`,
  notes: `공통 메모는 ${CARE_LIMITS.notes}자까지 쓸 수 있습니다.`,
  photos: `사진은 ${PHOTO_RULES.maxCount}장까지 첨부할 수 있습니다.`,
  empty: "기록할 항목을 하나 이상 입력해 주세요.",
  form: "기록 양식이 올바르지 않습니다. 화면을 새로 열어 다시 입력해 주세요.",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const ACTION_CODES: readonly string[] = CARE_ACTIONS.map((action) => action.code);
const SOIL_CODES: readonly string[] = SOIL_STATES.map((state) => state.code);

type Raw = FormDataEntryValue | null | undefined;

export type CareFields = {
  potId: Raw;
  /** "YYYY-MM-DDTHH:mm", Korean time (the screen's date and time field). */
  recordedAt: Raw;
  actions: Raw[];
  waterMl: Raw;
  actionNotes: Partial<Record<CareActionCode, Raw>>;
  soilState: Raw;
  observation: Raw;
  notes: Raw;
};

const text = (value: Raw) => (typeof value === "string" ? value.trim() : "");

/** The S08 fields, checked. `now` bounds the date: not in the future, not older than a year. */
export function readCareInput(
  fields: CareFields,
  now: Date,
): { ok: true; input: CareInput } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  const potId = text(fields.potId);
  if (!UUID.test(potId)) return fail(CARE_MESSAGES.noPot);

  const local = text(fields.recordedAt);
  const at = LOCAL_TIME.test(local) ? new Date(`${local}:00+09:00`) : null;
  if (!at || Number.isNaN(at.getTime())) return fail(CARE_MESSAGES.time);
  if (at.getTime() > now.getTime() + CARE_LIMITS.futureSkewMinutes * 60_000) return fail(CARE_MESSAGES.future);
  if (at.getTime() < now.getTime() - CARE_LIMITS.pastDays * 86_400_000) return fail(CARE_MESSAGES.tooOld);

  const ticked = new Set(fields.actions.map(text).filter((code) => ACTION_CODES.includes(code)));
  const actions: CareAction[] = [];
  for (const { code } of CARE_ACTIONS) {
    if (!ticked.has(code)) continue;
    let amountMl: number | null = null;
    let notes = "";
    if (code === "water") {
      const amount = text(fields.waterMl);
      if (amount !== "") {
        if (!/^\d+$/.test(amount)) return fail(CARE_MESSAGES.water);
        amountMl = Number(amount);
        if (amountMl < 1 || amountMl > CARE_LIMITS.waterMaxMl) return fail(CARE_MESSAGES.water);
      }
    } else {
      notes = text(fields.actionNotes[code]);
      if (notes.length > CARE_LIMITS.actionNotes) return fail(CARE_MESSAGES.actionNotes);
    }
    actions.push({ type: code, amountMl, notes });
  }

  const soil = text(fields.soilState);
  const soilState = SOIL_CODES.includes(soil) ? (soil as SoilStateCode) : null;
  const observation = text(fields.observation);
  if (observation.length > CARE_LIMITS.observation) return fail(CARE_MESSAGES.observation);
  const notes = text(fields.notes);
  if (notes.length > CARE_LIMITS.notes) return fail(CARE_MESSAGES.notes);

  return { ok: true, input: { potId, recordedAt: at.toISOString(), actions, soilState, observation, notes } };
}

/** Nothing entered at all (03 §7: not saved). */
export function isEmptyRecord(input: CareInput, photoCount: number): boolean {
  return input.actions.length === 0 && !input.soilState && !input.observation && !input.notes && photoCount === 0;
}

/** What the database function receives: only the parts that were entered. */
export function recordRow(input: CareInput): CareRecordRow {
  return {
    recorded_at: input.recordedAt,
    notes: input.notes || null,
    actions: input.actions.map((action) => ({ type: action.type, amount_ml: action.amountMl, notes: action.notes || null })),
    observation:
      input.soilState || input.observation ? { soil_state: input.soilState, notes: input.observation || null } : null,
  };
}

export type CareSaveDeps = {
  image: ImageProcessor;
  photos: Pick<PotPhotoStore, "userId" | "upload" | "removeObject" | "markDeletion">;
  care: Pick<CareStore, "findByKey" | "planCleanup" | "save">;
  /** True when the pot is the user's own (RLS); throws when the lookup fails. */
  potExists(potId: string): Promise<boolean>;
  newId(): string;
};

export async function saveCareRecord(
  deps: CareSaveDeps,
  request: { key: string; input: CareInput; photos: Uint8Array[] },
): Promise<CareSaveAnswer> {
  const { key, input, photos } = request;
  if (!UUID.test(key)) return { kind: "invalid", message: CARE_MESSAGES.form };
  if (photos.length > PHOTO_RULES.maxCount) return { kind: "invalid", message: CARE_MESSAGES.photos };
  if (isEmptyRecord(input, photos.length)) return { kind: "invalid", message: CARE_MESSAGES.empty };

  try {
    // Saved before (double submit, retry after a lost answer): that record, no new upload.
    const existing = await deps.care.findByKey(key);
    if (existing) return { kind: "saved", ...existing };
    if (!(await deps.potExists(input.potId))) return { kind: "not_found" };
  } catch {
    return { kind: "failed" };
  }

  let upload: { paths: string[]; cleanupRequest: string | null; cleanUp(): Promise<void> } = {
    paths: [],
    cleanupRequest: null,
    cleanUp: async () => undefined,
  };
  if (photos.length > 0) {
    const userId = await deps.photos.userId();
    if (!userId) return { kind: "failed" };
    const cleaned = await cleanPhotos(deps.image, photos);
    if (!cleaned.ok) return { kind: "invalid", message: cleaned.message };
    const uploaded = await uploadTracked(
      { photos: deps.photos, planCleanup: deps.care.planCleanup, newId: deps.newId },
      userId,
      cleaned.photos,
      "unsaved care record photo",
    );
    if (!uploaded) return { kind: "failed" };
    upload = uploaded;
  }

  const saved = await deps.care
    .save(input.potId, recordRow(input), upload.paths, { idempotencyKey: key, cleanupRequest: upload.cleanupRequest })
    .catch(() => null);
  if (!saved) {
    await upload.cleanUp();
    return { kind: "failed" };
  }
  // A concurrent request saved the same form first: keep that one, drop these files.
  if (!saved.created) await upload.cleanUp();
  return { kind: "saved", potId: saved.potId, recordId: saved.recordId };
}

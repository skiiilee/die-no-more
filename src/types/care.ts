/**
 * S08 관리 기록 shapes (03 §7 F08–F09, wireframe §7). Shared by the browser
 * and the server. One save holds only what was entered: each ticked activity
 * becomes one care log, the soil state and observation text one observation,
 * plus optional photos and a common memo. A soil check is never a watering.
 */

type Option<T extends string> = { code: T; label: string };

/** Activities the user actually did (one log each when ticked). */
export const CARE_ACTIONS = [
  { code: "water", label: "실제 물주기" },
  { code: "fertilize", label: "비료 주기" },
  { code: "repot", label: "분갈이" },
  { code: "prune", label: "가지치기" },
] as const satisfies readonly Option<string>[];
export type CareActionCode = (typeof CARE_ACTIONS)[number]["code"];

/** Short names for lists (S06 최근 관리 기록). */
export const CARE_ACTION_SHORT: Record<CareActionCode, string> = {
  water: "물주기",
  fertilize: "비료",
  repot: "분갈이",
  prune: "가지치기",
};

/** 흙 상태 확인 (an observation, not a watering). */
export const SOIL_STATES = [
  { code: "dry", label: "마름" },
  { code: "moist", label: "적당" },
  { code: "wet", label: "젖음" },
  { code: "unknown", label: "잘 모르겠음" },
] as const satisfies readonly Option<string>[];
export type SoilStateCode = (typeof SOIL_STATES)[number]["code"];

export const CARE_LIMITS = {
  /** 물의 양 in ml (owner decision 2026-11-26: a number in ml). */
  waterMaxMl: 10_000,
  /** 비료/분갈이/가지치기 메모. */
  actionNotes: 200,
  /** 잎·해충·환경 관찰. */
  observation: 500,
  /** 공통 메모. */
  notes: 500,
  /** How far back a record may be dated. */
  pastDays: 365,
  /** Clock difference allowed for "not in the future". */
  futureSkewMinutes: 10,
} as const;

/** One ticked activity. `amountMl` is for watering only. */
export type CareAction = { type: CareActionCode; amountMl: number | null; notes: string };

export type CareInput = {
  potId: string;
  /** When it was done, as an ISO time. */
  recordedAt: string;
  actions: CareAction[];
  soilState: SoilStateCode | null;
  observation: string;
  notes: string;
};

export type CareSaveAnswer =
  | { kind: "saved"; potId: string; recordId: string }
  | { kind: "invalid"; message: string }
  | { kind: "not_found" }
  | { kind: "failed" };

/** A saved record as S06 lists it. */
export type CareRecordSummary = {
  id: string;
  recordedAt: string;
  actions: CareActionCode[];
  soilState: SoilStateCode | null;
  hasObservation: boolean;
  photoCount: number;
  hasNotes: boolean;
};

/** A saved record with everything entered and short-lived photo links. */
export type SavedCareRecord = {
  id: string;
  recordedAt: string;
  actions: CareAction[];
  soilState: SoilStateCode | null;
  observation: string | null;
  notes: string | null;
  photos: { id: string; url: string | null }[];
};

/** The items of a summary in words, e.g. "물주기 · 비료 · 흙 마름 · 사진 2장". */
export function careSummaryText(record: CareRecordSummary): string {
  const parts: string[] = record.actions.map((code) => CARE_ACTION_SHORT[code]);
  const soil = SOIL_STATES.find((state) => state.code === record.soilState);
  if (soil) parts.push(`흙 ${soil.label}`);
  if (record.hasObservation) parts.push("관찰");
  if (record.photoCount > 0) parts.push(`사진 ${record.photoCount}장`);
  if (record.hasNotes) parts.push("메모");
  return parts.join(" · ");
}

/**
 * S07 건강 점검 shapes (03 §4 F05, ADR-0003 D5, ADR-0006). Shared by the
 * browser and the server. Photos travel only to Pl@ntNet, inside the request,
 * after this request's consent; nothing is stored in this first step (saving
 * to a pot, S07-S, comes next). Results are never a diagnosis: Pl@ntNet gives
 * possible causes, and the AI may only explain those (ADR-0006).
 */

type Option<T extends string> = { code: T; label: string };

/** Symptoms the user can tick on S07-A (wireframe §6). Several may be ticked. */
export const SYMPTOMS = [
  { code: "browning", label: "잎 갈변" },
  { code: "spots", label: "반점" },
  { code: "wilting", label: "시듦" },
  { code: "pests", label: "해충 의심" },
  { code: "other", label: "기타 / 잘 모르겠음" },
] as const satisfies readonly Option<string>[];
export type SymptomCode = (typeof SYMPTOMS)[number]["code"];

/** When the symptom was first noticed (wireframe §6 "발견 시점"). */
export const NOTICED = [
  { code: "unknown", label: "알 수 없음" },
  { code: "today", label: "오늘" },
  { code: "this_week", label: "이번 주" },
  { code: "over_a_week", label: "1주 이상 전" },
] as const satisfies readonly Option<string>[];
export type NoticedCode = (typeof NOTICED)[number]["code"];

export const HEALTH_LIMITS = {
  /** 추가 설명 on S07-A. */
  notes: 300,
  /** Possible causes shown on S07-B (03 §4: 1–3). */
  candidates: 3,
} as const;

/**
 * Pl@ntNet scores below this are not shown as a possible cause. Provisional
 * until the live check with the owner's photos (ADR-0006 D4).
 */
export const HEALTH_MIN_SCORE = 0.05;

/** What the user told us on S07-A, besides the photos. */
export type HealthInput = {
  symptoms: SymptomCode[];
  noticed: NoticedCode;
  notes: string;
  /** The pot the photos are of, when one was chosen. Its species helps the AI explanation. */
  potId: string | null;
};

/** One possible cause from Pl@ntNet. `name` is Pl@ntNet's English label (ADR-0004 D3 until translation). */
export type HealthCandidate = { code: string; name: string; score: number };

/**
 * POST /api/health-checks answer.
 * - ok: possible causes, best first (at most 3, score ≥ HEALTH_MIN_SCORE).
 * - unclear: Pl@ntNet answered but nothing passed the bar: '판단 어려움'.
 * - invalid / consent_required / quota / rejected / unavailable: as for identification.
 */
export type HealthAnswer =
  | { kind: "ok"; candidates: HealthCandidate[]; analyzedAt: string; speciesName: string | null }
  | { kind: "unclear"; analyzedAt: string; speciesName: string | null }
  | { kind: "invalid"; message: string }
  | { kind: "consent_required" }
  | { kind: "quota" }
  | { kind: "rejected" }
  | { kind: "unavailable" };

/** The AI explanation of a result (ADR-0006). Every text is checked before it is shown. */
export type HealthExplanation = {
  /** Plain Korean explanation of each candidate, by Pl@ntNet code. Only codes Pl@ntNet gave. */
  causes: { code: string; text: string }[];
  /** Things the user can check themselves (soil, watering, leaf undersides…). */
  checks: string[];
  /** Safe next steps: observation and environment only, never chemicals or treatments. */
  actions: string[];
  model: string;
};

/** POST /api/health-checks/explain answer. Anything but ok leaves S07-B with the fixed checks only. */
export type ExplainAnswer = { kind: "ok"; explanation: HealthExplanation } | { kind: "none" } | { kind: "unavailable" };

/** Checks shown for every result: things to look at, never a treatment (wireframe §6 "먼저 확인할 내용"). */
const BASE_CHECKS = [
  "흙 상태를 손가락으로 2~3cm 깊이까지 직접 확인하기",
  "최근에 물을 언제, 얼마나 줬는지 떠올리기",
  "잎 뒷면과 줄기를 가까이 보고, 필요하면 사진을 더 찍어 두기",
] as const;

/** Extra checks for the symptoms the user ticked. Observation only. */
const SYMPTOM_CHECKS: Record<SymptomCode, string | null> = {
  browning: "갈변이 잎 끝·가장자리에만 있는지, 새로 난 잎에도 생기는지 보기",
  spots: "며칠 간격으로 같은 잎을 찍어 반점이 커지거나 늘어나는지 비교하기",
  wilting: "화분 밑 물빠짐 구멍이 막히지 않았는지, 흙이 계속 젖어 있지 않은지 보기",
  pests: "잎 뒷면·잎겨드랑이에 작은 벌레, 끈적임, 거미줄 같은 실이 있는지 보기",
  other: null,
};

/** The fixed checks for S07-B, in display order, without duplicates. */
export function fixedChecks(symptoms: readonly SymptomCode[]): string[] {
  const extra = SYMPTOMS.map((symptom) => symptom.code)
    .filter((code) => symptoms.includes(code))
    .map((code) => SYMPTOM_CHECKS[code])
    .filter((check): check is string => check !== null);
  return [...BASE_CHECKS, ...extra];
}

/** Safe next steps shown for every result: observation and environment only. */
export const FIXED_ACTIONS = [
  "며칠 동안 같은 잎을 같은 자리에서 사진으로 남겨 변화를 비교하기",
  "증상이 번지는 것 같으면 다른 화분과 조금 떨어뜨려 두기",
] as const;

/**
 * The photo AI's own reading when Pl@ntNet found nothing (ADR-0006 D6). Never
 * a diagnosis: visible signs, at most 3 possible causes as possibilities, and
 * checks and safe steps, every text checked like the explanation.
 */
export type AiJudgement = {
  /** What the AI says it can see in the photos. */
  signs: string[];
  /** Possible causes in Korean, as possibilities. */
  causes: { name: string; reason: string }[];
  checks: string[];
  actions: string[];
  model: string;
};

/**
 * POST /api/health-checks/ai-judge answer.
 * - ok: the AI's reading.
 * - none: the AI saw nothing it could say safely ('판단 어려움' stays).
 * - consent_required: the request did not carry this request's AI photo consent.
 */
export type JudgeAnswer =
  | { kind: "ok"; judgement: AiJudgement }
  | { kind: "none" }
  | { kind: "invalid"; message: string }
  | { kind: "consent_required" }
  | { kind: "quota" }
  | { kind: "unavailable" };

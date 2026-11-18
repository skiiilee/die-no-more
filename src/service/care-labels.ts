import { AI_CARE_FIELDS, type AiCare, type CareField, type CareFacts, type PerenualCare } from "@/types/species";

/**
 * Korean labels for Perenual's coded care values (S04-B). These are fixed
 * code → label tables, like the S05 choices, not translations. A value not in
 * a table is shown as Perenual gave it, never guessed (owner decision
 * 2026-11-15). The description stays in English until translation is
 * connected (ADR-0004 D2/D3).
 */

const CARE_LEVEL: Record<string, string> = {
  low: "쉬움",
  easy: "쉬움",
  medium: "보통",
  moderate: "보통",
  high: "어려움",
  hard: "어려움",
};

const SUNLIGHT: Record<string, string> = {
  "full sun": "직사광선",
  "sun-part shade": "직사광선~반그늘",
  "part sun/part shade": "반양지",
  "part shade": "반그늘",
  "filtered shade": "밝은 간접광",
  "full shade": "그늘",
  "deep shade": "그늘",
};

const WATERING: Record<string, string> = {
  frequent: "자주",
  average: "보통",
  minimum: "적게",
  none: "거의 필요 없음",
};

function label(table: Record<string, string>, value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? (table[trimmed.toLowerCase()] ?? trimmed) : null;
}

export function careFacts(care: PerenualCare): CareFacts {
  const light = [...new Set(care.sunlight.map((item) => label(SUNLIGHT, item)).filter((item) => item !== null))];
  const benchmark = care.wateringBenchmark;
  return {
    careLevel: label(CARE_LEVEL, care.careLevel),
    light: light.length > 0 ? light.join(", ") : null,
    watering: label(WATERING, care.watering),
    wateringInterval: benchmark
      ? benchmark.min === benchmark.max
        ? `${benchmark.min}일`
        : `${benchmark.min}~${benchmark.max}일`
      : null,
    temperature: null,
    soil: null,
    fertilizer: null,
    description: care.description,
    aiFields: [],
    aiModel: null,
  };
}

type Values = Omit<CareFacts, "aiFields" | "aiModel">;

const EMPTY_VALUES: Values = {
  careLevel: null,
  light: null,
  watering: null,
  wateringInterval: null,
  temperature: null,
  soil: null,
  fertilizer: null,
  description: null,
};

function aiValues(ai: AiCare): Values {
  const benchmark = ai.wateringBenchmark;
  return {
    careLevel: ai.careLevel,
    light: ai.light,
    watering: ai.watering,
    wateringInterval: benchmark
      ? benchmark.min === benchmark.max
        ? `${benchmark.min}일`
        : `${benchmark.min}~${benchmark.max}일`
      : null,
    temperature: ai.temperature,
    soil: ai.soil,
    fertilizer: ai.fertilizer,
    description: ai.description,
  };
}

/**
 * Fills the fields `base` left empty with the care AI values (ADR-0005 D2, D5)
 * and adds them to `aiFields`; values already in `base` are kept. Null when
 * neither has any value.
 */
export function fillCareFacts(base: CareFacts | null, ai: AiCare | null, aiModel: string | null): CareFacts | null {
  const a: Values = ai ? aiValues(ai) : EMPTY_VALUES;
  const merged: Values = { ...EMPTY_VALUES };
  const aiFields: CareField[] = [...(base?.aiFields ?? [])];
  for (const field of AI_CARE_FIELDS) {
    merged[field] = base?.[field] ?? null;
    if (merged[field] === null && a[field] !== null) {
      merged[field] = a[field];
      aiFields.push(field);
    }
  }
  const hasAny = AI_CARE_FIELDS.some((field) => merged[field] !== null);
  if (!hasAny) return null;
  return { ...merged, aiFields, aiModel: aiFields.length > 0 ? (aiModel ?? base?.aiModel ?? null) : null };
}

/** Perenual values first; the care AI fills only the fields Perenual left empty. */
export function mergeCareFacts(perenual: PerenualCare | null, ai: AiCare | null, aiModel: string | null): CareFacts | null {
  return fillCareFacts(perenual ? careFacts(perenual) : null, ai, aiModel);
}

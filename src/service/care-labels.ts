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
 * Perenual values first; the care AI fills only the fields Perenual left empty
 * (ADR-0005 D2, D5), and those fields are listed in `aiFields`. Null when
 * neither source has any value.
 */
export function mergeCareFacts(perenual: PerenualCare | null, ai: AiCare | null, aiModel: string | null): CareFacts | null {
  const p: Values = perenual ? careFacts(perenual) : EMPTY_VALUES;
  const a: Values = ai ? aiValues(ai) : EMPTY_VALUES;
  const merged: Values = { ...p };
  const aiFields: CareField[] = [];
  for (const field of AI_CARE_FIELDS) {
    if (merged[field] === null && a[field] !== null) {
      merged[field] = a[field];
      aiFields.push(field);
    }
  }
  const hasAny = AI_CARE_FIELDS.some((field) => merged[field] !== null);
  return hasAny ? { ...merged, aiFields, aiModel: aiFields.length > 0 ? aiModel : null } : null;
}

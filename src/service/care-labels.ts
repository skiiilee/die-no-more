import type { CareFacts, PerenualCare } from "@/types/species";

/**
 * Korean labels for Perenual's coded care values (S04-B). These are fixed
 * code → label tables, like the S05 choices, not translations: an unknown
 * code shows '정보 없음' instead of a guessed label (03 §3-6, no invented data).
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
  return value ? (table[value.trim().toLowerCase()] ?? null) : null;
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
  };
}

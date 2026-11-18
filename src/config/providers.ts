import "server-only";

/**
 * Provider keys and our own daily caps (ADR-0003 D8, ADR-0004 D5).
 * Server-only: never expose through NEXT_PUBLIC_ variables. A provider whose
 * key is missing is treated as unavailable; the app keeps working without it.
 */
export type ProviderAccess = { key: string; dailyLimit: number };

/**
 * Care AI (ADR-0005): any OpenAI-compatible chat endpoint. The base URL, key
 * and model name all come from the environment, so the provider can change
 * without a code change. All three are needed; otherwise the feature is off.
 */
export type CareAiAccess = ProviderAccess & { baseUrl: string; model: string };

export type ProviderConfig = {
  plantnet: ProviderAccess | null;
  perenual: ProviderAccess | null;
  trefle: ProviderAccess | null;
  careAi: CareAiAccess | null;
};

type Env = Record<string, string | undefined>;

/** Documented defaults from .env.example, used when a limit is unset or invalid. */
const DEFAULT_LIMITS = { plantnet: 450, perenual: 90, trefle: 300, careAi: 50 } as const;

function limit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function access(key: string | undefined, rawLimit: string | undefined, fallback: number): ProviderAccess | null {
  const trimmed = key?.trim();
  return trimmed ? { key: trimmed, dailyLimit: limit(rawLimit, fallback) } : null;
}

/** https base URL without a trailing slash, or null. */
function httpsBase(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? trimmed.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

function careAiAccess(env: Env): CareAiAccess | null {
  const base = access(env.CARE_AI_API_KEY, env.CARE_AI_DAILY_LIMIT, DEFAULT_LIMITS.careAi);
  const baseUrl = httpsBase(env.CARE_AI_BASE_URL);
  const model = env.CARE_AI_MODEL?.trim();
  return base && baseUrl && model ? { ...base, baseUrl, model } : null;
}

export function readProviderConfig(env: Env = process.env): ProviderConfig {
  return {
    plantnet: access(env.PLANTNET_API_KEY, env.PLANTNET_DAILY_LIMIT, DEFAULT_LIMITS.plantnet),
    perenual: access(env.PERENUAL_API_KEY, env.PERENUAL_DAILY_LIMIT, DEFAULT_LIMITS.perenual),
    trefle: access(env.TREFLE_TOKEN, env.TREFLE_DAILY_LIMIT, DEFAULT_LIMITS.trefle),
    careAi: careAiAccess(env),
  };
}

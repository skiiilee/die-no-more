import "server-only";

/**
 * Provider keys and our own daily caps (ADR-0003 D8, ADR-0004 D5).
 * Server-only: never expose through NEXT_PUBLIC_ variables. A provider whose
 * key is missing is treated as unavailable; the app keeps working without it.
 */
export type ProviderAccess = { key: string; dailyLimit: number };

export type ProviderConfig = {
  perenual: ProviderAccess | null;
  trefle: ProviderAccess | null;
};

type Env = Record<string, string | undefined>;

/** Documented defaults from .env.example, used when a limit is unset or invalid. */
const DEFAULT_LIMITS = { perenual: 90, trefle: 300 } as const;

function limit(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function access(key: string | undefined, rawLimit: string | undefined, fallback: number): ProviderAccess | null {
  const trimmed = key?.trim();
  return trimmed ? { key: trimmed, dailyLimit: limit(rawLimit, fallback) } : null;
}

export function readProviderConfig(env: Env = process.env): ProviderConfig {
  return {
    perenual: access(env.PERENUAL_API_KEY, env.PERENUAL_DAILY_LIMIT, DEFAULT_LIMITS.perenual),
    trefle: access(env.TREFLE_TOKEN, env.TREFLE_DAILY_LIMIT, DEFAULT_LIMITS.trefle),
  };
}

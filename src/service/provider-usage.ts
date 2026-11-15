import type { UsageProvider, UsageStore } from "@/repo/usage-repo";
import type { UsageStatus } from "@/types/species";

/**
 * Daily caps on provider calls (ADR-0003 D8, ADR-0004 D5). Perenual and
 * Trefle document no day boundary, so our own cap counts per KST day. A
 * provider that said its quota is used up (Perenual 429) is not asked again
 * that day. When usage cannot be read, the provider is not called: going over
 * a free limit is worse than one missed search.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the current KST day as an ISO instant. */
export function kstDayStart(now: Date): string {
  const kst = now.getTime() + KST_OFFSET_MS;
  return new Date(kst - (kst % DAY_MS) - KST_OFFSET_MS).toISOString();
}

/** Any adapter answer: its kind and how many HTTP attempts it made. */
export type MeteredAnswer = { kind: string; calls: number };

/** Status of the final attempt; earlier attempts were retried failures. */
export function usageStatuses(answer: MeteredAnswer): UsageStatus[] {
  if (answer.calls === 0) return [];
  const last: UsageStatus =
    answer.kind === "quota" ? "quota_exceeded" : answer.kind === "unavailable" ? "failure" : "success";
  return [...Array<UsageStatus>(answer.calls - 1).fill("failure"), last];
}

export type Meter = {
  /** True when one more call stays within today's cap. */
  canCall(): Promise<boolean>;
  /** Logs the attempts an answer made. Never throws: a search must not fail on logging. */
  record(operation: string, answer: MeteredAnswer): Promise<void>;
};

export function meter(
  usage: UsageStore,
  provider: UsageProvider,
  dailyLimit: number,
  now: () => Date = () => new Date(),
): Meter {
  return {
    async canCall() {
      try {
        const today = await usage.usageSince(provider, kstDayStart(now()));
        return !today.quotaHit && today.calls < dailyLimit;
      } catch {
        return false;
      }
    },
    async record(operation, answer) {
      try {
        await usage.logCalls(provider, operation, usageStatuses(answer));
      } catch {
        console.error(`Could not log ${provider} usage`);
      }
    },
  };
}

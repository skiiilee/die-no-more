import type { UsageProvider, UsageStore } from "@/repo/usage-repo";
import type { CallGate, HttpResult } from "./adapters/http";
import type { UsageSettlement } from "./adapters/perenual";

/**
 * Daily caps and provider back-off (ADR-0003 D8, ADR-0004 D5; PR #15 review,
 * items 1 and 4). Each HTTP attempt reserves one call in the DB before it is
 * sent (reserve_provider_call: counted under a lock, so a racing request
 * cannot take the same last call). If the reservation cannot be written, the
 * call is not sent: going over a free limit is worse than one missed search.
 * Each provider is counted by its own day boundary (ADR-0004 D5): Pl@ntNet
 * resets at 00:00 UTC; Perenual and Trefle document none, so our cap counts
 * per KST day.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the current KST day as an ISO instant. */
export function kstDayStart(now: Date): string {
  const kst = now.getTime() + KST_OFFSET_MS;
  return new Date(kst - (kst % DAY_MS) - KST_OFFSET_MS).toISOString();
}

/** Start of the current UTC day as an ISO instant (Pl@ntNet's quota day). */
export function utcDayStart(now: Date): string {
  const ms = now.getTime();
  return new Date(ms - (ms % DAY_MS)).toISOString();
}

export type GateOptions = {
  usage: UsageStore;
  provider: UsageProvider;
  dailyLimit: number;
  /** How the provider's answer is recorded (perenualUsage, trefleUsage). */
  classify: (result: HttpResult) => UsageSettlement;
  /** The provider's day boundary. KST day unless the provider defines one. */
  dayStart?: (now: Date) => string;
  now?: () => Date;
};

/** A gate per operation name, for one provider. */
export function usageGate(options: GateOptions): (operation: string) => CallGate {
  const now = options.now ?? (() => new Date());
  const dayStart = options.dayStart ?? kstDayStart;
  return (operation) => ({
    async open() {
      let answer;
      try {
        answer = await options.usage.reserve(options.provider, operation, dayStart(now()), options.dailyLimit);
      } catch {
        return { ok: false, reason: "usage_unavailable" };
      }
      if (answer.kind === "blocked") return { ok: false, reason: answer.reason };
      const id = answer.id;
      return {
        ok: true,
        ticket: {
          async settle(result) {
            const { status, retryAt } = options.classify(result);
            try {
              await options.usage.settle(id, status, retryAt);
            } catch {
              // The row stays 'reserved' and still counts toward the cap.
              console.error(`Could not settle ${options.provider} usage`);
            }
          },
        },
      };
    },
  });
}

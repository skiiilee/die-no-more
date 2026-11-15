import "server-only";
import type { UsageStatus, UsageToday } from "@/types/species";
import { PlantStoreError } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

export type UsageProvider = "plantnet" | "perenual" | "trefle" | "azure_translator";

/** Provider call counts in api_usage_logs (ADR-0003 D8, ADR-0004 D5). Owner-only rows (RLS). */
export type UsageStore = {
  /** Calls since `since` (ISO time) and whether the provider reported its quota as used up. */
  usageSince(provider: UsageProvider, since: string): Promise<UsageToday>;
  /** One row per provider call attempt. */
  logCalls(provider: UsageProvider, operation: string, statuses: UsageStatus[]): Promise<void>;
};

export function supabaseUsageStore(client: SupabaseServerClient): UsageStore {
  return {
    async usageSince(provider, since) {
      const { data, error } = await client
        .from("api_usage_logs")
        .select("status")
        .eq("provider", provider)
        .gte("called_at", since);
      if (error || !data) throw new PlantStoreError("usageSince", { cause: error });
      const rows = data as { status: UsageStatus }[];
      return { calls: rows.length, quotaHit: rows.some((row) => row.status === "quota_exceeded") };
    },

    async logCalls(provider, operation, statuses) {
      if (statuses.length === 0) return;
      const { error } = await client
        .from("api_usage_logs")
        .insert(statuses.map((status) => ({ provider, operation, status })));
      if (error) throw new PlantStoreError("logCalls", { cause: error });
    },
  };
}

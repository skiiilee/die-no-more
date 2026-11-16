import "server-only";
import type { UsageStatus } from "@/types/species";
import { PlantStoreError } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

export type UsageProvider = "plantnet" | "perenual" | "trefle" | "azure_translator";

export type ReserveAnswer =
  | { kind: "reserved"; id: string }
  | { kind: "blocked"; reason: "limit" | "quota" | "cooldown"; retryAt: string | null };

/**
 * Provider call reservations in api_usage_logs (ADR-0003 D8, ADR-0004 D5).
 * Owner-only rows (RLS). `reserve` throws when it cannot write, so no call
 * goes out unrecorded.
 */
export type UsageStore = {
  /** One call for `provider` since `since` (ISO), within `limit` (reserve_provider_call). */
  reserve(provider: UsageProvider, operation: string, since: string, limit: number): Promise<ReserveAnswer>;
  /** Records how a reserved attempt ended. */
  settle(id: string, status: Exclude<UsageStatus, "reserved">, retryAt: Date | null): Promise<void>;
};

type ReserveRow = { reservation_id: string | null; blocked: "limit" | "quota" | "cooldown" | null; retry_at: string | null };

export function supabaseUsageStore(client: SupabaseServerClient): UsageStore {
  return {
    async reserve(provider, operation, since, limit) {
      const { data, error } = await client.rpc("reserve_provider_call", {
        p_provider: provider,
        p_operation: operation,
        p_since: since,
        p_limit: limit,
      });
      const row = Array.isArray(data) ? (data[0] as ReserveRow | undefined) : undefined;
      if (error || !row) throw new PlantStoreError("reserve", { cause: error });
      if (row.reservation_id) return { kind: "reserved", id: row.reservation_id };
      if (!row.blocked) throw new PlantStoreError("reserve: empty answer");
      return { kind: "blocked", reason: row.blocked, retryAt: row.retry_at };
    },

    async settle(id, status, retryAt) {
      const { error } = await client
        .from("api_usage_logs")
        .update({ status, retry_at: retryAt?.toISOString() ?? null })
        .eq("id", id)
        .eq("status", "reserved");
      if (error) throw new PlantStoreError("settle", { cause: error });
    },
  };
}

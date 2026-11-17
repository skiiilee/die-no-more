import "server-only";
import type { StoredCandidate } from "@/types/photo";
import { PlantStoreError } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

/**
 * identification_sessions (ADR-0003 D6, D7). A session is written as
 * `processing` before Pl@ntNet is called, then `completed` with the normalized
 * candidates or `failed` with a code, so a failed request is still on record.
 * Owner-only rows (RLS). The provider's raw answer is never stored.
 */
export type SessionStatus = "processing" | "completed" | "failed";

export type IdentificationStore = {
  create(): Promise<string>;
  complete(id: string, candidates: StoredCandidate[], providerVersion: string | null): Promise<void>;
  fail(id: string, errorCode: string): Promise<void>;
  /** The session, or null when it does not exist (or is not the user's). Candidates are unchecked JSON. */
  get(id: string): Promise<{ id: string; status: SessionStatus; candidates: unknown } | null>;
};

export const IDENTIFY_ENDPOINT = "/v2/identify/all";

export function supabaseIdentificationStore(client: SupabaseServerClient): IdentificationStore {
  return {
    async create() {
      const { data, error } = await client
        .from("identification_sessions")
        .insert({ provider: "plantnet", endpoint: IDENTIFY_ENDPOINT })
        .select("id")
        .single();
      if (error || !data) throw new PlantStoreError("identification create", { cause: error });
      return (data as { id: string }).id;
    },

    async complete(id, candidates, providerVersion) {
      const { error } = await client
        .from("identification_sessions")
        .update({
          status: "completed",
          candidates,
          provider_version: providerVersion,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new PlantStoreError("identification complete", { cause: error });
    },

    async fail(id, errorCode) {
      const { error } = await client
        .from("identification_sessions")
        .update({ status: "failed", error_code: errorCode, completed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new PlantStoreError("identification fail", { cause: error });
    },

    async get(id) {
      const { data, error } = await client
        .from("identification_sessions")
        .select("id, status, candidates")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new PlantStoreError("identification get", { cause: error });
      return (data as { id: string; status: SessionStatus; candidates: unknown } | null) ?? null;
    },
  };
}

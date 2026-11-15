import "server-only";
import { cookies } from "next/headers";
import { tryReadAuthConfig, type AuthConfig } from "@/config/env";
import { createSupabaseServerClient, type SupabaseServerClient } from "@/repo/supabase-client";

/**
 * A Supabase client bound to the current request's session cookies, for
 * Server Components and Server Actions. Every query runs as the signed-in
 * user, so RLS applies. Returns null when Supabase is not configured.
 */
export async function requestSupabase(): Promise<{ client: SupabaseServerClient; config: AuthConfig } | null> {
  // Read cookies first: this marks the route as per-request even when auth is
  // not configured, so protected pages are never prerendered as static.
  const store = await cookies();
  const config = tryReadAuthConfig();
  if (!config) return null;
  const client = createSupabaseServerClient(config, {
    getAll: () => store.getAll(),
    setAll: (toSet) => {
      try {
        toSet.forEach(({ name, value, options }) => store.set(name, value, options));
      } catch {
        // Server Components cannot write cookies; the proxy refreshes them.
      }
    },
  });
  return { client, config };
}

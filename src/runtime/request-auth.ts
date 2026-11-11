import "server-only";
import { cookies } from "next/headers";
import { tryReadAuthConfig } from "@/config/env";
import { createSupabaseServerClient } from "@/repo/supabase-client";
import { supabaseAuthGateway, type AuthGateway } from "@/repo/auth-repo";

/**
 * Builds an AuthGateway bound to the current request's cookies, for Server
 * Components and Server Actions. Returns null when auth is not configured.
 */
export async function requestAuthGateway(): Promise<{ gateway: AuthGateway; ownerEmail: string } | null> {
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
  return { gateway: supabaseAuthGateway(client), ownerEmail: config.ownerEmail };
}

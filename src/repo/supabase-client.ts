import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SetAllCookies, GetAllCookies } from "@supabase/ssr";
import type { AuthConfig } from "@/config/env";

/**
 * Cookie access supplied by the Runtime layer (Server Action, Route Handler
 * or Proxy). The Repo layer never imports next/headers itself.
 */
export type CookieAdapter = {
  getAll: GetAllCookies;
  setAll: SetAllCookies;
};

/** Creates a per-request Supabase client. Never reuse it across requests. */
export function createSupabaseServerClient(config: AuthConfig, cookies: CookieAdapter) {
  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies,
  });
}

export type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;

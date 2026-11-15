import "server-only";
import { supabaseAuthGateway, type AuthGateway } from "@/repo/auth-repo";
import { requestSupabase } from "./request-supabase";

/**
 * Builds an AuthGateway bound to the current request's cookies, for Server
 * Components and Server Actions. Returns null when auth is not configured.
 */
export async function requestAuthGateway(): Promise<{ gateway: AuthGateway; ownerEmail: string } | null> {
  const supabase = await requestSupabase();
  if (!supabase) return null;
  return { gateway: supabaseAuthGateway(supabase.client), ownerEmail: supabase.config.ownerEmail };
}

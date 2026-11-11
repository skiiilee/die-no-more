import "server-only";
import type { SupabaseServerClient } from "./supabase-client";

/** Minimal auth operations the Service layer depends on. */
export type AuthGateway = {
  signInWithPassword(email: string, password: string): Promise<{ error: AuthGatewayError | null }>;
  signOut(): Promise<void>;
  /** Returns the signed-in user's id, or null when there is no valid session. */
  getUserId(): Promise<string | null>;
};

export type AuthGatewayError = { status?: number; code?: string; message: string };

export function supabaseAuthGateway(client: SupabaseServerClient): AuthGateway {
  return {
    async signInWithPassword(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return {
        error: error ? { status: error.status, code: error.code, message: error.message } : null,
      };
    },
    async signOut() {
      await client.auth.signOut();
    },
    async getUserId() {
      // getClaims verifies the JWT; it does not trust the cookie blindly.
      const { data, error } = await client.auth.getClaims();
      if (error || !data?.claims?.sub) return null;
      return data.claims.sub;
    },
  };
}

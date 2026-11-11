import type { SignInResult } from "@/types/auth";
import type { AuthGateway, AuthGatewayError } from "@/repo/auth-repo";

/**
 * Signs in the single owner account (ADR-0003 D2). The owner email comes from
 * server config; S01 only collects the password (wireframe pages 3–4).
 */
export async function signInOwner(
  gateway: AuthGateway,
  ownerEmail: string,
  password: string,
): Promise<SignInResult> {
  if (password.length === 0) return { ok: false, code: "invalid_password" };
  try {
    const { error } = await gateway.signInWithPassword(ownerEmail, password);
    if (!error) return { ok: true };
    return { ok: false, code: classifyAuthError(error) };
  } catch {
    return { ok: false, code: "unavailable" };
  }
}

export function classifyAuthError(error: AuthGatewayError): "invalid_password" | "unavailable" {
  if (error.code === "invalid_credentials") return "invalid_password";
  if (error.status !== undefined && error.status >= 400 && error.status < 500) {
    return "invalid_password";
  }
  return "unavailable";
}

/**
 * Only allow redirects to same-site paths after login, so a crafted
 * ?next=https://evil.example cannot bounce the user off-site.
 */
export function safeNextPath(next: unknown, fallback = "/today"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login")) return fallback;
  return next;
}

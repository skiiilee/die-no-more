import type { SignInErrorCode, SignInResult } from "@/types/auth";
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

/**
 * Only a real credential error means "wrong password". Rate limits and other
 * client errors are reported as what they are, so the user is not told to
 * retype a correct password.
 */
export function classifyAuthError(error: AuthGatewayError): SignInErrorCode {
  if (error.code === "invalid_credentials") return "invalid_password";
  // Older auth servers send no code; they still use this exact message.
  if (!error.code && error.status === 400 && /invalid login credentials/i.test(error.message)) {
    return "invalid_password";
  }
  if (error.status === 429 || error.code?.startsWith("over_")) return "rate_limited";
  if (error.code === "email_not_confirmed") return "not_configured";
  return "unavailable";
}

const SITE_ORIGIN = "https://same-site.invalid";
// C0 controls, DEL and C1 controls. URL parsing silently drops tab/CR/LF,
// which turns "/\t/evil.example" into the off-site "//evil.example".
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Only allow redirects to same-site paths after login, so a crafted
 * ?next= value cannot bounce the user off-site. The value is resolved the way
 * a browser would and must stay on our origin; the normalized path is returned.
 */
export function safeNextPath(next: unknown, fallback = "/today"): string {
  if (typeof next !== "string" || next.length === 0) return fallback;
  if (CONTROL_CHARS.test(next) || next.includes("\\")) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;

  let url: URL;
  try {
    url = new URL(next, SITE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== SITE_ORIGIN) return fallback;
  // Dot segments can normalize "/.//x.example" into the path "//x.example",
  // which is protocol-relative (off-site) once handed to redirect().
  if (url.pathname.startsWith("//")) return fallback;
  if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Outcome of a sign-in attempt. UI maps each code to a Korean message.
 * - invalid_password: wrong password (S01 shows "비밀번호가 올바르지 않습니다").
 * - not_configured: server env is missing; the owner must set it up.
 * - rate_limited: too many attempts; retrying the same password will not help yet.
 * - unavailable: auth provider could not be reached or failed.
 */
export type SignInErrorCode = "invalid_password" | "not_configured" | "rate_limited" | "unavailable";

export type SignInResult = { ok: true } | { ok: false; code: SignInErrorCode };

export type SignInFormState = { error: SignInErrorCode | null };

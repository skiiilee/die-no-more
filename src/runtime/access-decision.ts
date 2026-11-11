/**
 * Route access rules (ADR-0003 D2): every screen except S01 needs a session.
 * Pure function so it can be unit-tested without Next.js.
 */
export type AccessDecision =
  | { kind: "allow" }
  | { kind: "redirect"; to: string };

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/today";

export function decideAccess(pathname: string, search: string, signedIn: boolean): AccessDecision {
  const isLogin = pathname === LOGIN_PATH;
  if (isLogin) return signedIn ? { kind: "redirect", to: HOME_PATH } : { kind: "allow" };
  if (signedIn) return { kind: "allow" };

  // Remember where the user was going so S01 can return there (session expiry).
  const next = pathname === "/" ? HOME_PATH : `${pathname}${search}`;
  return { kind: "redirect", to: `${LOGIN_PATH}?next=${encodeURIComponent(next)}` };
}

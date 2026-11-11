import type { NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

/**
 * Cookie and header updates Supabase asks for after a session refresh.
 * The headers include Cache-Control/Expires/Pragma so that a response that
 * sets auth cookies is never cached and served to someone else.
 */
export type AuthUpdates = {
  cookies: { name: string; value: string; options: CookieOptions }[];
  headers: Record<string, string>;
};

export function emptyAuthUpdates(): AuthUpdates {
  return { cookies: [], headers: {} };
}

/** Applies the updates to any outgoing response, including redirects. */
export function applyAuthUpdates<T extends NextResponse>(response: T, updates: AuthUpdates): T {
  updates.cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(updates.headers).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

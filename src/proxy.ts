import { NextResponse, type NextRequest } from "next/server";
import { tryReadAuthConfig } from "@/config/env";
import { createSupabaseServerClient } from "@/repo/supabase-client";
import { supabaseAuthGateway } from "@/repo/auth-repo";
import { decideAccess } from "@/runtime/access-decision";

/**
 * Runtime layer entry: refreshes the Supabase session cookie on every request
 * and sends signed-out visitors to S01. Pages still verify the session on the
 * server; this is the optimistic check described in the Next.js auth guide.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = tryReadAuthConfig();

  let signedIn = false;
  if (config) {
    const client = createSupabaseServerClient(config, {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    });
    signedIn = (await supabaseAuthGateway(client).getUserId()) !== null;
  }

  const decision = decideAccess(request.nextUrl.pathname, request.nextUrl.search, signedIn);
  if (decision.kind === "allow") return response;

  const redirect = NextResponse.redirect(new URL(decision.to, request.url));
  // Keep any refreshed auth cookies on the redirect as well.
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // Skip static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|webmanifest)$).*)"],
};

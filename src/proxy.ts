import { NextResponse, type NextRequest } from "next/server";
import { tryReadAuthConfig } from "@/config/env";
import { createSupabaseServerClient } from "@/repo/supabase-client";
import { supabaseAuthGateway } from "@/repo/auth-repo";
import { decideAccess } from "@/runtime/access-decision";
import { applyAuthUpdates, emptyAuthUpdates } from "@/runtime/auth-response";

/**
 * Runtime layer entry: refreshes the Supabase session cookie on every request
 * and sends signed-out visitors to S01. Pages still verify the session on the
 * server; this is the optimistic check described in the Next.js auth guide.
 */
export async function proxy(request: NextRequest) {
  const updates = emptyAuthUpdates();
  const config = tryReadAuthConfig();

  let signedIn = false;
  if (config) {
    const client = createSupabaseServerClient(config, {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        // Let the rest of this request see the refreshed session...
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        // ...and remember cookies + cache headers for whichever response we send.
        updates.cookies.push(...toSet);
        Object.assign(updates.headers, headers);
      },
    });
    signedIn = (await supabaseAuthGateway(client).getUserId()) !== null;
  }

  const decision = decideAccess(request.nextUrl.pathname, request.nextUrl.search, signedIn);
  const response =
    decision.kind === "allow"
      ? NextResponse.next({ request })
      : NextResponse.redirect(new URL(decision.to, request.url));
  return applyAuthUpdates(response, updates);
}

export const config = {
  // Skip static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|webmanifest)$).*)"],
};

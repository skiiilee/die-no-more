import "server-only";
import { redirect } from "next/navigation";
import { requestAuthGateway } from "./request-auth";

/**
 * Server-side session check for protected layouts and pages. The proxy does
 * an optimistic redirect; this is the authoritative check (defense in depth).
 * Returns the user id.
 */
export async function requireSignedIn(): Promise<string> {
  const auth = await requestAuthGateway();
  const userId = auth ? await auth.gateway.getUserId() : null;
  if (!userId) redirect("/login");
  return userId;
}

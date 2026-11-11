"use server";

import { redirect } from "next/navigation";
import type { SignInFormState } from "@/types/auth";
import { safeNextPath, signInOwner } from "@/service/auth-service";
import { requestAuthGateway } from "./request-auth";

/** S01 [확인]: signs in, then goes to S02 or the page the user came from. */
export async function signInAction(
  _prev: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const auth = await requestAuthGateway();
  if (!auth) return { error: "not_configured" };

  const password = String(formData.get("password") ?? "");
  const result = await signInOwner(auth.gateway, auth.ownerEmail, password);
  if (!result.ok) return { error: result.code };

  redirect(safeNextPath(formData.get("next")));
}

/** S12 logout. */
export async function signOutAction(): Promise<void> {
  const auth = await requestAuthGateway();
  if (auth) await auth.gateway.signOut();
  redirect("/login");
}

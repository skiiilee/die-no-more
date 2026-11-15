"use server";

import { redirect } from "next/navigation";
import { FEATURES } from "@/config/features";
import { registerPot } from "@/service/plant-service";
import type { RawInput } from "@/service/plant-registration";
import type { RegisterFormState } from "@/types/plant";
import { requireSignedIn } from "./session";
import { requestPlantStore } from "./plant-store";

function formInput(formData: FormData): RawInput {
  const input: RawInput = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") input[key] = value;
  }
  return input;
}

/** S05 [식물 추가하기]: stores the pot, then opens S06. */
export async function registerPotAction(_prev: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  await requireSignedIn();
  const store = await requestPlantStore();
  const input = formInput(formData);
  if (!store) return { status: "save_failed", errors: {}, values: {} };

  const result = await registerPot(store, input, FEATURES.CARE_REMINDERS);
  if (!result.ok) return result.state;
  redirect(`/plants/${result.id}`);
}

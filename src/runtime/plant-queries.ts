import "server-only";
import { FEATURES } from "@/config/features";
import { loadRegistrationContext, type RegistrationContext } from "@/service/plant-service";
import type { RawInput } from "@/service/plant-registration";
import type { PotView } from "@/types/plant";
import { requestPlantStore } from "./plant-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** S05: identity and reminder choices for the form. */
export async function getRegistrationContext(input: RawInput): Promise<RegistrationContext> {
  const store = await requestPlantStore();
  if (!store) return { ok: false, message: "지금은 화분을 등록할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  return loadRegistrationContext(store, input, FEATURES.CARE_REMINDERS);
}

/** S06: one own pot, or null when it does not exist or belongs to someone else (RLS). */
export async function getPot(id: string): Promise<PotView | null> {
  if (!UUID.test(id)) return null;
  const store = await requestPlantStore();
  return store ? store.getPot(id) : null;
}

/** S11: active pots, newest first. */
export async function listActivePots(): Promise<PotView[]> {
  const store = await requestPlantStore();
  if (!store) throw new Error("Supabase is not configured");
  return store.listActivePots();
}

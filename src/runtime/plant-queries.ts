import "server-only";
import { FEATURES } from "@/config/features";
import { loadRegistrationContext, type RegistrationContext } from "@/service/plant-service";
import type { RawInput } from "@/service/plant-registration";
import { withNewestPhotos } from "@/service/pot-photos";
import type { PotView } from "@/types/plant";
import { requestPlantStore, requestPotStores } from "./plant-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** S05: identity and reminder choices for the form. */
export async function getRegistrationContext(input: RawInput): Promise<RegistrationContext> {
  const store = await requestPlantStore();
  if (!store) return { ok: false, message: "지금은 화분을 등록할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  return loadRegistrationContext(store, input, FEATURES.CARE_REMINDERS);
}

/**
 * S06: one own pot, or null when it does not exist or belongs to someone else
 * (RLS). A failed query throws and the plants error screen offers a retry.
 */
export async function getPot(id: string): Promise<PotView | null> {
  if (!UUID.test(id)) return null;
  const stores = await requestPotStores();
  if (!stores) throw new Error("Supabase is not configured");
  const pot = await stores.plants.getPot(id);
  if (!pot) return null;
  const [withPhoto] = await withNewestPhotos(stores.photos, [pot]);
  return withPhoto;
}

/** S11: active pots, newest first. */
export async function listActivePots(): Promise<PotView[]> {
  const stores = await requestPotStores();
  if (!stores) throw new Error("Supabase is not configured");
  return withNewestPhotos(stores.photos, await stores.plants.listActivePots());
}

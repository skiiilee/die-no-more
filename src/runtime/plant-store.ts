import "server-only";
import { supabasePlantStore, type PlantStore } from "@/repo/plant-repo";
import { supabasePotPhotoStore, type PotPhotoStore } from "@/repo/pot-photo-repo";
import { sharpImageProcessor } from "@/service/adapters/image";
import type { PhotoDeps } from "@/service/pot-photos";
import { requestSupabase } from "./request-supabase";

/** PlantStore for the current request, running as the signed-in user. */
export async function requestPlantStore(): Promise<PlantStore | null> {
  const supabase = await requestSupabase();
  return supabase ? supabasePlantStore(supabase.client) : null;
}

/** Pot and pot photo stores for the current request, both as the signed-in user. */
export async function requestPotStores(): Promise<{ plants: PlantStore; photos: PotPhotoStore } | null> {
  const supabase = await requestSupabase();
  return supabase
    ? { plants: supabasePlantStore(supabase.client), photos: supabasePotPhotoStore(supabase.client) }
    : null;
}

/** What the pot photo service needs: the store, server re-encoding and random file names. */
export function photoDeps(photos: PotPhotoStore): PhotoDeps {
  return { photos, image: sharpImageProcessor, newId: () => crypto.randomUUID() };
}

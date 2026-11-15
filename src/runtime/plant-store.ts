import "server-only";
import { supabasePlantStore, type PlantStore } from "@/repo/plant-repo";
import { requestSupabase } from "./request-supabase";

/** PlantStore for the current request, running as the signed-in user. */
export async function requestPlantStore(): Promise<PlantStore | null> {
  const supabase = await requestSupabase();
  return supabase ? supabasePlantStore(supabase.client) : null;
}

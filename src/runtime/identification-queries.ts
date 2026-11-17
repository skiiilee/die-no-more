import "server-only";
import { supabaseIdentificationStore } from "@/repo/identification-repo";
import { supabaseSpeciesStore } from "@/repo/species-repo";
import { loadIdentification } from "@/service/photo-identification";
import type { IdentificationView } from "@/types/photo";
import { requestSupabase } from "./request-supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** S04-A for a photo identification, or null when the session is not the user's or does not exist. */
export async function getIdentificationForPage(id: string): Promise<IdentificationView | null> {
  const supabase = await requestSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  if (!UUID.test(id)) return null;
  return loadIdentification(
    { sessions: supabaseIdentificationStore(supabase.client), species: supabaseSpeciesStore(supabase.client) },
    id,
  );
}

import "server-only";
import { supabaseHealthStore } from "@/repo/health-repo";
import { supabasePotPhotoStore } from "@/repo/pot-photo-repo";
import type { SavedHealthCheck, SavedHealthSummary } from "@/types/health";
import { requestSupabase } from "./request-supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many saved checks S06 lists. */
export const RECENT_HEALTH_CHECKS = 3;

async function client() {
  const supabase = await requestSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase.client;
}

/**
 * S06 건강 점검 기록: the pot's newest saved checks (own pot only, RLS). A
 * failed query shows no records rather than breaking S06, which must stay
 * usable for the pot itself.
 */
export async function listHealthChecks(potId: string): Promise<SavedHealthSummary[]> {
  if (!UUID.test(potId)) return [];
  try {
    return await supabaseHealthStore(await client()).list(potId, RECENT_HEALTH_CHECKS);
  } catch (error) {
    console.error("health check list failed", error instanceof Error ? error.name : "unknown");
    return [];
  }
}

/** One saved check of this pot with short-lived photo links, or null when there is none. */
export async function getHealthCheck(potId: string, checkId: string): Promise<SavedHealthCheck | null> {
  if (!UUID.test(potId) || !UUID.test(checkId)) return null;
  const supabase = await client();
  const stored = await supabaseHealthStore(supabase).get(potId, checkId);
  if (!stored) return null;
  const urls = await supabasePotPhotoStore(supabase).signedUrls(stored.photoPaths.map((photo) => photo.path));
  const { photoPaths, ...check } = stored;
  return { ...check, photos: photoPaths.map((photo) => ({ id: photo.id, url: urls.get(photo.path) ?? null })) };
}

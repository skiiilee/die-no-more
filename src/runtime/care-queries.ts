import "server-only";
import { supabaseCareStore } from "@/repo/care-repo";
import { supabasePotPhotoStore } from "@/repo/pot-photo-repo";
import type { CareRecordSummary, SavedCareRecord } from "@/types/care";
import { requestSupabase } from "./request-supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** How many records S06 lists (the full history is S10). */
export const RECENT_CARE_RECORDS = 3;

async function client() {
  const supabase = await requestSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase.client;
}

/**
 * S06 최근 관리 기록: the pot's newest S08 records (own pot only, RLS). A
 * failed query shows no records rather than breaking S06.
 */
export async function listCareRecords(potId: string): Promise<CareRecordSummary[]> {
  if (!UUID.test(potId)) return [];
  try {
    return await supabaseCareStore(await client()).list(potId, RECENT_CARE_RECORDS);
  } catch (error) {
    console.error("care record list failed", error instanceof Error ? error.name : "unknown");
    return [];
  }
}

/** One record of this pot with short-lived photo links, or null when there is none. */
export async function getCareRecord(potId: string, recordId: string): Promise<SavedCareRecord | null> {
  if (!UUID.test(potId) || !UUID.test(recordId)) return null;
  const supabase = await client();
  const stored = await supabaseCareStore(supabase).get(potId, recordId);
  if (!stored) return null;
  const urls = await supabasePotPhotoStore(supabase).signedUrls(stored.photoPaths.map((photo) => photo.path));
  const { photoPaths, ...record } = stored;
  return { ...record, photos: photoPaths.map((photo) => ({ id: photo.id, url: urls.get(photo.path) ?? null })) };
}

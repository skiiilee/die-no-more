import "server-only";
import { PlantStoreError } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

/**
 * Pot photos: files in the private "plant-photos" bucket under the owner's
 * folder, rows in plant_photos (photo_type 'plant'). Runs as the signed-in
 * user; Storage and table RLS both limit it to the owner (ADR-0003 D4, D6).
 * Reads throw on a failed query; writes answer ok/not ok so the service can
 * clean up after itself.
 */

export const POT_PHOTO_BUCKET = "plant-photos";
/** Signed links live one hour: long enough to look at a screen, short enough not to be shared for long. */
export const SIGNED_URL_SECONDS = 60 * 60;

export type StoredPotPhoto = { id: string; plantId: string; path: string; createdAt: string };

export type PotPhotoStore = {
  /** The signed-in user's id (the folder every path must start with), or null. */
  userId(): Promise<string | null>;
  upload(path: string, jpeg: Uint8Array): Promise<boolean>;
  /** Removes one file. False when Storage refused or failed. */
  removeObject(path: string): Promise<boolean>;
  /** Links an uploaded file to the pot as a pot photo (attached at once). */
  insertPhoto(plantId: string, path: string): Promise<boolean>;
  /** The newest pot photo of each pot that has one. */
  newestPhotos(plantIds: string[]): Promise<Map<string, StoredPotPhoto>>;
  /** Signed links by path. A path missing from the map has no link. */
  signedUrls(paths: string[]): Promise<Map<string, string>>;
  /**
   * Deletes the photo row and queues its file in storage_deletions in one
   * transaction (D18). Null when there is no such pot photo for this pot.
   */
  deletePhoto(plantId: string, photoId: string): Promise<{ path: string; requestId: string } | null>;
  /** Records how the queued file removal went. */
  markDeletion(requestId: string, path: string, outcome: { ok: true } | { ok: false; error: string }): Promise<void>;
};

type PhotoRow = { id: string; plant_id: string; storage_path: string; created_at: string };

export function supabasePotPhotoStore(client: SupabaseServerClient): PotPhotoStore {
  const bucket = () => client.storage.from(POT_PHOTO_BUCKET);
  return {
    async userId() {
      const { data, error } = await client.auth.getClaims();
      return error || !data?.claims?.sub ? null : data.claims.sub;
    },

    async upload(path, jpeg) {
      const { error } = await bucket().upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
      return !error;
    },

    async removeObject(path) {
      const { data, error } = await bucket().remove([path]);
      return !error && Array.isArray(data);
    },

    async insertPhoto(plantId, path) {
      const { error } = await client.from("plant_photos").insert({
        plant_id: plantId,
        storage_path: path,
        photo_type: "plant",
        attached_at: new Date().toISOString(),
      });
      return !error;
    },

    async newestPhotos(plantIds) {
      const newest = new Map<string, StoredPotPhoto>();
      if (plantIds.length === 0) return newest;
      const { data, error } = await client
        .from("plant_photos")
        .select("id, plant_id, storage_path, created_at")
        .eq("photo_type", "plant")
        .in("plant_id", plantIds)
        .order("created_at", { ascending: false });
      if (error || !data) throw new PlantStoreError("newestPhotos", { cause: error });
      for (const row of data as PhotoRow[]) {
        if (!newest.has(row.plant_id)) {
          newest.set(row.plant_id, { id: row.id, plantId: row.plant_id, path: row.storage_path, createdAt: row.created_at });
        }
      }
      return newest;
    },

    async signedUrls(paths) {
      const urls = new Map<string, string>();
      if (paths.length === 0) return urls;
      const { data, error } = await bucket().createSignedUrls(paths, SIGNED_URL_SECONDS);
      if (error || !data) return urls;
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
      }
      return urls;
    },

    async deletePhoto(plantId, photoId) {
      const { data, error } = await client.rpc("delete_pot_photo", { p_plant_id: plantId, p_photo_id: photoId });
      if (error) throw new PlantStoreError("deletePhoto", { cause: error });
      const row = (data as { storage_path: string; deletion_request_id: string }[] | null)?.[0];
      return row ? { path: row.storage_path, requestId: row.deletion_request_id } : null;
    },

    async markDeletion(requestId, path, outcome) {
      // Best effort: the row is already gone; a missed mark only means a later retry.
      await client
        .from("storage_deletions")
        .update(
          outcome.ok
            ? { status: "done", attempts: 1 }
            : { status: "failed", attempts: 1, last_error: outcome.error.slice(0, 200) },
        )
        .eq("deletion_request_id", requestId)
        .eq("storage_path", path);
    },
  };
}

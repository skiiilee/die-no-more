import "server-only";
import { PlantStoreError } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

/**
 * Uploaded photos: private bucket `plant-photos` under `<user_id>/` plus a
 * plant_photos row (ADR-0003 D4, D6). Runs as the signed-in user; Storage and
 * table policies limit every call to the owner's own files and rows.
 * A failed call throws PlantStoreError; "no such photo" is a normal answer.
 */
export type PhotoStore = {
  /** Stores a cleaned JPEG as an unattached identification photo. */
  saveUnattached(bytes: Uint8Array): Promise<{ id: string }>;
  /** Removes one unattached photo, file first, then row. False when there is no such photo. */
  deleteUnattached(id: string): Promise<boolean>;
  /** Bytes of these identification photos in the given order, or null when any is gone. */
  readIdentificationPhotos(ids: string[]): Promise<Uint8Array[] | null>;
  /** Removes unattached photos created before `before` (D6, 24 hours). Returns how many. */
  removeUnattachedBefore(before: Date): Promise<number>;
};

export const PHOTO_BUCKET = "plant-photos";
/** Old photos removed per cleanup pass, so one upload never waits long. */
const CLEANUP_BATCH = 50;

type PhotoRow = { id: string; storage_path: string };

/** Storage answers "missing object" with 400 or 404. */
function isMissing(error: unknown): boolean {
  const detail = error as { status?: unknown; statusCode?: unknown } | null;
  const status = String(detail?.status ?? detail?.statusCode ?? "");
  return status === "400" || status === "404";
}

export function supabasePhotoStore(client: SupabaseServerClient, userId: string): PhotoStore {
  const bucket = () => client.storage.from(PHOTO_BUCKET);

  return {
    async saveUnattached(bytes) {
      const path = `${userId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await bucket().upload(path, bytes, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new PlantStoreError("photo upload", { cause: uploadError });

      const { data, error } = await client
        .from("plant_photos")
        .insert({ storage_path: path, photo_type: "identification" })
        .select("id")
        .single();
      if (error || !data) {
        // Do not leave a file without a row: nothing would ever clean it up.
        await bucket().remove([path]);
        throw new PlantStoreError("photo row", { cause: error });
      }
      return { id: (data as { id: string }).id };
    },

    async deleteUnattached(id) {
      const { data, error } = await client
        .from("plant_photos")
        .select("id, storage_path")
        .eq("id", id)
        .is("attached_at", null)
        .maybeSingle();
      if (error) throw new PlantStoreError("photo lookup", { cause: error });
      if (!data) return false;
      const row = data as PhotoRow;
      const { error: removeError } = await bucket().remove([row.storage_path]);
      if (removeError) throw new PlantStoreError("photo file delete", { cause: removeError });
      const { error: deleteError } = await client.from("plant_photos").delete().eq("id", row.id);
      if (deleteError) throw new PlantStoreError("photo row delete", { cause: deleteError });
      return true;
    },

    async readIdentificationPhotos(ids) {
      const { data, error } = await client
        .from("plant_photos")
        .select("id, storage_path")
        .in("id", ids)
        .eq("photo_type", "identification");
      if (error || !data) throw new PlantStoreError("photo lookup", { cause: error });
      const byId = new Map((data as PhotoRow[]).map((row) => [row.id, row.storage_path]));
      if (ids.some((id) => !byId.has(id))) return null;

      const photos: Uint8Array[] = [];
      for (const id of ids) {
        const { data: file, error: downloadError } = await bucket().download(byId.get(id)!);
        if (downloadError && isMissing(downloadError)) return null;
        if (downloadError || !file) throw new PlantStoreError("photo download", { cause: downloadError });
        photos.push(new Uint8Array(await file.arrayBuffer()));
      }
      return photos;
    },

    async removeUnattachedBefore(before) {
      const { data, error } = await client
        .from("plant_photos")
        .select("id, storage_path")
        .is("attached_at", null)
        .lt("created_at", before.toISOString())
        .order("created_at")
        .limit(CLEANUP_BATCH);
      if (error || !data) throw new PlantStoreError("expired photos", { cause: error });
      const rows = data as PhotoRow[];
      if (rows.length === 0) return 0;
      const { error: removeError } = await bucket().remove(rows.map((row) => row.storage_path));
      if (removeError) throw new PlantStoreError("expired photo files", { cause: removeError });
      const ids = rows.map((row) => row.id);
      const { error: deleteError } = await client.from("plant_photos").delete().in("id", ids);
      if (deleteError) throw new PlantStoreError("expired photo rows", { cause: deleteError });
      return rows.length;
    },
  };
}

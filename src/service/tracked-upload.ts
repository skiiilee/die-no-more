import type { PotPhotoStore } from "@/repo/pot-photo-repo";

/**
 * Uploads cleaned photos so that no file is ever untracked (PR #26 review P2),
 * for every save that stores photos with its rows (S07-S, S08):
 * 1. the paths are recorded as 'pending' clean-up under a fresh request id
 *    before anything is uploaded; the save drops that record in its
 *    transaction;
 * 2. when the save does not happen, `cleanUp()` removes each file and marks
 *    it done, or failed when Storage refused, for the clean-up job (DF-06).
 *    If the server stops in between, the record stays 'pending' for that job.
 * `newId()` is called for the request first, then once per photo.
 */

export type TrackedUploadDeps = {
  photos: Pick<PotPhotoStore, "upload" | "removeObject" | "markDeletion">;
  planCleanup(requestId: string, paths: string[]): Promise<boolean>;
  newId(): string;
};

export type TrackedUpload = {
  paths: string[];
  cleanupRequest: string;
  /** Removes this request's files; a removal Storage refused stays on record as failed. */
  cleanUp(): Promise<void>;
};

export async function uploadTracked(
  deps: TrackedUploadDeps,
  userId: string,
  photos: Uint8Array[],
  /** Recorded with a removal Storage refused. */
  label: string,
): Promise<TrackedUpload | null> {
  const cleanupRequest = deps.newId();
  const paths = photos.map(() => `${userId}/${deps.newId()}.jpg`);
  if (!(await deps.planCleanup(cleanupRequest, paths).catch(() => false))) return null;

  const cleanUp = async () => {
    await Promise.all(
      paths.map(async (path) => {
        const removed = await deps.photos.removeObject(path).catch(() => false);
        await deps.photos
          .markDeletion(cleanupRequest, path, removed ? { ok: true } : { ok: false, error: label })
          .catch(() => undefined);
      }),
    );
  };

  for (const [index, photo] of photos.entries()) {
    const ok = await deps.photos.upload(paths[index], photo).catch(() => false);
    if (!ok) {
      await cleanUp();
      return null;
    }
  }
  return { paths, cleanupRequest, cleanUp };
}

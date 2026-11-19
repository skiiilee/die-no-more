import type { PotPhotoStore } from "@/repo/pot-photo-repo";
import type { PotView } from "@/types/plant";
import type { ImageProcessor } from "./adapters/image";
import { cleanPhotos } from "./photo-cleaning";

/**
 * Pot photos (S05 photo, S06 [사진 추가]/[사진 삭제]), ADR-0003 D4, D6, D18.
 * - Every photo is checked and re-encoded on the server (no EXIF or location)
 *   before anything is stored.
 * - The file is uploaded and linked to the pot in the same request. If the
 *   link cannot be written, the file is removed at once, so a failed save
 *   leaves nothing behind (only a server stop mid-request can, DF-06).
 * - Deleting removes the row and queues the file in one transaction, then
 *   removes the file; a failed removal stays queued for a later retry (DF-06).
 */

export type PhotoDeps = {
  photos: PotPhotoStore;
  image: ImageProcessor;
  /** New file name (random, never derived from user input). */
  newId: () => string;
};

export const POT_PHOTO_MESSAGES = {
  failed: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  deleteFailed: "사진을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  notFound: "이미 삭제되었거나 찾을 수 없는 사진입니다.",
} as const;

/** Checks and re-encodes one picked photo. */
export async function cleanPotPhoto(
  image: ImageProcessor,
  bytes: Uint8Array,
): Promise<{ ok: true; jpeg: Uint8Array } | { ok: false; message: string }> {
  const cleaned = await cleanPhotos(image, [bytes]);
  return cleaned.ok ? { ok: true, jpeg: cleaned.photos[0] } : cleaned;
}

/** Uploads a cleaned photo into the owner's folder and links it to the pot. */
export async function attachPotPhoto(deps: PhotoDeps, plantId: string, jpeg: Uint8Array): Promise<boolean> {
  const userId = await deps.photos.userId();
  if (!userId) return false;
  const path = `${userId}/${deps.newId()}.jpg`;
  if (!(await deps.photos.upload(path, jpeg))) return false;
  let linked = false;
  try {
    linked = await deps.photos.insertPhoto(plantId, path);
  } catch {
    linked = false;
  }
  if (!linked) await deps.photos.removeObject(path).catch(() => false);
  return linked;
}

/** Checks, uploads and links one photo (S06 [사진 추가]). */
export async function addPotPhoto(
  deps: PhotoDeps,
  plantId: string,
  bytes: Uint8Array,
): Promise<{ ok: true } | { ok: false; kind: "invalid" | "failed"; message: string }> {
  const cleaned = await cleanPotPhoto(deps.image, bytes);
  if (!cleaned.ok) return { ok: false, kind: "invalid", message: cleaned.message };
  return (await attachPotPhoto(deps, plantId, cleaned.jpeg))
    ? { ok: true }
    : { ok: false, kind: "failed", message: POT_PHOTO_MESSAGES.failed };
}

/**
 * S06 [사진 삭제]. The photo is gone for the user once the row is deleted; the
 * file removal that follows is recorded and, if it fails, retried later.
 */
export async function deletePotPhoto(
  store: PotPhotoStore,
  plantId: string,
  photoId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let queued: Awaited<ReturnType<PotPhotoStore["deletePhoto"]>>;
  try {
    queued = await store.deletePhoto(plantId, photoId);
  } catch {
    return { ok: false, message: POT_PHOTO_MESSAGES.deleteFailed };
  }
  if (!queued) return { ok: false, message: POT_PHOTO_MESSAGES.notFound };
  const removed = await store.removeObject(queued.path).catch(() => false);
  await store
    .markDeletion(queued.requestId, queued.path, removed ? { ok: true } : { ok: false, error: "storage remove failed" })
    .catch(() => undefined);
  return { ok: true };
}

/** Adds each pot's newest photo with a signed link. A missing link leaves `url` null. */
export async function withNewestPhotos(store: PotPhotoStore, pots: PotView[]): Promise<PotView[]> {
  const newest = await store.newestPhotos(pots.map((pot) => pot.id));
  const urls = await store.signedUrls([...newest.values()].map((photo) => photo.path));
  return pots.map((pot) => {
    const photo = newest.get(pot.id);
    return photo ? { ...pot, photo: { id: photo.id, url: urls.get(photo.path) ?? null, createdAt: photo.createdAt } } : pot;
  });
}

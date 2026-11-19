import { vi } from "vitest";
import type { PotPhotoStore, StoredPotPhoto } from "@/repo/pot-photo-repo";
import type { ImageProcessor } from "@/service/adapters/image";
import type { PhotoDeps } from "@/service/pot-photos";

/** Test doubles for the pot photo store and image processing. */

export const USER_ID = "00000000-0000-0000-0000-00000000000a";
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
export const CLEAN = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);

export function fakePhotoStore(
  options: {
    userId?: string | null;
    upload?: boolean;
    insert?: boolean | "throw";
    remove?: boolean;
    newest?: StoredPotPhoto[];
    urls?: Record<string, string>;
    deleted?: { path: string; requestId: string } | null | "throw";
  } = {},
) {
  return {
    userId: vi.fn(async () => (options.userId === undefined ? USER_ID : options.userId)),
    upload: vi.fn<PotPhotoStore["upload"]>(async () => options.upload ?? true),
    removeObject: vi.fn<PotPhotoStore["removeObject"]>(async () => options.remove ?? true),
    insertPhoto: vi.fn<PotPhotoStore["insertPhoto"]>(async () => {
      if (options.insert === "throw") throw new Error("db down");
      return options.insert ?? true;
    }),
    newestPhotos: vi.fn(async () => new Map((options.newest ?? []).map((photo) => [photo.plantId, photo]))),
    signedUrls: vi.fn(async (paths: string[]) => {
      const urls = new Map<string, string>();
      for (const path of paths) if (options.urls?.[path]) urls.set(path, options.urls[path]);
      return urls;
    }),
    deletePhoto: vi.fn(async () => {
      if (options.deleted === "throw") throw new Error("db down");
      return options.deleted === undefined ? { path: `${USER_ID}/old.jpg`, requestId: "req-1" } : options.deleted;
    }),
    markDeletion: vi.fn(async () => {}),
  } satisfies PotPhotoStore;
}

export function fakeImage(answer: Awaited<ReturnType<ImageProcessor["toCleanJpeg"]>> = { ok: true, bytes: CLEAN }) {
  return { toCleanJpeg: vi.fn<ImageProcessor["toCleanJpeg"]>(async () => answer) } satisfies ImageProcessor;
}

export function photoDeps(photos = fakePhotoStore(), image = fakeImage()) {
  return { photos, image, newId: () => "new-photo" } satisfies PhotoDeps;
}

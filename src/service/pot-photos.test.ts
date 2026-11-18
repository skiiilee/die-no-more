import { describe, expect, it } from "vitest";
import type { PotView } from "@/types/plant";
import { CLEAN, JPEG, USER_ID, fakeImage, fakePhotoStore, photoDeps } from "../../tests/fakes/pot-photos";
import { POT_PHOTO_MESSAGES, addPotPhoto, attachPotPhoto, deletePotPhoto, withNewestPhotos } from "./pot-photos";

const POT_ID = "20000000-0000-0000-0000-00000000000a";

describe("attachPotPhoto (ADR-0003 D6)", () => {
  it("uploads into the owner's folder under a random name and links it to the pot", async () => {
    const deps = photoDeps();
    expect(await attachPotPhoto(deps, POT_ID, CLEAN)).toBe(true);
    expect(deps.photos.upload).toHaveBeenCalledWith(`${USER_ID}/new-photo.jpg`, CLEAN);
    expect(deps.photos.insertPhoto).toHaveBeenCalledWith(POT_ID, `${USER_ID}/new-photo.jpg`);
    expect(deps.photos.removeObject).not.toHaveBeenCalled();
  });

  it("removes the uploaded file at once when the link cannot be written, so nothing is left unlinked", async () => {
    for (const insert of [false, "throw"] as const) {
      const deps = photoDeps(fakePhotoStore({ insert }));
      expect(await attachPotPhoto(deps, POT_ID, CLEAN)).toBe(false);
      expect(deps.photos.removeObject).toHaveBeenCalledWith(`${USER_ID}/new-photo.jpg`);
    }
  });

  it("stores nothing when the upload fails or there is no signed-in user", async () => {
    const failed = photoDeps(fakePhotoStore({ upload: false }));
    expect(await attachPotPhoto(failed, POT_ID, CLEAN)).toBe(false);
    expect(failed.photos.insertPhoto).not.toHaveBeenCalled();

    const signedOut = photoDeps(fakePhotoStore({ userId: null }));
    expect(await attachPotPhoto(signedOut, POT_ID, CLEAN)).toBe(false);
    expect(signedOut.photos.upload).not.toHaveBeenCalled();
  });
});

describe("addPotPhoto (S06 [사진 추가])", () => {
  it("stores the server's re-encoded copy, never the received bytes", async () => {
    const deps = photoDeps();
    expect(await addPotPhoto(deps, POT_ID, JPEG)).toEqual({ ok: true });
    expect(deps.image.toCleanJpeg).toHaveBeenCalledWith(JPEG);
    expect(deps.photos.upload.mock.calls[0][1]).toBe(CLEAN);
  });

  it("refuses a file that is not a photo before uploading anything", async () => {
    const deps = photoDeps();
    const result = await addPotPhoto(deps, POT_ID, new Uint8Array([1, 2, 3, 4]));
    expect(result).toMatchObject({ ok: false, kind: "invalid" });
    expect(deps.photos.upload).not.toHaveBeenCalled();
  });

  it("refuses a photo the server cannot read", async () => {
    const deps = photoDeps(fakePhotoStore(), fakeImage({ ok: false }));
    expect(await addPotPhoto(deps, POT_ID, JPEG)).toMatchObject({ ok: false, kind: "invalid" });
    expect(deps.photos.upload).not.toHaveBeenCalled();
  });

  it("says the save failed when the upload fails", async () => {
    const deps = photoDeps(fakePhotoStore({ upload: false }));
    expect(await addPotPhoto(deps, POT_ID, JPEG)).toEqual({ ok: false, kind: "failed", message: POT_PHOTO_MESSAGES.failed });
  });
});

describe("deletePotPhoto (S06 [사진 삭제], D18)", () => {
  it("deletes the row with its queued file, removes the file and marks it done", async () => {
    const store = fakePhotoStore();
    expect(await deletePotPhoto(store, POT_ID, "photo-1")).toEqual({ ok: true });
    expect(store.deletePhoto).toHaveBeenCalledWith(POT_ID, "photo-1");
    expect(store.removeObject).toHaveBeenCalledWith(`${USER_ID}/old.jpg`);
    expect(store.markDeletion).toHaveBeenCalledWith("req-1", `${USER_ID}/old.jpg`, { ok: true });
  });

  it("still succeeds when the file removal fails, and leaves it queued as failed for a retry", async () => {
    const store = fakePhotoStore({ remove: false });
    expect(await deletePotPhoto(store, POT_ID, "photo-1")).toEqual({ ok: true });
    expect(store.markDeletion).toHaveBeenCalledWith("req-1", `${USER_ID}/old.jpg`, {
      ok: false,
      error: "storage remove failed",
    });
  });

  it("says when the photo is not there, and touches no file", async () => {
    const store = fakePhotoStore({ deleted: null });
    expect(await deletePotPhoto(store, POT_ID, "photo-1")).toEqual({ ok: false, message: POT_PHOTO_MESSAGES.notFound });
    expect(store.removeObject).not.toHaveBeenCalled();
  });

  it("says the delete failed when the database is down", async () => {
    const store = fakePhotoStore({ deleted: "throw" });
    expect(await deletePotPhoto(store, POT_ID, "photo-1")).toEqual({
      ok: false,
      message: POT_PHOTO_MESSAGES.deleteFailed,
    });
  });
});

describe("withNewestPhotos (S06, S11)", () => {
  const pot = (id: string) => ({ id, photo: null }) as unknown as PotView;

  it("adds each pot's newest photo with its signed link, and leaves pots without photos as they are", async () => {
    const store = fakePhotoStore({
      newest: [{ id: "p1", plantId: "a", path: `${USER_ID}/1.jpg`, createdAt: "2026-11-19T00:00:00Z" }],
      urls: { [`${USER_ID}/1.jpg`]: "https://signed.example/1" },
    });
    const [a, b] = await withNewestPhotos(store, [pot("a"), pot("b")]);
    expect(a.photo).toEqual({ id: "p1", url: "https://signed.example/1", createdAt: "2026-11-19T00:00:00Z" });
    expect(b.photo).toBeNull();
  });

  it("keeps the photo with no link when signing failed, so the screen can say so", async () => {
    const store = fakePhotoStore({ newest: [{ id: "p1", plantId: "a", path: `${USER_ID}/1.jpg`, createdAt: "x" }] });
    const [a] = await withNewestPhotos(store, [pot("a")]);
    expect(a.photo).toEqual({ id: "p1", url: null, createdAt: "x" });
  });
});

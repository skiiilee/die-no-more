import { describe, expect, it, vi } from "vitest";
import { PHOTO_RULES } from "@/types/photo";
import type { ImageProcessor } from "./adapters/image";
import { deleteUploadedPhoto, detectImageType, UPLOAD_MESSAGES, uploadPhoto } from "./photo-upload";
import { fakePhotoStore } from "../../tests/fakes/photos";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const CLEAN = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);

function processor(answer: Awaited<ReturnType<ImageProcessor["toCleanJpeg"]>> = { ok: true, bytes: CLEAN }) {
  return { toCleanJpeg: vi.fn(async () => answer) } satisfies ImageProcessor;
}

describe("detectImageType (ADR-0003 D4: the signature, not the declared type)", () => {
  it("knows JPEG, PNG and WebP by their first bytes", () => {
    expect(detectImageType(JPEG)).toBe("jpeg");
    expect(detectImageType(PNG)).toBe("png");
    expect(detectImageType(WEBP)).toBe("webp");
  });

  it("refuses anything else, including HEIC and text named .jpg", () => {
    expect(detectImageType(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("uploadPhoto", () => {
  it("stores the server's re-encoded JPEG, not the uploaded bytes", async () => {
    const photos = fakePhotoStore();
    const image = processor();
    expect(await uploadPhoto({ photos, image }, PNG)).toEqual({ kind: "ok", id: expect.any(String) });
    expect(image.toCleanJpeg).toHaveBeenCalledWith(PNG);
    expect(photos.saveUnattached).toHaveBeenCalledWith(CLEAN);
  });

  it("refuses a missing, too large or non-image file before decoding it", async () => {
    const image = processor();
    const photos = fakePhotoStore();
    expect(await uploadPhoto({ photos, image }, null)).toEqual({ kind: "invalid", message: UPLOAD_MESSAGES.missing });
    const big = new Uint8Array(PHOTO_RULES.maxUploadBytes + 1);
    big.set(JPEG);
    expect(await uploadPhoto({ photos, image }, big)).toEqual({ kind: "invalid", message: UPLOAD_MESSAGES.tooLarge });
    expect(await uploadPhoto({ photos, image }, new TextEncoder().encode("GIF89a"))).toEqual({
      kind: "invalid",
      message: UPLOAD_MESSAGES.type,
    });
    expect(image.toCleanJpeg).not.toHaveBeenCalled();
    expect(photos.saveUnattached).not.toHaveBeenCalled();
  });

  it("refuses a photo that cannot be decoded or is still too large after re-encoding", async () => {
    const photos = fakePhotoStore();
    expect(await uploadPhoto({ photos, image: processor({ ok: false }) }, JPEG)).toEqual({
      kind: "invalid",
      message: UPLOAD_MESSAGES.unreadable,
    });
    const huge = processor({ ok: true, bytes: new Uint8Array(PHOTO_RULES.maxUploadBytes + 1) });
    expect(await uploadPhoto({ photos, image: huge }, JPEG)).toMatchObject({ kind: "invalid" });
    expect(photos.saveUnattached).not.toHaveBeenCalled();
  });

  it("removes the user's unattached photos older than 24 hours first (D6)", async () => {
    const photos = fakePhotoStore();
    const now = new Date("2026-11-17T12:00:00Z");
    await uploadPhoto({ photos, image: processor(), now: () => now }, JPEG);
    expect(photos.removeUnattachedBefore).toHaveBeenCalledWith(new Date("2026-11-16T12:00:00Z"));
  });

  it("still stores the photo when that cleanup fails", async () => {
    const photos = fakePhotoStore();
    photos.removeUnattachedBefore.mockRejectedValue(new Error("storage down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await uploadPhoto({ photos, image: processor() }, JPEG)).toMatchObject({ kind: "ok" });
    error.mockRestore();
  });

  it("answers 'failed' when storing fails", async () => {
    const photos = fakePhotoStore();
    photos.saveUnattached.mockRejectedValue(new Error("upload failed"));
    expect(await uploadPhoto({ photos, image: processor() }, JPEG)).toEqual({ kind: "failed" });
  });
});

describe("deleteUploadedPhoto", () => {
  it("deletes an unattached photo and tells 'not found' and failures apart", async () => {
    const photos = fakePhotoStore({ photos: { a: JPEG } });
    expect(await deleteUploadedPhoto(photos, "a")).toBe("deleted");
    expect(await deleteUploadedPhoto(photos, "a")).toBe("not_found");
    photos.deleteUnattached.mockRejectedValue(new Error("down"));
    expect(await deleteUploadedPhoto(photos, "b")).toBe("failed");
  });
});

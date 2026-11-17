import type { PhotoStore } from "@/repo/photo-repo";
import { PHOTO_RULES, type UploadAnswer } from "@/types/photo";
import type { ImageProcessor } from "./adapters/image";

/**
 * POST /api/uploads (ADR-0003 D4, D6, D7). The browser has already resized the
 * photo; the server checks it again and its own result is what is stored:
 * 1. size (≤ 3 MB) and file signature (JPEG, PNG or WebP), whatever the
 *    declared type says;
 * 2. re-encoded to JPEG from the pixels only, so EXIF and location are gone;
 * 3. stored as an unattached identification photo.
 * Before storing, the user's unattached photos older than 24 hours are removed
 * (D6). This runs on upload until the daily cleanup job exists; a cleanup
 * failure never blocks the upload.
 */

export type UploadDeps = { photos: PhotoStore; image: ImageProcessor; now?: () => Date };

export const UPLOAD_MESSAGES = {
  missing: "사진 파일을 찾지 못했습니다. 다시 골라 주세요.",
  tooLarge: "사진이 너무 큽니다. 다른 사진을 골라 주세요.",
  type: "JPEG, PNG, WebP 사진만 올릴 수 있습니다. JPEG로 다시 선택해 주세요.",
  unreadable: "사진을 읽지 못했습니다. 다른 사진을 골라 주세요.",
} as const;

export type ImageType = "jpeg" | "png" | "webp";

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);

/** The image type from the file's first bytes, or null. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // "RIFF" <size> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

async function removeExpired(deps: UploadDeps): Promise<void> {
  const now = deps.now?.() ?? new Date();
  try {
    await deps.photos.removeUnattachedBefore(new Date(now.getTime() - PHOTO_RULES.unattachedLifetimeMs));
  } catch {
    console.error("Could not remove expired unattached photos");
  }
}

export async function uploadPhoto(deps: UploadDeps, bytes: Uint8Array | null): Promise<UploadAnswer> {
  if (!bytes || bytes.length === 0) return { kind: "invalid", message: UPLOAD_MESSAGES.missing };
  if (bytes.length > PHOTO_RULES.maxUploadBytes) return { kind: "invalid", message: UPLOAD_MESSAGES.tooLarge };
  if (!detectImageType(bytes)) return { kind: "invalid", message: UPLOAD_MESSAGES.type };

  const clean = await deps.image.toCleanJpeg(bytes);
  if (!clean.ok) return { kind: "invalid", message: UPLOAD_MESSAGES.unreadable };
  if (clean.bytes.length > PHOTO_RULES.maxUploadBytes) return { kind: "invalid", message: UPLOAD_MESSAGES.tooLarge };

  await removeExpired(deps);
  try {
    const { id } = await deps.photos.saveUnattached(clean.bytes);
    return { kind: "ok", id };
  } catch {
    return { kind: "failed" };
  }
}

/** DELETE /api/uploads/{id}: removes a photo that is not attached to anything. */
export async function deleteUploadedPhoto(photos: PhotoStore, id: string): Promise<"deleted" | "not_found" | "failed"> {
  try {
    return (await photos.deleteUnattached(id)) ? "deleted" : "not_found";
  } catch {
    return "failed";
  }
}

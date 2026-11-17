import { PHOTO_RULES } from "@/types/photo";
import type { ImageProcessor } from "./adapters/image";

/**
 * Server checks on the photos of one identification request (ADR-0003 D4).
 * The browser has already resized them; the server checks again and only its
 * own result is sent on:
 * 1. size (≤ 3 MB each) and file signature (JPEG, PNG or WebP), whatever the
 *    declared type says;
 * 2. re-encoded to JPEG from the pixels only, so EXIF and location are gone.
 * Nothing is stored (D6, changed 2026-11-18).
 */

export const PHOTO_MESSAGES = {
  missing: "사진 파일을 찾지 못했습니다. 다시 골라 주세요.",
  tooLarge: "사진이 너무 큽니다. 다른 사진을 골라 주세요.",
  requestTooLarge: "사진 용량이 너무 큽니다. 사진 수를 줄여 다시 시도해 주세요.",
  type: "JPEG, PNG, WebP 사진만 쓸 수 있습니다. JPEG로 다시 선택해 주세요.",
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

export type CleanedPhotos = { ok: true; photos: Uint8Array[] } | { ok: false; message: string };

/**
 * Checks and re-encodes every photo, in order. The first photo that cannot be
 * used stops the request; the message says which one ("사진 2: …").
 */
export async function cleanPhotos(image: ImageProcessor, photos: Uint8Array[]): Promise<CleanedPhotos> {
  const cleaned: Uint8Array[] = [];
  for (const [index, bytes] of photos.entries()) {
    const refuse = (message: string): CleanedPhotos => ({
      ok: false,
      message: photos.length > 1 ? `사진 ${index + 1}: ${message}` : message,
    });
    if (bytes.length === 0) return refuse(PHOTO_MESSAGES.missing);
    if (bytes.length > PHOTO_RULES.maxUploadBytes) return refuse(PHOTO_MESSAGES.tooLarge);
    if (!detectImageType(bytes)) return refuse(PHOTO_MESSAGES.type);
    const clean = await image.toCleanJpeg(bytes);
    if (!clean.ok) return refuse(PHOTO_MESSAGES.unreadable);
    if (clean.bytes.length > PHOTO_RULES.maxUploadBytes) return refuse(PHOTO_MESSAGES.tooLarge);
    cleaned.push(clean.bytes);
  }
  return { ok: true, photos: cleaned };
}

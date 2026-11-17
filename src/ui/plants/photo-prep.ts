import { PHOTO_RULES, PICKABLE_TYPES } from "@/types/photo";

/**
 * Browser-side photo preparation (ADR-0003 D4): JPEG, PNG or WebP (HEIC only
 * where the browser can decode it), original up to 15 MB, long side reduced
 * to 1600 px and re-encoded as JPEG at quality 0.85. The prepared photos stay
 * in this tab until [사진으로 식물 찾기]; all of them must fit in one request
 * (4 MB), so they are made smaller in steps when needed. The server checks
 * and re-encodes again.
 */

export const PICK_MESSAGES = {
  type: "JPEG, PNG, WebP 사진만 올릴 수 있습니다. JPEG로 다시 선택해 주세요.",
  tooLarge: "사진 한 장은 15MB까지 올릴 수 있습니다. 다른 사진을 골라 주세요.",
  unreadable: "이 사진을 열지 못했습니다. JPEG로 다시 선택해 주세요.",
  stillTooLarge: "사진을 줄였지만 아직 큽니다. 다른 사진을 골라 주세요.",
  requestTooLarge: "사진 용량이 너무 큽니다. 사진 수를 줄여 다시 시도해 주세요.",
} as const;

/** Size and quality steps: the first is D4; the others only when one request would be too large. */
export const PREP_STEPS = [
  { longSide: PHOTO_RULES.longSide, quality: PHOTO_RULES.jpegQuality },
  { longSide: 1280, quality: 0.75 },
  { longSide: 1024, quality: 0.65 },
] as const;

export type PrepStep = { longSide: number; quality: number };

/** A reason the picked file cannot be used, or null. Files without a type are left to decoding. */
export function checkPickedFile(file: { type: string; size: number }): string | null {
  if (file.type && !(PICKABLE_TYPES as readonly string[]).includes(file.type)) return PICK_MESSAGES.type;
  if (file.size > PHOTO_RULES.maxOriginalBytes) return PICK_MESSAGES.tooLarge;
  return null;
}

/** Size that fits inside `longSide` on both sides, keeping the ratio. Never enlarges. */
export function fitWithin(width: number, height: number, longSide: number = PHOTO_RULES.longSide) {
  const scale = Math.min(1, longSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type Prepared = { ok: true; blob: Blob } | { ok: false; message: string };

/** Decodes, resizes and re-encodes one picked photo. The EXIF orientation is applied while decoding. */
export async function prepareForUpload(file: File, step: PrepStep = PREP_STEPS[0]): Promise<Prepared> {
  const problem = checkPickedFile(file);
  if (problem) return { ok: false, message: problem };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // e.g. HEIC in a browser that cannot decode it (D4).
    return { ok: false, message: PICK_MESSAGES.unreadable };
  }
  const size = fitWithin(bitmap.width, bitmap.height, step.longSide);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return { ok: false, message: PICK_MESSAGES.unreadable };
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", step.quality));
  if (!blob) return { ok: false, message: PICK_MESSAGES.unreadable };
  if (blob.size > PHOTO_RULES.maxUploadBytes) return { ok: false, message: PICK_MESSAGES.stillTooLarge };
  return { ok: true, blob };
}

const totalSize = (blobs: Blob[]) => blobs.reduce((sum, blob) => sum + blob.size, 0);

/**
 * The photos for one identification request, made smaller step by step
 * (PREP_STEPS) from the original files until together they fit in `max`.
 */
export async function fitRequest(
  photos: { file: File; blob: Blob }[],
  prepare: (file: File, step: PrepStep) => Promise<Prepared> = prepareForUpload,
  max: number = PHOTO_RULES.maxRequestBytes,
): Promise<{ ok: true; blobs: Blob[] } | { ok: false; message: string }> {
  let blobs = photos.map((photo) => photo.blob);
  for (const step of PREP_STEPS.slice(1)) {
    if (totalSize(blobs) <= max) return { ok: true, blobs };
    const smaller: Blob[] = [];
    for (const photo of photos) {
      const prepared = await prepare(photo.file, step);
      if (!prepared.ok) return { ok: false, message: prepared.message };
      smaller.push(prepared.blob);
    }
    blobs = smaller;
  }
  return totalSize(blobs) <= max ? { ok: true, blobs } : { ok: false, message: PICK_MESSAGES.requestTooLarge };
}

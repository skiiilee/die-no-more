import sharp from "sharp";
import { PHOTO_RULES } from "@/types/photo";

/**
 * Server-side re-encoding of an uploaded photo (ADR-0003 D4). The result is a
 * new JPEG built from the pixels only: EXIF (including location), XMP and
 * other metadata are not copied. The EXIF orientation is applied to the
 * pixels first so the photo is not turned sideways when the tag is dropped.
 */

export type ImageProcessor = {
  toCleanJpeg(input: Uint8Array): Promise<{ ok: true; bytes: Uint8Array } | { ok: false }>;
};

/** Refuse decompression bombs: a 1600 px photo is far below this. */
const MAX_INPUT_PIXELS = 50_000_000;

export const sharpImageProcessor: ImageProcessor = {
  async toCleanJpeg(input) {
    try {
      const bytes = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: PHOTO_RULES.longSide, height: PHOTO_RULES.longSide, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: Math.round(PHOTO_RULES.jpegQuality * 100) })
        .toBuffer();
      return { ok: true, bytes: new Uint8Array(bytes) };
    } catch {
      return { ok: false };
    }
  },
};

import { describe, expect, it, vi } from "vitest";
import { PHOTO_RULES } from "@/types/photo";
import type { ImageProcessor } from "./adapters/image";
import { cleanPhotos, detectImageType, PHOTO_MESSAGES } from "./photo-cleaning";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const CLEAN = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);

function processor(answer: Awaited<ReturnType<ImageProcessor["toCleanJpeg"]>> = { ok: true, bytes: CLEAN }) {
  return { toCleanJpeg: vi.fn<ImageProcessor["toCleanJpeg"]>(async () => answer) } satisfies ImageProcessor;
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

describe("cleanPhotos", () => {
  it("returns the server's re-encoded JPEGs, in order, never the received bytes", async () => {
    const image = processor();
    expect(await cleanPhotos(image, [PNG, JPEG])).toEqual({ ok: true, photos: [CLEAN, CLEAN] });
    expect(image.toCleanJpeg.mock.calls.map((call) => call[0])).toEqual([PNG, JPEG]);
  });

  it("refuses an empty, too large or non-image file before decoding it", async () => {
    const image = processor();
    expect(await cleanPhotos(image, [new Uint8Array()])).toEqual({ ok: false, message: PHOTO_MESSAGES.missing });
    const big = new Uint8Array(PHOTO_RULES.maxUploadBytes + 1);
    big.set(JPEG);
    expect(await cleanPhotos(image, [big])).toEqual({ ok: false, message: PHOTO_MESSAGES.tooLarge });
    expect(await cleanPhotos(image, [new TextEncoder().encode("GIF89a")])).toEqual({ ok: false, message: PHOTO_MESSAGES.type });
    expect(image.toCleanJpeg).not.toHaveBeenCalled();
  });

  it("refuses a photo that cannot be decoded or is still too large after re-encoding", async () => {
    expect(await cleanPhotos(processor({ ok: false }), [JPEG])).toEqual({ ok: false, message: PHOTO_MESSAGES.unreadable });
    const huge = processor({ ok: true, bytes: new Uint8Array(PHOTO_RULES.maxUploadBytes + 1) });
    expect(await cleanPhotos(huge, [JPEG])).toEqual({ ok: false, message: PHOTO_MESSAGES.tooLarge });
  });

  it("says which photo could not be used when there are several", async () => {
    const image = processor();
    expect(await cleanPhotos(image, [JPEG, new TextEncoder().encode("x")])).toEqual({
      ok: false,
      message: `사진 2: ${PHOTO_MESSAGES.type}`,
    });
  });
});

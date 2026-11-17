import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { sharpImageProcessor } from "./image";

/** A real JPEG with EXIF (GPS and camera) and an orientation tag, like a phone photo. */
async function phonePhoto(width: number, height: number, orientation = 1): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 40 } } })
    .jpeg()
    .withMetadata({
      orientation,
      exif: {
        IFD0: { Make: "PhoneMaker", Model: "Phone 1" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "126/1 58/1 0/1" },
      },
    })
    .toBuffer();
  return new Uint8Array(buffer);
}

describe("sharpImageProcessor (ADR-0003 D4)", () => {
  it("removes EXIF, including location, from the stored photo", async () => {
    const input = await phonePhoto(800, 600);
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const result = await sharpImageProcessor.toCleanJpeg(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.bytes).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(Buffer.from(result.bytes).includes(Buffer.from("PhoneMaker"))).toBe(false);
  });

  it("shrinks the long side to 1600 px and never enlarges a small photo", async () => {
    const big = await sharpImageProcessor.toCleanJpeg(await phonePhoto(4000, 3000));
    const small = await sharpImageProcessor.toCleanJpeg(await phonePhoto(640, 480));
    if (!big.ok || !small.ok) throw new Error("expected both to decode");
    expect(await sharp(big.bytes).metadata()).toMatchObject({ width: 1600, height: 1200 });
    expect(await sharp(small.bytes).metadata()).toMatchObject({ width: 640, height: 480 });
  });

  it("applies the orientation tag before dropping it, so the photo is not sideways", async () => {
    // Orientation 6 = rotate 90° clockwise to view: a 800×600 sensor image is shown 600×800.
    const result = await sharpImageProcessor.toCleanJpeg(await phonePhoto(800, 600, 6));
    if (!result.ok) throw new Error("expected decode");
    const meta = await sharp(result.bytes).metadata();
    expect({ width: meta.width, height: meta.height, orientation: meta.orientation }).toEqual({
      width: 600,
      height: 800,
      orientation: undefined,
    });
  });

  it("re-encodes PNG and WebP as JPEG and refuses bytes that are not an image", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).webp().toBuffer();
    for (const input of [png, webp]) {
      const result = await sharpImageProcessor.toCleanJpeg(new Uint8Array(input));
      if (!result.ok) throw new Error("expected decode");
      expect((await sharp(result.bytes).metadata()).format).toBe("jpeg");
    }
    expect(await sharpImageProcessor.toCleanJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01]))).toEqual({ ok: false });
  });
});

import { describe, expect, it, vi } from "vitest";
import { checkPickedFile, fitRequest, fitWithin, PICK_MESSAGES, PREP_STEPS, type PrepStep } from "./photo-prep";

describe("checkPickedFile (ADR-0003 D4)", () => {
  it("accepts JPEG, PNG, WebP and HEIC (decoded by the browser if it can) up to 15 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(checkPickedFile({ type, size: 15 * 1024 * 1024 })).toBeNull();
    }
  });

  it("refuses other types and originals over 15 MB", () => {
    expect(checkPickedFile({ type: "image/gif", size: 10 })).toBe(PICK_MESSAGES.type);
    expect(checkPickedFile({ type: "application/pdf", size: 10 })).toBe(PICK_MESSAGES.type);
    expect(checkPickedFile({ type: "image/jpeg", size: 15 * 1024 * 1024 + 1 })).toBe(PICK_MESSAGES.tooLarge);
  });

  it("leaves a file without a declared type to decoding", () => {
    expect(checkPickedFile({ type: "", size: 10 })).toBeNull();
  });
});

describe("fitWithin", () => {
  it("shrinks the long side to 1600 px, keeping the ratio", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("never enlarges", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("fitRequest (one identification request, 4 MB in all)", () => {
  const MB = 1024 * 1024;
  const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });
  const blob = (size: number) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });
  /** Each step makes every photo this much smaller. */
  const prepareAt = (sizes: Record<number, number>) =>
    vi.fn(async (_file: File, step: PrepStep) => ({ ok: true as const, blob: blob(sizes[step.longSide]!) }));

  it("sends the prepared photos as they are when they already fit", async () => {
    const prepare = prepareAt({});
    const photos = [{ file: file("a"), blob: blob(MB) }, { file: file("b"), blob: blob(2 * MB) }];
    expect(await fitRequest(photos, prepare)).toEqual({ ok: true, blobs: photos.map((p) => p.blob) });
    expect(prepare).not.toHaveBeenCalled();
  });

  it("makes all photos smaller, from the originals, until they fit", async () => {
    const prepare = prepareAt({ 1280: 1.2 * MB, 1024: 0.7 * MB });
    const photos = Array.from({ length: 5 }, (_, i) => ({ file: file(String(i)), blob: blob(1.5 * MB) }));
    const result = await fitRequest(photos, prepare);
    expect(result.ok).toBe(true);
    // 5 × 1.2 MB is still too much; 5 × 0.7 MB fits.
    expect(prepare.mock.calls.map((call) => call[1])).toEqual([...Array(5).fill(PREP_STEPS[1]), ...Array(5).fill(PREP_STEPS[2])]);
    expect(prepare.mock.calls[0]?.[0]).toBe(photos[0]!.file);
    if (result.ok) expect(result.blobs.every((b) => b.size === blob(0.7 * MB).size)).toBe(true);
  });

  it("asks for fewer photos when even the smallest step is too large", async () => {
    const prepare = prepareAt({ 1280: 2 * MB, 1024: 1 * MB });
    const photos = Array.from({ length: 5 }, (_, i) => ({ file: file(String(i)), blob: blob(3 * MB) }));
    expect(await fitRequest(photos, prepare)).toEqual({ ok: false, message: PICK_MESSAGES.requestTooLarge });
  });
});

import { describe, expect, it } from "vitest";
import { checkPickedFile, fitWithin, PICK_MESSAGES } from "./photo-prep";

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

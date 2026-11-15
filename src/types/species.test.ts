import { describe, expect, it } from "vitest";
import { isStorableImageUrl } from "./species";

describe("isStorableImageUrl", () => {
  it("rejects pre-signed links that expire", () => {
    expect(isStorableImageUrl("https://s3.example.test/p.jpg?X-Amz-Expires=86400&X-Amz-Signature=abc")).toBe(false);
    expect(isStorableImageUrl("https://cdn.example.test/p.jpg?Expires=1&Signature=x")).toBe(false);
  });

  it("accepts plain links and rejects empty or broken ones", () => {
    expect(isStorableImageUrl("https://bs.plantnet.org/image/o/abc")).toBe(true);
    expect(isStorableImageUrl(null)).toBe(false);
    expect(isStorableImageUrl("not a url")).toBe(false);
  });
});

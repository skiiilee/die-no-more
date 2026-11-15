import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { parseKoreanName, parseSearch, trefle } from "./trefle";

function answering(status: number, body: unknown): HttpClient & { get: ReturnType<typeof vi.fn> } {
  return {
    get: vi.fn(async () => ({
      attempts: 1,
      result: { kind: "response" as const, status, headers: new Headers(), body: JSON.stringify(body) },
    })),
  };
}

describe("trefle parsing", () => {
  it("normalizes search results", () => {
    expect(
      parseSearch({
        data: [
          { id: 1, scientific_name: "Monstera deliciosa", common_name: null, family: "Araceae", image_url: "https://bs.plantnet.org/m.jpg" },
          { id: 2, scientific_name: "", common_name: "nameless" },
        ],
      }),
    ).toEqual([
      {
        provider: "trefle",
        providerId: 1,
        scientificName: "Monstera deliciosa",
        commonNameEn: null,
        family: "Araceae",
        imageUrl: "https://bs.plantnet.org/m.jpg",
      },
    ]);
  });

  it("reads the first Korean common name (live check: main_species.common_names.ko)", () => {
    expect(parseKoreanName({ data: { main_species: { common_names: { ko: ["  몬스테라 ", "봉래초"], en: ["x"] } } } })).toBe(
      "몬스테라",
    );
  });

  it("returns null when Trefle has no Korean name", () => {
    expect(parseKoreanName({ data: { main_species: { common_names: { en: ["Swiss cheese plant"] } } } })).toBeNull();
    expect(parseKoreanName({ data: {} })).toBeNull();
    expect(parseKoreanName(null)).toBeNull();
  });
});

describe("trefle adapter", () => {
  it("treats a 429 as a short back-off, never as a daily quota", async () => {
    expect(await trefle(answering(429, {}), "t").search("ficus")).toEqual({ kind: "unavailable", calls: 1 });
    expect(await trefle(answering(429, {}), "t").koreanName(1)).toEqual({ kind: "unavailable", calls: 1 });
  });

  it("answers 'no Korean name' for a plant Trefle does not have", async () => {
    expect(await trefle(answering(404, {}), "t").koreanName(1)).toEqual({ kind: "ok", koreanName: null, calls: 1 });
  });

  it("asks the plant details endpoint with the token", async () => {
    const client = answering(200, { data: {} });
    await trefle(client, "secret").koreanName(42);
    const url = new URL(client.get.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://trefle.io/api/v1/plants/42");
    expect(url.searchParams.get("token")).toBe("secret");
  });
});

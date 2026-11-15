import { describe, expect, it, vi } from "vitest";
import type { ProviderClient } from "./http";
import { parseKoreanName, parseSearch, trefle, trefleUsage } from "./trefle";

function answering(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    get: vi.fn<ProviderClient["get"]>(async () => ({
      attempts: 1,
      result: {
        kind: "response" as const,
        status,
        headers: new Headers(headers),
        body: typeof body === "string" ? body : JSON.stringify(body),
      },
    })),
  } satisfies ProviderClient;
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

  it("returns null for a body that is not a result list", () => {
    expect(parseSearch(undefined)).toBeNull();
    expect(parseSearch({ error: true })).toBeNull();
    expect(parseSearch({ data: [] })).toEqual([]);
  });

  it("reads the first Korean common name (live check: main_species.common_names.ko)", () => {
    expect(parseKoreanName({ data: { main_species: { common_names: { ko: ["  몬스테라 ", "봉래초"], en: ["x"] } } } })).toEqual({
      ok: true,
      name: "몬스테라",
    });
  });

  it("says 'no Korean name' only for a valid plant record", () => {
    expect(parseKoreanName({ data: { main_species: { common_names: { en: ["Swiss cheese plant"] } } } })).toEqual({
      ok: true,
      name: null,
    });
    expect(parseKoreanName({ data: {} })).toEqual({ ok: true, name: null });
    expect(parseKoreanName(undefined)).toEqual({ ok: false });
    expect(parseKoreanName({ message: "maintenance" })).toEqual({ ok: false });
  });
});

describe("trefle adapter", () => {
  it("treats a 429 as unavailable now, never as a daily quota", async () => {
    expect(await trefle(answering(429, {}), "t").search("ficus")).toEqual({ kind: "unavailable" });
    expect(await trefle(answering(429, {}), "t").koreanName(1)).toEqual({ kind: "unavailable" });
  });

  it("answers 'no Korean name' for a plant Trefle does not have", async () => {
    expect(await trefle(answering(404, {}), "t").koreanName(1)).toEqual({ kind: "ok", koreanName: null });
  });

  it("treats a 200 with a broken body as a failure (PR #15 review, item 2)", async () => {
    expect(await trefle(answering(200, "<html>temporary maintenance</html>"), "t").koreanName(1)).toEqual({ kind: "unavailable" });
    expect(await trefle(answering(200, "<html>temporary maintenance</html>"), "t").search("ficus")).toEqual({ kind: "unavailable" });
  });

  it("asks the plant details endpoint with the token", async () => {
    const client = answering(200, { data: {} });
    await trefle(client, "secret").koreanName(42);
    const url = new URL(client.get.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://trefle.io/api/v1/plants/42");
    expect(url.searchParams.get("token")).toBe("secret");
  });

  it("records a 429 with its Retry-After time, and a missing header as one minute", () => {
    const now = Date.parse("2026-11-15T03:00:00Z");
    const result = (headers: Record<string, string>) => ({
      kind: "response" as const,
      status: 429,
      headers: new Headers(headers),
      body: "",
    });
    expect(trefleUsage(result({ "retry-after": "20" }), now)).toEqual({ status: "failure", retryAt: new Date(now + 20_000) });
    expect(trefleUsage(result({}), now)).toEqual({ status: "failure", retryAt: new Date(now + 60_000) });
  });
});

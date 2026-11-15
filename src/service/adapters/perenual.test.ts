import { describe, expect, it, vi } from "vitest";
import type { HttpCall, HttpResult, ProviderClient } from "./http";
import { parseBenchmark, parseDetails, parseSearch, perenual, perenualUsage } from "./perenual";

function response(status: number, body: unknown): HttpResult {
  return { kind: "response", status, headers: new Headers(), body: typeof body === "string" ? body : JSON.stringify(body) };
}

function answering(status: number, body: unknown): ProviderClient & { get: ReturnType<typeof vi.fn> } {
  const call: HttpCall = { attempts: 1, result: response(status, body) };
  return { get: vi.fn(async () => call) };
}

function blocked(reason: "limit" | "quota" | "cooldown" | "usage_unavailable"): ProviderClient {
  return { get: async () => ({ attempts: 0, result: { kind: "blocked", reason } }) };
}

const UPGRADE = "Please Upgrade Plan - https://perenual.com/subscription-api-pricing. Sorry😬";

describe("parseBenchmark (live check 2026-11-13)", () => {
  it("reads the quoted range Perenual actually returns", () => {
    expect(parseBenchmark({ value: '"7-10"', unit: "days" })).toEqual({ min: 7, max: 10 });
  });

  it("reads a plain range or a single number of days", () => {
    expect(parseBenchmark({ value: "5-7", unit: "days" })).toEqual({ min: 5, max: 7 });
    expect(parseBenchmark({ value: " 7 ", unit: "Days" })).toEqual({ min: 7, max: 7 });
    expect(parseBenchmark({ value: 7, unit: "days" })).toEqual({ min: 7, max: 7 });
  });

  it("returns no benchmark for anything else, so no interval is invented (D16)", () => {
    for (const value of [
      { value: "7-10", unit: "weeks" },
      { value: "about a week", unit: "days" },
      { value: "10-7", unit: "days" },
      { value: "0", unit: "days" },
      { value: "7-10-14", unit: "days" },
      { value: null, unit: "days" },
      null,
      "7-10",
    ]) {
      expect(parseBenchmark(value)).toBeNull();
    }
  });
});

describe("parseSearch", () => {
  it("normalizes species-list items and keeps https photos only", () => {
    const species = parseSearch({
      data: [
        {
          id: 2773,
          common_name: "golden pothos",
          scientific_name: ["Epipremnum aureum"],
          family: "Araceae",
          default_image: { small_url: "https://perenual.com/p.jpg" },
        },
        { id: 5257, common_name: "Swiss cheese plant", scientific_name: ["Monstera deliciosa"], default_image: null },
        { id: 1, scientific_name: [], common_name: "no name" },
        { id: "x", scientific_name: ["Bad id"] },
        { id: 9, scientific_name: ["Locked photo"], default_image: { small_url: "Upgrade Plans To Premium" } },
      ],
    });
    expect(species).toEqual([
      {
        provider: "perenual",
        providerId: 2773,
        scientificName: "Epipremnum aureum",
        commonNameEn: "golden pothos",
        family: "Araceae",
        imageUrl: "https://perenual.com/p.jpg",
      },
      expect.objectContaining({ providerId: 5257, imageUrl: null }),
      expect.objectContaining({ providerId: 9, imageUrl: null }),
    ]);
  });

  it("tells a body that is not a species list (null) from an empty list (PR #15 review, item 2)", () => {
    expect(parseSearch(undefined)).toBeNull();
    expect(parseSearch("Upgrade")).toBeNull();
    expect(parseSearch({ data: "x" })).toBeNull();
    expect(parseSearch({ data: [] })).toEqual([]);
  });
});

describe("parseDetails", () => {
  it("keeps watering, benchmark, sunlight and care level, and ignores the rest", () => {
    expect(
      parseDetails({
        id: 2961,
        watering: "Average",
        watering_general_benchmark: { value: '"7-10"', unit: "days" },
        sunlight: ["Part shade", "full shade", 3],
        care_level: "Medium",
        description: " The Indian Rubberplant is a houseplant. ",
        xWateringQuality: "Upgrade Plans To Premium",
      }),
    ).toEqual({
      watering: "Average",
      wateringBenchmark: { min: 7, max: 10 },
      sunlight: ["part shade", "full shade"],
      careLevel: "Medium",
      description: "The Indian Rubberplant is a houseplant.",
    });
  });

  it("returns null for a body that is not a species record", () => {
    expect(parseDetails(undefined)).toBeNull();
    expect(parseDetails({ watering: "Average" })).toBeNull();
    expect(parseDetails([])).toBeNull();
  });
});

describe("perenual adapter", () => {
  it("never requests care details above the free range", async () => {
    const client = answering(200, {});
    expect(await perenual(client, "k").details(5257)).toEqual({ kind: "outside_free_range" });
    expect(client.get).not.toHaveBeenCalled();
  });

  it("reads 429 'Please Upgrade Plan' as outside the free range, not as a quota", async () => {
    expect(await perenual(answering(429, UPGRADE), "k").details(2000)).toEqual({ kind: "outside_free_range" });
  });

  it("reads any other 429 as the daily quota", async () => {
    expect(await perenual(answering(429, "Too Many Requests"), "k").details(2000)).toEqual({ kind: "quota" });
    expect(await perenual(answering(429, "Too Many Requests"), "k").search("ficus")).toEqual({ kind: "quota" });
  });

  it("separates a missing species from a failure", async () => {
    expect(await perenual(answering(404, ""), "k").details(10)).toEqual({ kind: "not_found" });
    expect(await perenual(answering(502, ""), "k").details(10)).toEqual({ kind: "unavailable" });
  });

  it("returns parsed care for a species inside the free range", async () => {
    const answer = await perenual(answering(200, { id: 2773, watering: "Frequent" }), "k").details(2773);
    expect(answer).toMatchObject({ kind: "ok", care: { watering: "Frequent" } });
  });

  it("treats a 200 with a broken body as a failure, never as 'no data' (PR #15 review, item 2)", async () => {
    const maintenance = "<html>temporary maintenance</html>";
    expect(await perenual(answering(200, maintenance), "k").details(2773)).toEqual({ kind: "unavailable" });
    expect(await perenual(answering(200, maintenance), "k").search("ficus")).toEqual({ kind: "unavailable" });
    expect(await perenual(answering(200, { data: [] }), "k").search("ficus")).toEqual({ kind: "ok", species: [] });
  });

  it("maps a refused call gate: our cap or the provider quota → quota, anything else → unavailable", async () => {
    expect(await perenual(blocked("limit"), "k").search("ficus")).toEqual({ kind: "quota" });
    expect(await perenual(blocked("quota"), "k").details(10)).toEqual({ kind: "quota" });
    expect(await perenual(blocked("usage_unavailable"), "k").search("ficus")).toEqual({ kind: "unavailable" });
  });

  it("records the right usage status for each answer", () => {
    expect(perenualUsage(response(200, {}))).toEqual({ status: "success", retryAt: null });
    expect(perenualUsage(response(429, UPGRADE))).toEqual({ status: "success", retryAt: null });
    expect(perenualUsage(response(429, "Too Many Requests"))).toEqual({ status: "quota_exceeded", retryAt: null });
    expect(perenualUsage(response(503, ""))).toEqual({ status: "failure", retryAt: null });
    expect(perenualUsage({ kind: "failed", reason: "timeout" })).toEqual({ status: "failure", retryAt: null });
  });

  it("sends the key and query as URL parameters to the server-side API", async () => {
    const client = answering(200, { data: [] });
    await perenual(client, "secret").search("고무 나무");
    const url = new URL(client.get.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe("https://perenual.com/api/v2/species-list");
    expect(url.searchParams.get("key")).toBe("secret");
    expect(url.searchParams.get("q")).toBe("고무 나무");
  });
});

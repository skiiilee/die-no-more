import { describe, expect, it, vi } from "vitest";
import type { HttpResult, ProviderPostClient } from "./http";
import { parseIdentify, parseRateLimit, plantnet, plantnetUsage } from "./plantnet";

/** Shape of the live answer (2026-11-17, Monstera photo), trimmed. */
const LIVE = {
  query: { project: "all", images: ["bf79e39a"], organs: ["auto"] },
  bestMatch: "Monstera deliciosa Liebm.",
  version: "2026-03-20 (7.5)",
  remainingIdentificationRequests: 499,
  results: [
    {
      score: 0.88453,
      species: {
        scientificNameWithoutAuthor: "Monstera deliciosa",
        scientificNameAuthorship: "Liebm.",
        genus: { scientificNameWithoutAuthor: "Monstera" },
        family: { scientificNameWithoutAuthor: "Araceae" },
        commonNames: ["Monstera", "Tarovine", "Swiss Cheese Plant"],
        scientificName: "Monstera deliciosa Liebm.",
      },
      gbif: { id: "2868241" },
      images: [
        {
          organ: "leaf",
          author: "Soynano Gallego",
          license: "cc-by-sa",
          url: {
            o: "https://bs.plantnet.org/image/o/6c79",
            m: "https://bs.plantnet.org/image/m/6c79",
            s: "https://bs.plantnet.org/image/s/6c79",
          },
          citation: "Soynano Gallego / Pl@ntNet, cc-by-sa",
        },
      ],
    },
    {
      score: 0.0159,
      species: {
        scientificNameWithoutAuthor: "Philodendron bipinnatifidum",
        family: { scientificNameWithoutAuthor: "Araceae" },
        commonNames: [],
      },
      images: [],
    },
  ],
};

function answering(result: HttpResult) {
  return { post: vi.fn<ProviderPostClient["post"]>(async () => ({ attempts: 1, result })) } satisfies ProviderPostClient;
}

const response = (status: number, body: unknown, headers: Record<string, string> = {}): HttpResult => ({
  kind: "response",
  status,
  headers: new Headers(headers),
  body: typeof body === "string" ? body : JSON.stringify(body),
});

describe("parseIdentify", () => {
  it("keeps Pl@ntNet's order, the score, names without author, family and the credited photo", () => {
    expect(parseIdentify(LIVE)).toEqual({
      version: "2026-03-20 (7.5)",
      species: [
        {
          score: 0.88453,
          scientificName: "Monstera deliciosa",
          commonNameEn: "Monstera",
          family: "Araceae",
          imageUrl: "https://bs.plantnet.org/image/m/6c79",
          imageCredit: "Soynano Gallego / Pl@ntNet, cc-by-sa",
        },
        {
          score: 0.0159,
          scientificName: "Philodendron bipinnatifidum",
          commonNameEn: null,
          family: "Araceae",
          imageUrl: null,
          imageCredit: null,
        },
      ],
    });
  });

  it("skips results without a name or score, and refuses a body that is not a result list", () => {
    expect(parseIdentify({ results: [{ score: 0.5, species: {} }, { species: { scientificNameWithoutAuthor: "X y" } }] })).toEqual({
      version: null,
      species: [],
    });
    expect(parseIdentify({ message: "maintenance" })).toBeNull();
    expect(parseIdentify(undefined)).toBeNull();
  });

  it("never keeps a non-https photo", () => {
    const body = {
      results: [{ score: 0.9, species: { scientificNameWithoutAuthor: "A b" }, images: [{ url: { m: "http://x.test/a" } }] }],
    };
    expect(parseIdentify(body)?.species[0].imageUrl).toBeNull();
  });
});

describe("plantnet adapter", () => {
  it("sends each photo with organ 'auto' to /v2/identify/all, key in the query string only", async () => {
    const client = answering(response(200, LIVE));
    await plantnet(client, "secret").identify([new Uint8Array([1]), new Uint8Array([2])]);
    const [url, body, operation] = client.post.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://my-api.plantnet.org/v2/identify/all");
    expect(parsed.searchParams.get("api-key")).toBe("secret");
    expect(parsed.searchParams.get("include-related-images")).toBe("true");
    expect(operation).toBe("identify");
    const form = body();
    expect(form.getAll("images")).toHaveLength(2);
    expect(form.getAll("organs")).toEqual(["auto", "auto"]);
    expect([...form.keys()]).not.toContain("api-key");
  });

  it("maps answers: 404 is 'no match', 429 quota, bad image rejected, others unavailable", async () => {
    const identify = (result: HttpResult) => plantnet(answering(result), "k").identify([new Uint8Array([1])]);
    expect(await identify(response(200, LIVE))).toMatchObject({ kind: "ok", version: "2026-03-20 (7.5)" });
    expect(await identify(response(404, { message: "Species not found" }))).toEqual({ kind: "none" });
    expect(await identify(response(200, { results: [] }))).toEqual({ kind: "none" });
    expect(await identify(response(429, {}))).toEqual({ kind: "quota" });
    expect(await identify(response(400, {}))).toEqual({ kind: "rejected" });
    expect(await identify(response(413, {}))).toEqual({ kind: "rejected" });
    expect(await identify(response(401, {}))).toEqual({ kind: "unavailable" });
    expect(await identify(response(503, {}))).toEqual({ kind: "unavailable" });
    expect(await identify({ kind: "failed", reason: "timeout" })).toEqual({ kind: "unavailable" });
  });

  it("treats a 200 with a broken body as a failure, never as 'no match'", async () => {
    const result = await plantnet(answering(response(200, "<html>maintenance</html>")), "k").identify([new Uint8Array([1])]);
    expect(result).toEqual({ kind: "unavailable" });
  });

  it("reports our own cap and the provider's quota as quota; an unrecordable reservation as unavailable", async () => {
    const identify = (reason: "limit" | "quota" | "cooldown" | "usage_unavailable") =>
      plantnet(answering({ kind: "blocked", reason }), "k").identify([new Uint8Array([1])]);
    expect(await identify("limit")).toEqual({ kind: "quota" });
    expect(await identify("quota")).toEqual({ kind: "quota" });
    expect(await identify("cooldown")).toEqual({ kind: "quota" });
    expect(await identify("usage_unavailable")).toEqual({ kind: "unavailable" });
  });
});

describe("plantnetUsage (ADR-0004 D5: the provider's answer first)", () => {
  const now = Date.parse("2026-11-17T06:00:00Z");

  it("reads the RateLimit header from the live answer", () => {
    const headers = new Headers({ ratelimit: '"dailyQuota";r=499;t=63873;pk=:Nzc1:' });
    expect(parseRateLimit(headers)).toEqual({ remaining: 499, resetSeconds: 63873 });
    expect(parseRateLimit(new Headers())).toBeNull();
  });

  it("records a 429 as the daily quota, resuming at Retry-After or the next 00:00 UTC", () => {
    expect(plantnetUsage(response(429, {}, { "retry-after": "3600" }), now)).toEqual({
      status: "quota_exceeded",
      retryAt: new Date(now + 3_600_000),
    });
    expect(plantnetUsage(response(429, {}), now)).toEqual({
      status: "quota_exceeded",
      retryAt: new Date("2026-11-18T00:00:00Z"),
    });
  });

  it("stops after the call that used the provider's last identification", () => {
    expect(plantnetUsage(response(200, LIVE, { ratelimit: '"dailyQuota";r=0;t=600' }), now)).toEqual({
      status: "success",
      retryAt: new Date(now + 600_000),
    });
    expect(plantnetUsage(response(200, LIVE, { ratelimit: '"dailyQuota";r=12;t=600' }), now)).toEqual({
      status: "success",
      retryAt: null,
    });
  });

  it("counts 404 as a used call and 5xx or no answer as a failure", () => {
    expect(plantnetUsage(response(404, {}), now)).toEqual({ status: "success", retryAt: null });
    expect(plantnetUsage(response(502, {}), now)).toEqual({ status: "failure", retryAt: null });
    expect(plantnetUsage({ kind: "failed", reason: "network" }, now)).toEqual({ status: "failure", retryAt: null });
  });
});

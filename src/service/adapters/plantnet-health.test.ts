import { describe, expect, it, vi } from "vitest";
import type { HttpResult, ProviderPostClient } from "./http";
import { parseDiseases, plantnetHealth } from "./plantnet-health";

/** Documented shape (my.plantnet.org/doc/api/diseases); replaced by the live answer after the live check. */
const DOCUMENTED = {
  results: [
    { name: "PHYTIN", score: 0.41, description: "Phytophthora infestans" },
    { name: "1PUCCG", score: 0.22, description: "Puccinia genus" },
    { name: "ERYSCI", score: 0.12, description: "Erysiphe cichoracearum" },
    { name: "BOTRCI", score: 0.07, description: "Botrytis cinerea" },
    { name: "TETRUR", score: 0.01, description: "Tetranychus urticae" },
  ],
};

function answering(result: HttpResult) {
  return { post: vi.fn<ProviderPostClient["post"]>(async () => ({ attempts: 1, result })) } satisfies ProviderPostClient;
}

const response = (status: number, body: unknown): HttpResult => ({
  kind: "response",
  status,
  headers: new Headers(),
  body: typeof body === "string" ? body : JSON.stringify(body),
});

describe("parseDiseases", () => {
  it("keeps the best three possible causes at or above the score bar, best first", () => {
    expect(parseDiseases(DOCUMENTED)).toEqual([
      { code: "PHYTIN", name: "Phytophthora infestans", score: 0.41 },
      { code: "1PUCCG", name: "Puccinia genus", score: 0.22 },
      { code: "ERYSCI", name: "Erysiphe cichoracearum", score: 0.12 },
    ]);
  });

  it("drops low scores, odd codes and repeats; an empty list means nothing passed", () => {
    expect(
      parseDiseases({
        results: [
          { name: "TETRUR", score: 0.01, description: "Tetranychus urticae" },
          { name: "not a code", score: 0.9, description: "x" },
          { name: "PHYTIN", score: "0.9", description: "x" },
          { name: "BOTRCI", score: 0.3 },
          { name: "BOTRCI", score: 0.2, description: "again" },
        ],
      }),
    ).toEqual([{ code: "BOTRCI", name: "BOTRCI", score: 0.3 }]);
    expect(parseDiseases({ results: [] })).toEqual([]);
  });

  it("refuses a body that is not a result list", () => {
    expect(parseDiseases({ message: "maintenance" })).toBeNull();
    expect(parseDiseases(undefined)).toBeNull();
  });
});

describe("plantnetHealth adapter", () => {
  it("sends each photo with organ 'auto' to /v2/diseases/identify, key in the query string only", async () => {
    const client = answering(response(200, DOCUMENTED));
    await plantnetHealth(client, "secret").diagnose([new Uint8Array([1]), new Uint8Array([2])]);
    const [url, body, operation] = client.post.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://my-api.plantnet.org/v2/diseases/identify");
    expect(parsed.searchParams.get("api-key")).toBe("secret");
    expect(operation).toBe("diseases");
    const form = body();
    expect(form.getAll("images")).toHaveLength(2);
    expect(form.getAll("organs")).toEqual(["auto", "auto"]);
    expect([...form.keys()]).not.toContain("api-key");
  });

  it("maps answers: 404 and nothing above the bar are 'none', 429 quota, bad image rejected", async () => {
    const diagnose = (result: HttpResult) => plantnetHealth(answering(result), "k").diagnose([new Uint8Array([1])]);
    expect(await diagnose(response(200, DOCUMENTED))).toMatchObject({ kind: "ok" });
    expect(await diagnose(response(200, { results: [{ name: "TETRUR", score: 0.01 }] }))).toEqual({ kind: "none" });
    expect(await diagnose(response(404, { message: "not found" }))).toEqual({ kind: "none" });
    expect(await diagnose(response(429, {}))).toEqual({ kind: "quota" });
    expect(await diagnose(response(400, {}))).toEqual({ kind: "rejected" });
    expect(await diagnose(response(503, {}))).toEqual({ kind: "unavailable" });
    expect(await diagnose({ kind: "failed", reason: "timeout" })).toEqual({ kind: "unavailable" });
    expect(await diagnose(response(200, "<html>maintenance</html>"))).toEqual({ kind: "unavailable" });
  });

  it("reports our cap and the provider's quota as quota; an unrecordable reservation as unavailable", async () => {
    const diagnose = (reason: "limit" | "quota" | "usage_unavailable") =>
      plantnetHealth(answering({ kind: "blocked", reason }), "k").diagnose([new Uint8Array([1])]);
    expect(await diagnose("limit")).toEqual({ kind: "quota" });
    expect(await diagnose("quota")).toEqual({ kind: "quota" });
    expect(await diagnose("usage_unavailable")).toEqual({ kind: "unavailable" });
  });
});

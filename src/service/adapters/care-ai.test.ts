import { describe, expect, it, vi } from "vitest";
import type { HttpCall, HttpResult, ProviderJsonClient } from "./http";
import { careAi, careAiUsage, parseCareAnswer } from "./care-ai";

const CONFIG = { baseUrl: "https://ai.example.test/v1", key: "secret-key", model: "model-x" };

function chat(content: string) {
  return { choices: [{ message: { role: "assistant", content } }] };
}

const VALID = {
  care_level: "보통",
  light: "밝은 간접광",
  watering: "흙 겉면이 마르면 충분히",
  watering_interval_days: { min: 7, max: 10 },
  temperature: "18~25도",
  soil: "배수가 좋은 흙",
  fertilizer: "봄·여름 한 달에 한 번",
  description: "실내에서 잘 자라는 관엽식물입니다.",
};

function response(status: number, body: unknown): HttpResult {
  return { kind: "response", status, headers: new Headers(), body: typeof body === "string" ? body : JSON.stringify(body) };
}

function clientReturning(result: HttpResult) {
  const postJson = vi.fn(async (): Promise<HttpCall> => ({ result, attempts: 1 }));
  return { client: { postJson } satisfies ProviderJsonClient, postJson };
}

describe("parseCareAnswer", () => {
  it("keeps every valid value", () => {
    expect(parseCareAnswer(chat(JSON.stringify(VALID)))).toEqual({
      careLevel: "보통",
      light: "밝은 간접광",
      watering: "흙 겉면이 마르면 충분히",
      wateringBenchmark: { min: 7, max: 10 },
      temperature: "18~25도",
      soil: "배수가 좋은 흙",
      fertilizer: "봄·여름 한 달에 한 번",
      description: "실내에서 잘 자라는 관엽식물입니다.",
    });
  });

  it("accepts a JSON answer wrapped in a Markdown code fence", () => {
    expect(parseCareAnswer(chat("```json\n" + JSON.stringify(VALID) + "\n```"))?.light).toBe("밝은 간접광");
  });

  it("drops a care level outside the three Korean labels", () => {
    expect(parseCareAnswer(chat(JSON.stringify({ ...VALID, care_level: "Extreme" })))?.careLevel).toBeNull();
  });

  it("drops an interval that is out of range or reversed, and keeps the other fields", () => {
    expect(parseCareAnswer(chat(JSON.stringify({ ...VALID, watering_interval_days: { min: 10, max: 7 } })))).toMatchObject({
      wateringBenchmark: null,
      light: "밝은 간접광",
    });
    expect(parseCareAnswer(chat(JSON.stringify({ ...VALID, watering_interval_days: { min: 1, max: 400 } })))?.wateringBenchmark).toBeNull();
    expect(parseCareAnswer(chat(JSON.stringify({ ...VALID, watering_interval_days: { min: 7.5, max: 9 } })))?.wateringBenchmark).toBeNull();
  });

  it("rejects a text value longer than 200 characters instead of cutting it", () => {
    expect(parseCareAnswer(chat(JSON.stringify({ ...VALID, soil: "가".repeat(201) })))?.soil).toBeNull();
  });

  it("returns null when the content is not a JSON object (a broken answer, not 'no data')", () => {
    expect(parseCareAnswer(chat("not json"))).toBeNull();
    expect(parseCareAnswer(chat("[1,2,3]"))).toBeNull();
    expect(parseCareAnswer({ choices: [] })).toBeNull();
    expect(parseCareAnswer("plain text")).toBeNull();
  });
});

describe("careAi", () => {
  it("sends one JSON chat request with the key in a header, never in the URL", async () => {
    const { client, postJson } = clientReturning(response(200, chat(JSON.stringify(VALID))));
    await careAi(client, CONFIG).describe("Ficus elastica");
    const [url, json, headers, operation] = postJson.mock.calls[0] as unknown as [string, { model: string; messages: { content: string }[] }, Record<string, string>, string];
    expect(url).toBe("https://ai.example.test/v1/chat/completions");
    expect(url).not.toContain("secret-key");
    expect(headers).toEqual({ authorization: "Bearer secret-key" });
    expect(json.model).toBe("model-x");
    expect(json.messages[1].content).toContain("Ficus elastica");
    expect(operation).toBe("care");
  });

  it("returns ok with the configured model name, for provenance (ADR-0005 D4)", async () => {
    const { client } = clientReturning(response(200, chat(JSON.stringify(VALID))));
    const answer = await careAi(client, CONFIG).describe("Ficus elastica");
    expect(answer).toMatchObject({ kind: "ok", model: "model-x", care: { light: "밝은 간접광" } });
  });

  it("returns none when every value is empty", async () => {
    const empty = Object.fromEntries(Object.keys(VALID).map((key) => [key, null]));
    const { client } = clientReturning(response(200, chat(JSON.stringify(empty))));
    expect(await careAi(client, CONFIG).describe("Unknown plant")).toEqual({ kind: "none", model: "model-x" });
  });

  it("returns unavailable for a 200 whose content is not the expected JSON", async () => {
    const { client } = clientReturning(response(200, chat("sorry, I cannot")));
    expect(await careAi(client, CONFIG).describe("Ficus elastica")).toEqual({ kind: "unavailable" });
  });

  it("maps our own daily cap to quota, and a cooldown or network failure to unavailable", async () => {
    const quota = clientReturning({ kind: "blocked", reason: "limit" });
    expect(await careAi(quota.client, CONFIG).describe("x")).toEqual({ kind: "quota" });
    const cooldown = clientReturning({ kind: "blocked", reason: "cooldown" });
    expect(await careAi(cooldown.client, CONFIG).describe("x")).toEqual({ kind: "unavailable" });
    const network = clientReturning({ kind: "failed", reason: "network" });
    expect(await careAi(network.client, CONFIG).describe("x")).toEqual({ kind: "unavailable" });
    const limited = clientReturning(response(429, { error: "rate" }));
    expect(await careAi(limited.client, CONFIG).describe("x")).toEqual({ kind: "unavailable" });
  });
});

describe("careAiUsage", () => {
  it("records a 429 as a short cooldown, not the daily cap", () => {
    const now = Date.UTC(2026, 10, 18, 12, 0, 0);
    const settled = careAiUsage(response(429, {}), now);
    expect(settled.status).toBe("failure");
    expect(settled.retryAt?.getTime()).toBe(now + 60_000);
  });

  it("records success and server errors plainly", () => {
    expect(careAiUsage(response(200, {}))).toEqual({ status: "success", retryAt: null });
    expect(careAiUsage(response(503, {}))).toEqual({ status: "failure", retryAt: null });
  });
});

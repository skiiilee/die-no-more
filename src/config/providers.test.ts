import { describe, expect, it } from "vitest";
import { readProviderConfig } from "./providers";

describe("readProviderConfig", () => {
  it("reads keys and our daily caps", () => {
    expect(
      readProviderConfig({
        PLANTNET_API_KEY: "n",
        PLANTNET_DAILY_LIMIT: "400",
        PERENUAL_API_KEY: " p ",
        PERENUAL_DAILY_LIMIT: "50",
        TREFLE_TOKEN: "t",
        TREFLE_DAILY_LIMIT: "300",
      }),
    ).toMatchObject({
      plantnet: { key: "n", dailyLimit: 400 },
      perenual: { key: "p", dailyLimit: 50 },
      trefle: { key: "t", dailyLimit: 300 },
    });
  });

  it("treats a provider without a key as unavailable", () => {
    expect(readProviderConfig({ PERENUAL_API_KEY: "  " })).toMatchObject({ plantnet: null, perenual: null, trefle: null });
  });

  it("falls back to the documented caps when a limit is missing or invalid", () => {
    expect(readProviderConfig({ PLANTNET_API_KEY: "n", PERENUAL_API_KEY: "p", PERENUAL_DAILY_LIMIT: "lots", TREFLE_TOKEN: "t" })).toMatchObject({
      plantnet: { key: "n", dailyLimit: 450 },
      perenual: { key: "p", dailyLimit: 90 },
      trefle: { key: "t", dailyLimit: 300 },
    });
  });

  it("turns the care AI on only with key, HTTPS base URL and model (ADR-0005 D1)", () => {
    const full = {
      CARE_AI_API_KEY: "k",
      CARE_AI_BASE_URL: "https://api.example.test/v1/",
      CARE_AI_MODEL: "model-x",
      CARE_AI_DAILY_LIMIT: "20",
    };
    expect(readProviderConfig(full).careAi).toEqual({ key: "k", dailyLimit: 20, baseUrl: "https://api.example.test/v1", model: "model-x" });
    expect(readProviderConfig({ ...full, CARE_AI_BASE_URL: "http://insecure.test/v1" }).careAi).toBeNull();
    expect(readProviderConfig({ ...full, CARE_AI_MODEL: " " }).careAi).toBeNull();
    expect(readProviderConfig({ ...full, CARE_AI_API_KEY: undefined }).careAi).toBeNull();
    expect(readProviderConfig({ ...full, CARE_AI_DAILY_LIMIT: undefined }).careAi?.dailyLimit).toBe(50);
  });
});

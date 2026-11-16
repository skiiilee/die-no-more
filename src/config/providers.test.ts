import { describe, expect, it } from "vitest";
import { readProviderConfig } from "./providers";

describe("readProviderConfig", () => {
  it("reads keys and our daily caps", () => {
    expect(
      readProviderConfig({ PERENUAL_API_KEY: " p ", PERENUAL_DAILY_LIMIT: "50", TREFLE_TOKEN: "t", TREFLE_DAILY_LIMIT: "300" }),
    ).toEqual({ perenual: { key: "p", dailyLimit: 50 }, trefle: { key: "t", dailyLimit: 300 } });
  });

  it("treats a provider without a key as unavailable", () => {
    expect(readProviderConfig({ PERENUAL_API_KEY: "  " })).toEqual({ perenual: null, trefle: null });
  });

  it("falls back to the documented caps when a limit is missing or invalid", () => {
    expect(readProviderConfig({ PERENUAL_API_KEY: "p", PERENUAL_DAILY_LIMIT: "lots", TREFLE_TOKEN: "t" })).toEqual({
      perenual: { key: "p", dailyLimit: 90 },
      trefle: { key: "t", dailyLimit: 300 },
    });
  });
});

import { describe, expect, it } from "vitest";
import { ConfigError, readAuthConfig, tryReadAuthConfig } from "./env";

const full = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "k", OWNER_EMAIL: "o@e.com" };

describe("readAuthConfig", () => {
  it("reads and trims values", () => {
    expect(readAuthConfig({ ...full, OWNER_EMAIL: " o@e.com " }).ownerEmail).toBe("o@e.com");
  });

  it("names every missing variable and how to fix it", () => {
    try {
      readAuthConfig({ SUPABASE_URL: "u" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).missing).toEqual(["SUPABASE_ANON_KEY", "OWNER_EMAIL"]);
      expect((error as Error).message).toContain(".env.example");
    }
  });

  it("treats blank values as missing", () => {
    expect(tryReadAuthConfig({ ...full, SUPABASE_ANON_KEY: "  " })).toBeNull();
  });
});

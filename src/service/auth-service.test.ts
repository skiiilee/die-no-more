import { describe, expect, it, vi } from "vitest";
import type { AuthGateway } from "@/repo/auth-repo";
import { classifyAuthError, safeNextPath, signInOwner } from "./auth-service";

function gateway(overrides: Partial<AuthGateway> = {}): AuthGateway {
  return {
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => {}),
    getUserId: vi.fn(async () => null),
    ...overrides,
  };
}

describe("signInOwner", () => {
  it("signs in with the configured owner email", async () => {
    const g = gateway();
    await expect(signInOwner(g, "owner@example.com", "pw")).resolves.toEqual({ ok: true });
    expect(g.signInWithPassword).toHaveBeenCalledWith("owner@example.com", "pw");
  });

  it("rejects an empty password without calling the provider", async () => {
    const g = gateway();
    await expect(signInOwner(g, "o@e.com", "")).resolves.toEqual({ ok: false, code: "invalid_password" });
    expect(g.signInWithPassword).not.toHaveBeenCalled();
  });

  it("maps wrong credentials to invalid_password", async () => {
    const g = gateway({
      signInWithPassword: async () => ({ error: { status: 400, code: "invalid_credentials", message: "x" } }),
    });
    await expect(signInOwner(g, "o@e.com", "bad")).resolves.toEqual({ ok: false, code: "invalid_password" });
  });

  it("maps provider failures to unavailable", async () => {
    const down = gateway({ signInWithPassword: async () => ({ error: { status: 503, message: "down" } }) });
    await expect(signInOwner(down, "o@e.com", "pw")).resolves.toEqual({ ok: false, code: "unavailable" });

    const thrown = gateway({
      signInWithPassword: async () => {
        throw new Error("network");
      },
    });
    await expect(signInOwner(thrown, "o@e.com", "pw")).resolves.toEqual({ ok: false, code: "unavailable" });
  });

  it("does not tell a rate-limited user their password is wrong", async () => {
    const g = gateway({
      signInWithPassword: async () => ({
        error: { status: 429, code: "over_request_rate_limit", message: "rate limited" },
      }),
    });
    await expect(signInOwner(g, "o@e.com", "right")).resolves.toEqual({ ok: false, code: "rate_limited" });
  });
});

describe("classifyAuthError", () => {
  it.each([
    [{ status: 400, code: "invalid_credentials", message: "Invalid login credentials" }, "invalid_password"],
    [{ status: 400, message: "Invalid login credentials" }, "invalid_password"],
    [{ status: 429, code: "over_request_rate_limit", message: "rate limited" }, "rate_limited"],
    [{ status: 429, message: "Too many requests" }, "rate_limited"],
    [{ status: 400, code: "email_not_confirmed", message: "Email not confirmed" }, "not_configured"],
    [{ status: 403, code: "user_banned", message: "banned" }, "unavailable"],
    [{ status: 400, message: "some other client error" }, "unavailable"],
    [{ status: 503, message: "down" }, "unavailable"],
    [{ message: "fetch failed" }, "unavailable"],
  ])("%j -> %s", (error, expected) => {
    expect(classifyAuthError(error)).toBe(expected);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/plants/1?tab=log", "/plants/1?tab=log"],
    ["/plants/1#photos", "/plants/1#photos"],
    ["/plants/../today", "/today"],
    [undefined, "/today"],
    ["", "/today"],
    ["plants", "/today"],
    ["https://evil.example", "/today"],
    ["//evil.example", "/today"],
    ["/\\evil.example", "/today"],
    ["/login?next=/today", "/today"],
    ["/login/", "/today"],
  ])("%j -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  // URL parsing drops tab/CR/LF, so "/<TAB>/evil" would become "//evil" (off-site).
  it.each([
    ["tab", "/\t/evil.example"],
    ["newline", "/\n/evil.example"],
    ["carriage return", "/\r/evil.example"],
    ["NUL", "/\u0000/evil.example"],
    ["DEL", "/\u007f/evil.example"],
    ["C1 control", "/\u0085/evil.example"],
    ["control char later in the path", "/plants\t/x"],
  ])("rejects a %s", (_label, input) => {
    expect(safeNextPath(input)).toBe("/today");
  });

  it("the tab case really is off-site when parsed without the guard", () => {
    expect(new URL("/\t/evil.example", "https://app.example").host).toBe("evil.example");
  });

  it("rejects the tab case as the login form receives it from the query", () => {
    const next = new URLSearchParams("next=/%09/evil.example").get("next");
    expect(next).toBe("/\t/evil.example");
    expect(safeNextPath(next)).toBe("/today");
  });

  it("never returns a value that resolves off-site", () => {
    const samples = ["/a", "/\t//x.example", "/%2F%2Fx.example", "/.//x.example", "/%5Cx.example", "/%09/x.example"];
    for (const sample of samples) {
      const resolved = new URL(safeNextPath(sample), "https://app.example");
      expect(resolved.host).toBe("app.example");
    }
  });
});

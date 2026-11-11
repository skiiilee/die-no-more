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

    const thrown = gateway({ signInWithPassword: async () => { throw new Error("network"); } });
    await expect(signInOwner(thrown, "o@e.com", "pw")).resolves.toEqual({ ok: false, code: "unavailable" });
  });
});

describe("classifyAuthError", () => {
  it("treats errors without a status as unavailable", () => {
    expect(classifyAuthError({ message: "fetch failed" })).toBe("unavailable");
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/plants/1?tab=log", "/plants/1?tab=log"],
    [undefined, "/today"],
    ["https://evil.example", "/today"],
    ["//evil.example", "/today"],
    ["/\\evil.example", "/today"],
    ["/login?next=/today", "/today"],
    ["plants", "/today"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("./request-supabase", () => ({ requestSupabase: vi.fn(async () => null) }));

const { handleIdentify, handleUpload, isSameOrigin } = await import("./photo-api");

describe("photo API routes", () => {
  it("accepts requests from this site or without an Origin header, and refuses other sites", () => {
    const from = (origin?: string) =>
      new Request("https://app.example.test/api/uploads", { method: "POST", headers: origin ? { origin } : {} });
    expect(isSameOrigin(from("https://app.example.test"))).toBe(true);
    expect(isSameOrigin(from())).toBe(true);
    expect(isSameOrigin(from("https://evil.example.test"))).toBe(false);
    expect(isSameOrigin(from("null"))).toBe(false);
  });

  it("refuses another site before reading the session or the body", async () => {
    const request = new Request("https://app.example.test/api/identifications", {
      method: "POST",
      headers: { origin: "https://evil.example.test" },
      body: JSON.stringify({ photoIds: [], consent: true }),
    });
    const response = await handleIdentify(request);
    expect(response.status).toBe(403);
  });

  it("answers 401 JSON, not a redirect, when there is no session", async () => {
    const response = await handleUpload(new Request("https://app.example.test/api/uploads", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ kind: "signed_out" });
  });
});

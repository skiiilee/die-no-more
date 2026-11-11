import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import { applyAuthUpdates, emptyAuthUpdates, type AuthUpdates } from "./auth-response";

const refreshed: AuthUpdates = {
  cookies: [{ name: "sb-access", value: "new-token", options: { path: "/", httpOnly: true } }],
  headers: {
    "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
    Expires: "0",
    Pragma: "no-cache",
  },
};

describe("applyAuthUpdates", () => {
  it("keeps refreshed cookies and no-cache headers on a redirect", () => {
    const response = applyAuthUpdates(
      NextResponse.redirect(new URL("/login?next=%2Ftoday", "https://app.example")),
      refreshed,
    );
    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-access")?.value).toBe("new-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("keeps them on a pass-through response too", () => {
    const response = applyAuthUpdates(NextResponse.next(), refreshed);
    expect(response.cookies.get("sb-access")?.value).toBe("new-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("changes nothing when the session was not refreshed", () => {
    const response = applyAuthUpdates(NextResponse.next(), emptyAuthUpdates());
    expect(response.cookies.getAll()).toEqual([]);
    expect(response.headers.get("cache-control")).toBeNull();
  });
});

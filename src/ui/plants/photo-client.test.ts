import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteUploadedPhoto } from "./photo-client";

afterEach(() => vi.unstubAllGlobals());

describe("deleteUploadedPhoto (PR #17 review)", () => {
  const answer = (status: number) => vi.fn(async () => new Response(null, { status }));

  it("is true only when the server confirms the photo is gone", async () => {
    vi.stubGlobal("fetch", answer(200));
    expect(await deleteUploadedPhoto("p1")).toBe(true);
    vi.stubGlobal("fetch", answer(404));
    expect(await deleteUploadedPhoto("p1")).toBe(true);
  });

  it("is false for a server failure or a lost connection", async () => {
    vi.stubGlobal("fetch", answer(500));
    expect(await deleteUploadedPhoto("p1")).toBe(false);
    vi.stubGlobal("fetch", answer(401));
    expect(await deleteUploadedPhoto("p1")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await deleteUploadedPhoto("p1")).toBe(false);
  });

  it("asks the browser to finish the request when the screen is being left", async () => {
    const fetch = answer(200);
    vi.stubGlobal("fetch", fetch);
    await deleteUploadedPhoto("p1", { keepalive: true });
    expect(fetch).toHaveBeenCalledWith("/api/uploads/p1", { method: "DELETE", keepalive: true });
  });
});

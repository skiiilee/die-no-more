import { afterEach, describe, expect, it, vi } from "vitest";
import { requestIdentification } from "./photo-client";

afterEach(() => vi.unstubAllGlobals());

describe("requestIdentification", () => {
  it("sends this request's consent and the photos in order, as multipart", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
      Response.json({ kind: "ok", sessionId: "s1" }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetch);
    const a = new Blob(["a"], { type: "image/jpeg" });
    const b = new Blob(["b"], { type: "image/jpeg" });
    expect(await requestIdentification([a, b], true)).toEqual({ kind: "ok", sessionId: "s1" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/identifications");
    const form = init.body as FormData;
    expect(form.get("consent")).toBe("true");
    const photos = form.getAll("photos") as File[];
    expect(await Promise.all(photos.map((photo) => photo.text()))).toEqual(["a", "b"]);
  });

  it("explains a lost session, a lost connection and an answer it cannot read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    expect(await requestIdentification([], true)).toEqual({ kind: "signed_out" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(await requestIdentification([], true)).toEqual({ kind: "network" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 502 })));
    expect(await requestIdentification([], true)).toEqual({ kind: "failed" });
  });

  it("passes the server's reason for a refused photo through", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ kind: "invalid", message: "사진 2: …" }, { status: 400 })));
    expect(await requestIdentification([], true)).toEqual({ kind: "invalid", message: "사진 2: …" });
  });
});

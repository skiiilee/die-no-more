import { afterEach, describe, expect, it, vi } from "vitest";
import { PHOTO_RULES } from "@/types/photo";

const { session, upload } = vi.hoisted(() => ({
  session: { signedIn: false },
  upload: vi.fn(async (_deps: unknown, bytes: Uint8Array | null) =>
    bytes ? { kind: "ok" as const, id: "40000000-0000-0000-0000-000000000001" } : { kind: "invalid" as const, message: "x" },
  ),
}));

vi.mock("./request-supabase", () => ({
  requestSupabase: vi.fn(async () => (session.signedIn ? { client: {} } : null)),
}));
vi.mock("@/repo/auth-repo", () => ({ supabaseAuthGateway: () => ({ getUserId: async () => "user-a" }) }));
vi.mock("@/repo/photo-repo", () => ({ supabasePhotoStore: () => ({}) }));
vi.mock("@/service/photo-upload", async (original) => ({
  ...(await original<typeof import("@/service/photo-upload")>()),
  uploadPhoto: upload,
}));

const { handleIdentify, handleUpload, isSameOrigin, readBodyWithin } = await import("./photo-api");

afterEach(() => {
  session.signedIn = false;
  vi.clearAllMocks();
});

/** A body sent in chunks with no Content-Length, as a client may do. */
function streamed(total: number, chunk = 64 * 1024): { body: ReadableStream<Uint8Array>; sent: () => number } {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) return controller.close();
      const size = Math.min(chunk, total - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size));
    },
  });
  return { body, sent: () => sent };
}

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

describe("upload body cap (PR #17 review)", () => {
  it("stops reading a body past the cap even without Content-Length", async () => {
    const { body, sent } = streamed(20 * 1024 * 1024);
    const request = new Request("https://app.example.test/api/uploads", { method: "POST", body, duplex: "half" } as RequestInit);
    expect(await readBodyWithin(request, 1024 * 1024)).toBe("too_large");
    // Abandoned soon after the cap, not read to the end.
    expect(sent()).toBeLessThan(2 * 1024 * 1024);
  });

  it("answers 413 for a large multipart upload with no Content-Length, before anything is processed", async () => {
    session.signedIn = true;
    const { body } = streamed(PHOTO_RULES.maxUploadBytes + 512 * 1024);
    const request = new Request("https://app.example.test/api/uploads", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    const response = await handleUpload(request);
    expect(response.status).toBe(413);
    expect((await response.json()).kind).toBe("invalid");
    expect(upload).not.toHaveBeenCalled();
  });

  it("answers 413 when Content-Length already says the body is too large", async () => {
    session.signedIn = true;
    const request = new Request("https://app.example.test/api/uploads", {
      method: "POST",
      headers: { "content-length": String(PHOTO_RULES.maxUploadBytes * 2) },
      body: "x",
    });
    expect((await handleUpload(request)).status).toBe(413);
    expect(upload).not.toHaveBeenCalled();
  });

  it("still passes a photo within the cap on to the upload service", async () => {
    session.signedIn = true;
    const form = new FormData();
    form.append("photo", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], { type: "image/jpeg" }), "photo.jpg");
    const response = await handleUpload(new Request("https://app.example.test/api/uploads", { method: "POST", body: form }));
    expect(response.status).toBe(201);
    expect(upload.mock.calls[0]?.[1]).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { PHOTO_RULES } from "@/types/photo";

const { session, identify } = vi.hoisted(() => ({
  session: { signedIn: false },
  identify: vi.fn<
    (deps: unknown, input: { photos: Uint8Array[]; consent: boolean }) => Promise<{ kind: "ok"; sessionId: string }>
  >(async () => ({ kind: "ok", sessionId: "50000000-0000-0000-0000-000000000001" })),
}));

vi.mock("./request-supabase", () => ({
  requestSupabase: vi.fn(async () => (session.signedIn ? { client: {} } : null)),
}));
vi.mock("@/repo/auth-repo", () => ({ supabaseAuthGateway: () => ({ getUserId: async () => "user-a" }) }));
vi.mock("@/repo/identification-repo", () => ({ supabaseIdentificationStore: () => ({}) }));
vi.mock("@/repo/species-repo", () => ({ supabaseSpeciesStore: () => ({}) }));
vi.mock("@/repo/usage-repo", () => ({ supabaseUsageStore: () => ({}) }));
vi.mock("@/service/photo-identification", () => ({ identifyPhotos: identify }));

const { handleIdentify, IDENTIFY_BODY_MAX, isSameOrigin, readBodyWithin } = await import("./photo-api");

const URL_ = "https://app.example.test/api/identifications";

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

function form(consent: string | null, photos: Uint8Array<ArrayBuffer>[]) {
  const data = new FormData();
  if (consent !== null) data.append("consent", consent);
  for (const photo of photos) data.append("photos", new Blob([photo], { type: "image/jpeg" }), "photo.jpg");
  return new Request(URL_, { method: "POST", body: data });
}

describe("POST /api/identifications", () => {
  it("accepts requests from this site or without an Origin header, and refuses other sites", () => {
    const from = (origin?: string) => new Request(URL_, { method: "POST", headers: origin ? { origin } : {} });
    expect(isSameOrigin(from("https://app.example.test"))).toBe(true);
    expect(isSameOrigin(from())).toBe(true);
    expect(isSameOrigin(from("https://evil.example.test"))).toBe(false);
    expect(isSameOrigin(from("null"))).toBe(false);
  });

  it("refuses another site before reading the session or the body", async () => {
    const request = new Request(URL_, { method: "POST", headers: { origin: "https://evil.example.test" }, body: "x" });
    expect((await handleIdentify(request)).status).toBe(403);
  });

  it("answers 401 JSON, not a redirect, when there is no session", async () => {
    const response = await handleIdentify(new Request(URL_, { method: "POST" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ kind: "signed_out" });
    expect(identify).not.toHaveBeenCalled();
  });

  it("passes the photos in order and this request's consent to the service", async () => {
    session.signedIn = true;
    const a = new Uint8Array([0xff, 0xd8, 0xff, 1]);
    const b = new Uint8Array([0xff, 0xd8, 0xff, 2]);
    const response = await handleIdentify(form("true", [a, b]));
    expect(response.status).toBe(201);
    expect(identify.mock.calls[0]?.[1]).toEqual({ consent: true, photos: [a, b] });
  });

  it("treats anything but consent=true as no consent", async () => {
    session.signedIn = true;
    for (const consent of [null, "false", "on", "TRUE"]) {
      identify.mockClear();
      await handleIdentify(form(consent, [new Uint8Array([1])]));
      expect(identify.mock.calls[0]?.[1].consent).toBe(false);
    }
  });

  it("reads a body that is not multipart as no consent and no photos", async () => {
    session.signedIn = true;
    await handleIdentify(new Request(URL_, { method: "POST", body: JSON.stringify({ consent: true }) }));
    expect(identify.mock.calls[0]?.[1]).toEqual({ consent: false, photos: [] });
  });
});

describe("request body cap (PR #17 review)", () => {
  it("stops reading a body past the cap even without Content-Length", async () => {
    const { body, sent } = streamed(20 * 1024 * 1024);
    const request = new Request(URL_, { method: "POST", body, duplex: "half" } as RequestInit);
    expect(await readBodyWithin(request, 1024 * 1024)).toBe("too_large");
    // Abandoned soon after the cap, not read to the end.
    expect(sent()).toBeLessThan(2 * 1024 * 1024);
  });

  it("answers 413 for a large multipart request with no Content-Length, before anything is processed", async () => {
    session.signedIn = true;
    const { body } = streamed(IDENTIFY_BODY_MAX + 512 * 1024);
    const request = new Request(URL_, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body,
      duplex: "half",
    } as RequestInit);
    expect(request.headers.get("content-length")).toBeNull();
    const response = await handleIdentify(request);
    expect(response.status).toBe(413);
    expect((await response.json()).kind).toBe("invalid");
    expect(identify).not.toHaveBeenCalled();
  });

  it("answers 413 when Content-Length already says the body is too large", async () => {
    session.signedIn = true;
    const request = new Request(URL_, {
      method: "POST",
      headers: { "content-length": String(PHOTO_RULES.maxRequestBytes * 2) },
      body: "x",
    });
    expect((await handleIdentify(request)).status).toBe(413);
    expect(identify).not.toHaveBeenCalled();
  });

  it("stays under Vercel's 4.5 MB request limit", () => {
    expect(IDENTIFY_BODY_MAX).toBeLessThan(4.5 * 1024 * 1024);
  });
});

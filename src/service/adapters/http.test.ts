import { describe, expect, it, vi } from "vitest";
import { httpClient, httpsUrl } from "./http";

/** Fake clock: each fetch advances time by `cost` ms. */
function setup(responses: (number | "network" | "timeout")[], options: { start?: number; cost?: number } = {}) {
  let now = options.start ?? 0;
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift() ?? 200;
    now += options.cost ?? 100;
    if (next === "network") throw new TypeError("fetch failed");
    if (next === "timeout") throw new DOMException("timed out", "TimeoutError");
    return new Response("{}", { status: next });
  });
  const client = httpClient({ deadline: 25_000, fetchImpl, now: () => now });
  return { client, fetchImpl };
}

describe("httpClient (ADR-0003 D7)", () => {
  it("returns the first good answer without retrying", async () => {
    const { client, fetchImpl } = setup([200]);
    const call = await client.get("https://example.test");
    expect(call).toMatchObject({ attempts: 1, result: { kind: "response", status: 200 } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries once on a 5xx, a connection error or a timeout", async () => {
    for (const first of [503, "network", "timeout"] as const) {
      const { client, fetchImpl } = setup([first, 200]);
      const call = await client.get("https://example.test");
      expect(call.attempts).toBe(2);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  });

  it("never retries more than once", async () => {
    const { client } = setup([500, 500, 500]);
    const call = await client.get("https://example.test");
    expect(call).toMatchObject({ attempts: 2, result: { status: 500 } });
  });

  it("does not retry a 4xx answer", async () => {
    const { client } = setup([429]);
    expect((await client.get("https://example.test")).attempts).toBe(1);
  });

  it("skips the retry when less than 12 s are left", async () => {
    const { client } = setup([503, 200], { cost: 14_000 });
    const call = await client.get("https://example.test");
    expect(call).toMatchObject({ attempts: 1, result: { status: 503 } });
  });

  it("makes no call when the deadline leaves no time after the 5 s reserve", async () => {
    const { client, fetchImpl } = setup([200], { start: 20_000 });
    const call = await client.get("https://example.test");
    expect(call).toEqual({ attempts: 0, result: { kind: "failed", reason: "timeout" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caps each attempt at 10 s and at the time left minus 5 s", async () => {
    const timeouts: number[] = [];
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
    await setup([200]).client.get("https://example.test");
    await setup([200], { start: 13_000 }).client.get("https://example.test");
    expect(timeouts).toEqual([10_000, 7_000]);
    spy.mockRestore();
  });
});

describe("httpsUrl", () => {
  it("accepts https only", () => {
    expect(httpsUrl("https://perenual.com/a.jpg")).toBe("https://perenual.com/a.jpg");
    expect(httpsUrl("http://perenual.com/a.jpg")).toBeNull();
    expect(httpsUrl("Upgrade Plans To Premium/Supreme - https://perenual.com")).toBeNull();
    expect(httpsUrl(null)).toBeNull();
  });
});

import { describe, expect, it, vi } from "vitest";
import { httpClient, httpsUrl, retryAfter, type CallGate } from "./http";

/** Gate that allows the first `allowed` attempts, then refuses with `reason`. */
function gate(allowed: number, reason: "limit" | "cooldown" = "limit") {
  const settled: unknown[] = [];
  let opened = 0;
  const callGate: CallGate = {
    open: vi.fn(async () => {
      if (opened >= allowed) return { ok: false as const, reason };
      opened += 1;
      return {
        ok: true as const,
        ticket: {
          settle: async (result: unknown) => {
            settled.push(result);
          },
        },
      };
    }),
  };
  return { callGate, settled };
}

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

describe("httpClient attempt cap (ADR-0005 D6)", () => {
  async function timeoutsFor(options: { attemptMaxMs?: number }) {
    const timeouts: number[] = [];
    const spy = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await httpClient({ deadline: 25_000, fetchImpl, now: () => 0, ...options }).get("https://example.test");
    spy.mockRestore();
    return timeouts;
  }

  it("caps an attempt at 10 s by default", async () => {
    expect(await timeoutsFor({})).toEqual([10_000]);
  });

  it("lets a slow provider's own budget raise the cap, still keeping the 5 s reserve", async () => {
    expect(await timeoutsFor({ attemptMaxMs: 30_000 })).toEqual([20_000]);
    expect(await timeoutsFor({ attemptMaxMs: 15_000 })).toEqual([15_000]);
  });
});

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

describe("httpClient with a call gate (PR #15 review, item 1)", () => {
  it("sends nothing when the gate refuses", async () => {
    const { client, fetchImpl } = setup([200]);
    const call = await client.get("https://example.test", gate(0).callGate);
    expect(call).toEqual({ attempts: 0, result: { kind: "blocked", reason: "limit" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reserves the retry too: with one call left, a failed attempt is not retried", async () => {
    const { client, fetchImpl } = setup([503, 200]);
    const { callGate, settled } = gate(1);
    const call = await client.get("https://example.test", callGate);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(call).toMatchObject({ attempts: 1, result: { kind: "response", status: 503 } });
    expect(settled).toHaveLength(1);
  });

  it("settles every attempt it sent", async () => {
    const { client } = setup([503, 200]);
    const { callGate, settled } = gate(2);
    await client.get("https://example.test", callGate);
    expect(settled).toEqual([expect.objectContaining({ status: 503 }), expect.objectContaining({ status: 200 })]);
  });
});

describe("retryAfter", () => {
  const now = Date.parse("2026-11-15T00:00:00Z");
  it("reads seconds and HTTP dates, and falls back when missing or invalid", () => {
    expect(retryAfter(new Headers({ "retry-after": "30" }), now, 60_000).toISOString()).toBe("2026-11-15T00:00:30.000Z");
    expect(retryAfter(new Headers({ "retry-after": "Sun, 15 Nov 2026 00:02:00 GMT" }), now, 60_000).toISOString()).toBe(
      "2026-11-15T00:02:00.000Z",
    );
    expect(retryAfter(new Headers(), now, 60_000).toISOString()).toBe("2026-11-15T00:01:00.000Z");
    expect(retryAfter(new Headers({ "retry-after": "soon" }), now, 60_000).toISOString()).toBe("2026-11-15T00:01:00.000Z");
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

describe("httpClient POST (Pl@ntNet photo upload)", () => {
  it("sends the method and a freshly built form on every attempt, through the gate", async () => {
    const forms: FormData[] = [];
    const responses = [503, 200];
    const fetchImpl = vi.fn(async (_url: string, init: { method: string; body?: FormData | string }) => {
      expect(init.method).toBe("POST");
      forms.push(init.body as FormData);
      return new Response("{}", { status: responses.shift() ?? 200 });
    });
    let now = 0;
    const client = httpClient({ deadline: 25_000, fetchImpl, now: () => (now += 100) });
    const { callGate, settled } = gate(5);
    const build = vi.fn(() => {
      const form = new FormData();
      form.append("organs", "auto");
      return form;
    });
    const call = await client.send({ method: "POST", url: "https://example.test/identify", body: build }, callGate);
    expect(call).toMatchObject({ attempts: 2, result: { kind: "response", status: 200 } });
    expect(build).toHaveBeenCalledTimes(2);
    expect(forms[0]).not.toBe(forms[1]);
    expect(settled).toHaveLength(2);
  });
});


import { describe, expect, it, vi } from "vitest";
import type { ReserveAnswer, UsageStore } from "@/repo/usage-repo";
import { httpClient, providerClient } from "./adapters/http";
import { perenual, perenualUsage } from "./adapters/perenual";
import { trefle, trefleUsage } from "./adapters/trefle";
import { kstDayStart, usageGate, utcDayStart } from "./provider-usage";

describe("kstDayStart (ADR-0004 D5: Perenual and Trefle count per KST day)", () => {
  it("starts the day at 00:00 KST, which is 15:00 UTC the day before", () => {
    expect(kstDayStart(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11-14T15:00:00.000Z");
    expect(kstDayStart(new Date("2026-11-15T15:00:00Z"))).toBe("2026-11-15T15:00:00.000Z");
    expect(kstDayStart(new Date("2026-11-15T14:59:59Z"))).toBe("2026-11-14T15:00:00.000Z");
  });
});

describe("utcDayStart (ADR-0004 D5: Pl@ntNet resets at 00:00 UTC = 09:00 KST)", () => {
  it("starts the day at 00:00 UTC", () => {
    expect(utcDayStart(new Date("2026-11-17T08:59:59+09:00"))).toBe("2026-11-16T00:00:00.000Z");
    expect(utcDayStart(new Date("2026-11-17T09:00:00+09:00"))).toBe("2026-11-17T00:00:00.000Z");
  });

  it("is the day boundary the gate reserves against when given", async () => {
    const reserve = vi.fn(async (): Promise<ReserveAnswer> => ({ kind: "reserved", id: "r1" }));
    const usage: UsageStore = { reserve, settle: vi.fn(async () => {}) };
    const gateFor = usageGate({
      usage,
      provider: "plantnet",
      dailyLimit: 450,
      classify: () => ({ status: "success", retryAt: null }),
      dayStart: utcDayStart,
      now: () => new Date("2026-11-17T05:00:00+09:00"),
    });
    await gateFor("identify").open();
    expect(reserve).toHaveBeenCalledWith("plantnet", "identify", "2026-11-16T00:00:00.000Z", 450);
  });
});

/**
 * In-memory stand-in for reserve_provider_call: one reservation at a time
 * (like the DB lock), a daily count and a Retry-After back-off.
 */
function memoryUsage(options: { used?: number; now?: () => number; failWrites?: boolean } = {}) {
  let used = options.used ?? 0;
  let retryAt: number | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const now = options.now ?? Date.now;
  const statuses: string[] = [];
  const store: UsageStore = {
    reserve: vi.fn((_provider: string, _operation: string, _since: string, limit: number) => {
      const run = queue.then(async (): Promise<ReserveAnswer> => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        if (options.failWrites) throw new Error("insert failed");
        if (retryAt !== null && retryAt > now()) {
          return { kind: "blocked", reason: "cooldown", retryAt: new Date(retryAt).toISOString() };
        }
        if (used >= limit) return { kind: "blocked", reason: "limit", retryAt: null };
        used += 1;
        return { kind: "reserved", id: `r${used}` };
      });
      queue = run.catch(() => undefined);
      return run;
    }),
    settle: vi.fn(async (_id: string, status: string, at: Date | null) => {
      statuses.push(status);
      if (at) retryAt = at.getTime();
    }),
  };
  return { store, statuses, used: () => used };
}

type Answer = { status: number; body?: string; headers?: Record<string, string> };

function fetchAnswering(...answers: Answer[]) {
  return vi.fn(async () => {
    const next = answers.shift() ?? { status: 200 };
    return new Response(next.body ?? JSON.stringify({ data: [] }), { status: next.status, headers: next.headers });
  });
}

function perenualWith(usage: UsageStore, fetchImpl: ReturnType<typeof fetchAnswering>, limit = 90) {
  const http = httpClient({ deadline: Date.now() + 25_000, fetchImpl });
  const gate = usageGate({ usage, provider: "perenual", dailyLimit: limit, classify: perenualUsage });
  return perenual(providerClient(http, gate), "k");
}

describe("usageGate (PR #15 review, item 1)", () => {
  it("reserves against the KST day and our cap", async () => {
    const usage = memoryUsage();
    const gate = usageGate({
      usage: usage.store,
      provider: "perenual",
      dailyLimit: 90,
      classify: perenualUsage,
      now: () => new Date("2026-11-15T03:00:00Z"),
    });
    await gate("search").open();
    expect(usage.store.reserve).toHaveBeenCalledWith("perenual", "search", "2026-11-14T15:00:00.000Z", 90);
  });

  it("with one call left, a retry after a 503 is not sent", async () => {
    const usage = memoryUsage({ used: 89 });
    const fetchImpl = fetchAnswering({ status: 503 }, { status: 200 });
    const answer = await perenualWith(usage.store, fetchImpl).search("ficus");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(usage.used()).toBe(90);
    expect(answer).toEqual({ kind: "unavailable" });
  });

  it("with one call left, two requests at the same time get one call between them", async () => {
    const usage = memoryUsage({ used: 89 });
    const fetchImpl = fetchAnswering({ status: 200 }, { status: 200 });
    const adapter = perenualWith(usage.store, fetchImpl);
    const answers = await Promise.all([adapter.search("ficus"), adapter.search("ficus")]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(usage.used()).toBe(90);
    expect(answers.map((answer) => answer.kind).sort()).toEqual(["ok", "quota"]);
  });

  it("sends nothing when the reservation cannot be written, however often it is asked", async () => {
    const usage = memoryUsage({ failWrites: true });
    const fetchImpl = fetchAnswering({ status: 200 });
    const adapter = perenualWith(usage.store, fetchImpl, 1);
    for (let i = 0; i < 3; i += 1) expect(await adapter.search("ficus")).toEqual({ kind: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("records a Perenual quota answer so the DB stops Perenual for the day", async () => {
    const usage = memoryUsage();
    await perenualWith(usage.store, fetchAnswering({ status: 429, body: "Too Many Requests" })).search("ficus");
    expect(usage.statuses).toEqual(["quota_exceeded"]);
  });

  it("does not fail the request when settling fails; the reserved row still counts", async () => {
    const usage = memoryUsage();
    vi.mocked(usage.store.settle).mockRejectedValueOnce(new Error("update failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await perenualWith(usage.store, fetchAnswering({ status: 200 })).search("ficus");
    expect(answer).toEqual({ kind: "ok", species: [] });
    expect(usage.used()).toBe(1);
    expect(error).toHaveBeenCalledWith("Could not settle perenual usage");
    error.mockRestore();
  });
});

describe("Trefle back-off (PR #15 review, item 4)", () => {
  it("skips Trefle until its Retry-After time, then asks again", async () => {
    let now = Date.parse("2026-11-15T03:00:00Z");
    const usage = memoryUsage({ now: () => now });
    const fetchImpl = fetchAnswering({ status: 429, headers: { "retry-after": "30" } }, { status: 200 });
    const http = httpClient({ deadline: Number.POSITIVE_INFINITY, fetchImpl, now: () => now });
    const gate = usageGate({
      usage: usage.store,
      provider: "trefle",
      dailyLimit: 300,
      classify: (result) => trefleUsage(result, now),
      now: () => new Date(now),
    });
    const adapter = trefle(providerClient(http, gate), "t");

    expect(await adapter.search("ficus")).toEqual({ kind: "unavailable" });
    now += 10_000;
    expect(await adapter.search("ficus")).toEqual({ kind: "unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 21_000;
    expect(await adapter.search("ficus")).toEqual({ kind: "ok", species: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("records the 429 as a failure with a retry time, not as a daily quota", () => {
    const now = Date.parse("2026-11-15T03:00:00Z");
    const result = { kind: "response" as const, status: 429, headers: new Headers({ "retry-after": "5" }), body: "" };
    expect(trefleUsage(result, now)).toEqual({ status: "failure", retryAt: new Date(now + 5_000) });
  });
});

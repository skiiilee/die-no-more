import { describe, expect, it, vi } from "vitest";
import type { UsageStore } from "@/repo/usage-repo";
import { kstDayStart, meter, usageStatuses } from "./provider-usage";

describe("kstDayStart (ADR-0004 D5: Perenual and Trefle count per KST day)", () => {
  it("starts the day at 00:00 KST, which is 15:00 UTC the day before", () => {
    expect(kstDayStart(new Date("2026-11-15T10:00:00Z"))).toBe("2026-11-14T15:00:00.000Z");
    expect(kstDayStart(new Date("2026-11-15T15:00:00Z"))).toBe("2026-11-15T15:00:00.000Z");
    expect(kstDayStart(new Date("2026-11-15T14:59:59Z"))).toBe("2026-11-14T15:00:00.000Z");
  });
});

describe("usageStatuses", () => {
  it("logs one row per attempt; a retried attempt counts as a failure", () => {
    expect(usageStatuses({ kind: "ok", calls: 2 })).toEqual(["failure", "success"]);
    expect(usageStatuses({ kind: "outside_free_range", calls: 1 })).toEqual(["success"]);
    expect(usageStatuses({ kind: "quota", calls: 1 })).toEqual(["quota_exceeded"]);
    expect(usageStatuses({ kind: "unavailable", calls: 2 })).toEqual(["failure", "failure"]);
    expect(usageStatuses({ kind: "outside_free_range", calls: 0 })).toEqual([]);
  });
});

function store(today: { calls: number; quotaHit: boolean } | "error"): UsageStore & { logCalls: ReturnType<typeof vi.fn> } {
  return {
    usageSince: vi.fn(async () => {
      if (today === "error") throw new Error("db down");
      return today;
    }),
    logCalls: vi.fn(async () => {}),
  };
}

describe("meter", () => {
  const now = () => new Date("2026-11-15T03:00:00Z");

  it("allows calls below our daily cap", async () => {
    const usage = store({ calls: 89, quotaHit: false });
    expect(await meter(usage, "perenual", 90, now).canCall()).toBe(true);
    expect(usage.usageSince).toHaveBeenCalledWith("perenual", "2026-11-14T15:00:00.000Z");
  });

  it("stops at the cap", async () => {
    expect(await meter(store({ calls: 90, quotaHit: false }), "perenual", 90, now).canCall()).toBe(false);
  });

  it("stops for the day once the provider reported its quota used up", async () => {
    expect(await meter(store({ calls: 3, quotaHit: true }), "perenual", 90, now).canCall()).toBe(false);
  });

  it("does not call a provider when usage cannot be read", async () => {
    expect(await meter(store("error"), "trefle", 300, now).canCall()).toBe(false);
  });

  it("does not fail the search when logging fails", async () => {
    const usage = store({ calls: 0, quotaHit: false });
    usage.logCalls.mockRejectedValue(new Error("insert failed"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(meter(usage, "trefle", 300, now).record("search", { kind: "ok", calls: 1 })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("Could not log trefle usage");
    error.mockRestore();
  });
});

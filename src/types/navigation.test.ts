import { describe, expect, it } from "vitest";
import { MAIN_TABS, findActiveTab } from "./navigation";

describe("MAIN_TABS", () => {
  it("has the four tabs from ADR-0003 D15 in order", () => {
    expect(MAIN_TABS.map((t) => t.label)).toEqual(["오늘", "내 식물", "건강 점검", "더보기"]);
  });
});

describe("findActiveTab", () => {
  it("matches nested paths by segment", () => {
    expect(findActiveTab("/plants/123")?.screen).toBe("S11");
    expect(findActiveTab("/plantsfoo")).toBeUndefined();
    expect(findActiveTab("/login")).toBeUndefined();
  });
});

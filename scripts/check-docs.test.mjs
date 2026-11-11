import { describe, expect, it } from "vitest";
import { ADR_STATUS, PROGRESS_NAME, extractLocalLinks } from "./check-docs.mjs";

describe("extractLocalLinks", () => {
  it("keeps relative links and drops URLs, anchors and code", () => {
    const md = "[a](../x.md#s) [b](https://e.com) [c](#top) `[d](no.md)`\n```\n[e](no.md)\n```";
    expect(extractLocalLinks(md)).toEqual(["../x.md"]);
  });
});

describe("naming rules", () => {
  it("accepts valid progress names only", () => {
    expect(PROGRESS_NAME.test("2026-11-12_claude.md")).toBe(true);
    expect(PROGRESS_NAME.test("2026-11-12-claude.md")).toBe(false);
  });

  it("requires an ADR status line", () => {
    expect(ADR_STATUS.test("# ADR\n\nStatus: Accepted (user)")).toBe(true);
    expect(ADR_STATUS.test("# ADR\n")).toBe(false);
  });
});

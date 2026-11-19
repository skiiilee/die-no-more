// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PotView } from "@/types/plant";
import { PlantDetail } from "./PlantDetail";
import { PlantsLoadError } from "./PlantsLoadError";

afterEach(cleanup);

const POT: PotView = {
  id: "20000000-0000-0000-0000-00000000000a",
  nickname: null,
  userEnteredName: "고무나무",
  species: null,
  environment: "indoor",
  location: null,
  memo: "창가에서 관리\n잎 뒷면에 반점 확인",
  lastWatered: "about_1_week",
  lightLevel: "medium",
  lastRepotted: "unknown",
  potMaterial: "plastic",
  initialStateRecordedAt: "2026-11-15T00:00:00Z",
  waterReminder: false,
  fertilizerReminder: false,
  createdAt: "2026-11-15T00:00:00Z",
  photo: null,
};

describe("S06 memo (PR #13 review, item 4)", () => {
  it("shows the memo with its line breaks", () => {
    render(<PlantDetail pot={POT} />);
    const memo = screen.getByText(/창가에서 관리/);
    expect(memo.textContent).toBe("창가에서 관리\n잎 뒷면에 반점 확인");
    // CSS modules resolve to the class name; it carries white-space: pre-line.
    expect(memo.className).toMatch(/memo/);
  });
});

describe("plants load error (PR #13 review, item 3)", () => {
  it("says loading failed, not that the pot is missing, and offers a retry", () => {
    const retry = vi.fn();
    render(<PlantsLoadError onRetry={retry} />);
    expect(screen.getByRole("alert").textContent).toMatch(/불러오는 중 문제/);
    expect(screen.queryByText(/찾을 수 없/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

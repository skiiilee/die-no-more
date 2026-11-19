// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PotView } from "@/types/plant";
import type { CareFacts, PotCare, SpeciesCare } from "@/types/species";
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

describe("S06 종별 관리 참고 (F10)", () => {
  const SPECIES_POT: PotView = {
    ...POT,
    userEnteredName: null,
    species: { id: "10000000-0000-0000-0000-000000000001", koreanName: "고무나무", scientificName: "Ficus elastica" },
  };
  const FACTS: CareFacts = {
    careLevel: "보통",
    light: "반그늘",
    watering: "보통",
    wateringInterval: "7~10일",
    temperature: null,
    soil: null,
    fertilizer: null,
    description: null,
    aiFields: [],
    aiModel: null,
  };
  const card = () => screen.getByRole("heading", { name: "종별 관리 참고" }).parentElement!;

  it("shows the species' stored care, apart from the pot's own info", async () => {
    const care = Promise.resolve<PotCare>({ care: { status: "available", facts: FACTS }, aiFill: [], aiCare: null });
    await act(async () => {
      render(<PlantDetail pot={SPECIES_POT} care={care} />);
    });
    expect(card().textContent).toContain("고무나무 종 공통 참고 정보입니다. 이 화분의 기록이 아닙니다.");
    expect(screen.getByText("반그늘")).toBeTruthy();
    expect(screen.getByText("7~10일")).toBeTruthy();
    expect(screen.getAllByText("정보 없음")).toHaveLength(4);
    expect(screen.getByText("관리 정보 출처: Perenual. 화분 환경에 따라 다를 수 있습니다.")).toBeTruthy();
  });

  it("shows the pot at once and says the care is loading until it arrives", async () => {
    let resolve: (value: PotCare) => void = () => {};
    const care = new Promise<PotCare>((done) => {
      resolve = done;
    });
    await act(async () => {
      render(<PlantDetail pot={SPECIES_POT} care={care} />);
    });
    expect(screen.getByRole("heading", { level: 1, name: "고무나무" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("관리 정보를 불러오는 중입니다");
    await act(async () => {
      resolve({ care: { status: "available", facts: FACTS }, aiFill: [], aiCare: null });
      await care;
    });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("반그늘")).toBeTruthy();
  });

  it("streams the AI-filled fields in with the 'AI 생성' mark, like S04-B", async () => {
    let resolve: (value: SpeciesCare) => void = () => {};
    const aiCare = new Promise<SpeciesCare>((done) => {
      resolve = done;
    });
    const care = Promise.resolve<PotCare>({ care: { status: "available", facts: FACTS }, aiFill: ["temperature"], aiCare });
    await act(async () => {
      render(<PlantDetail pot={SPECIES_POT} care={care} />);
    });
    expect(screen.getByText("불러오는 중…")).toBeTruthy();
    await act(async () => {
      resolve({ status: "available", facts: { ...FACTS, temperature: "18~25도", aiFields: ["temperature"], aiModel: "model-x" } });
      await aiCare;
    });
    expect(screen.getByText("18~25도")).toBeTruthy();
    expect(screen.getByText("AI 생성")).toBeTruthy();
  });

  it("says there is no care data for this species, without the S04-B '등록한 뒤' wording", async () => {
    const care = Promise.resolve<PotCare>({ care: { status: "none" }, aiFill: [], aiCare: null });
    await act(async () => {
      render(<PlantDetail pot={SPECIES_POT} care={care} />);
    });
    expect(card().textContent).toContain("이 식물의 관리 정보가 없습니다. 물 알림은 제공되지 않습니다.");
    expect(card().textContent).not.toContain("등록한 뒤");
    expect(screen.getAllByText("정보 없음")).toHaveLength(8);
  });

  it("keeps S06 usable when the care could not be loaded now", async () => {
    const care = Promise.resolve<PotCare>({ care: { status: "pending" }, aiFill: [], aiCare: null });
    await act(async () => {
      render(<PlantDetail pot={SPECIES_POT} care={care} />);
    });
    expect(card().textContent).toContain("관리 정보를 지금 불러오지 못했습니다");
    expect(screen.getByRole("button", { name: "사진 추가" })).toBeTruthy();
  });

  it("has no species care for a pot without a species", () => {
    render(<PlantDetail pot={POT} />);
    expect(card().textContent).toContain("아직 관리 정보 없음. 종이 정해지지 않은 화분입니다.");
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HealthInput, SavedHealthCheck } from "@/types/health";
import { HealthHistoryCard } from "./HealthHistoryCard";
import { HealthSaveCard, SAVE_MESSAGES } from "./HealthSaveCard";
import { SavedHealthView } from "./SavedHealthView";

const { push, save } = vi.hoisted(() => ({ push: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./health-client", () => ({ requestSave: save }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const POT_A = "20000000-0000-0000-0000-00000000000a";
const POT_B = "20000000-0000-0000-0000-00000000000c";
const POTS = [
  { id: POT_A, name: "거실 몬스테라" },
  { id: POT_B, name: "고무나무" },
];
const INPUT: HealthInput = { symptoms: ["spots"], noticed: "today", notes: "잎에 반점", potId: POT_A };
const PHOTOS = [new Blob(["leaf"], { type: "image/jpeg" })];
const TOKENS = { result: "signed-result", explanation: "signed-explanation", judgement: null };

const saveButton = () => screen.getByRole("button", { name: /결과 저장|저장 중|저장했습니다|AI 설명을 기다리는 중/ }) as HTMLButtonElement;

describe("S07-S 이 화분에 결과 저장", () => {
  it("preselects the pot from S07-A and sends the signed result, photos and AI text, then opens S06", async () => {
    save.mockResolvedValueOnce({ kind: "saved", potId: POT_A, checkId: "c1" });
    render(<HealthSaveCard pots={POTS} input={INPUT} photos={PHOTOS} tokens={TOKENS} waiting={false} />);
    expect((screen.getByLabelText("저장할 화분") as HTMLSelectElement).value).toBe(POT_A);
    await act(async () => fireEvent.click(saveButton()));
    expect(save).toHaveBeenCalledWith(PHOTOS, INPUT, TOKENS);
    expect(push).toHaveBeenCalledWith(`/plants/${POT_A}?health=saved`);
    expect(saveButton().textContent).toBe("저장했습니다");
    expect(saveButton().disabled).toBe(true);
  });

  it("needs a pot, and saves to the one chosen here", async () => {
    save.mockResolvedValueOnce({ kind: "saved", potId: POT_B, checkId: "c2" });
    render(<HealthSaveCard pots={POTS} input={{ ...INPUT, potId: null }} photos={PHOTOS} tokens={TOKENS} waiting={false} />);
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("저장할 화분"), { target: { value: POT_B } });
    await act(async () => fireEvent.click(saveButton()));
    expect(save.mock.calls[0][1].potId).toBe(POT_B);
  });

  it("waits for the AI explanation so it is not left out", () => {
    render(<HealthSaveCard pots={POTS} input={INPUT} photos={PHOTOS} tokens={TOKENS} waiting />);
    expect(saveButton().textContent).toBe("AI 설명을 기다리는 중…");
    expect(saveButton().disabled).toBe(true);
  });

  it("says why it could not save and lets the user try again", async () => {
    save.mockResolvedValueOnce({ kind: "stale" }).mockResolvedValueOnce({ kind: "failed" });
    render(<HealthSaveCard pots={POTS} input={INPUT} photos={PHOTOS} tokens={TOKENS} waiting={false} />);
    await act(async () => fireEvent.click(saveButton()));
    expect(screen.getByRole("alert").textContent).toBe(SAVE_MESSAGES.stale);
    await act(async () => fireEvent.click(saveButton()));
    expect(screen.getByRole("alert").textContent).toBe(SAVE_MESSAGES.failed);
    expect(push).not.toHaveBeenCalled();
  });

  it("asks to add a pot first when there is none", () => {
    render(<HealthSaveCard pots={[]} input={INPUT} photos={PHOTOS} tokens={TOKENS} waiting={false} />);
    expect(screen.getByText(/등록한 화분이 없어/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "식물 추가" }).getAttribute("href")).toBe("/plants/new");
  });
});

describe("S06 건강 점검 기록", () => {
  it("lists saved checks with their outcome and links to each one", () => {
    render(
      <HealthHistoryCard
        potId={POT_A}
        justSaved
        checks={[
          { id: "c1", analyzedAt: "2026-11-24T06:00:00Z", outcome: "found", topCause: "Botrytis cinerea", hasAi: true },
          { id: "c2", analyzedAt: "2026-11-20T06:00:00Z", outcome: "unclear", topCause: null, hasAi: false },
        ]}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("저장했습니다");
    const links = screen.getAllByRole("link");
    expect(links[0].getAttribute("href")).toBe(`/plants/${POT_A}/health/c1`);
    expect(links[0].textContent).toContain("Botrytis cinerea 가능성 · AI 참고 포함");
    expect(links[1].textContent).toContain("판단 어려움");
    expect(screen.getByRole("link", { name: "건강 점검" }).getAttribute("href")).toBe(`/health?pot=${POT_A}`);
  });

  it("says when nothing is saved yet", () => {
    render(<HealthHistoryCard potId={POT_A} checks={[]} />);
    expect(screen.getByText("아직 저장한 건강 점검이 없습니다.")).toBeTruthy();
  });
});

describe("saved health check detail", () => {
  const CHECK: SavedHealthCheck = {
    id: "c1",
    analyzedAt: "2026-11-24T06:00:00Z",
    outcome: "unclear",
    topCause: null,
    hasAi: true,
    symptoms: ["browning"],
    noticed: "this_week",
    notes: "창가에 둠",
    causes: [],
    aiExplanation: null,
    aiJudgement: { signs: ["잎 끝 갈변"], causes: [{ name: "건조", reason: "잎 끝이 말라 보임" }], checks: [], actions: [] },
    aiModel: "gemini-3.5-flash-lite",
    photos: [
      { id: "p1", url: "https://signed.example/p1.jpg" },
      { id: "p2", url: null },
    ],
  };

  it("shows the photos, the observation, '판단 어려움', the AI reading, and one AI note at the bottom", () => {
    render(<SavedHealthView potId={POT_A} potName="거실 몬스테라" check={CHECK} />);
    expect(screen.getByAltText("증상 사진 1").getAttribute("src")).toBe("https://signed.example/p1.jpg");
    expect(screen.getByRole("img", { name: "사진을 불러오지 못함" })).toBeTruthy();
    expect(screen.getByText("창가에 둠")).toBeTruthy();
    expect(screen.getByText(/판단 어려움/)).toBeTruthy();
    expect(screen.getByRole("list", { name: "AI가 본 가능한 원인" }).textContent).toContain("건조 가능성");
    expect(screen.queryByText("AI 생성")).toBeNull();
    expect(screen.getByRole("note", { name: "AI 생성 안내" }).textContent).toContain("AI(gemini-3.5-flash-lite)");
    expect(screen.getByRole("link", { name: "거실 몬스테라" }).getAttribute("href")).toBe(`/plants/${POT_A}`);
  });

  it("has no AI note when the AI wrote nothing", () => {
    render(<SavedHealthView potId={POT_A} potName="거실 몬스테라" check={{ ...CHECK, hasAi: false, aiJudgement: null, aiModel: null }} />);
    expect(screen.queryByRole("note", { name: "AI 생성 안내" })).toBeNull();
  });
});

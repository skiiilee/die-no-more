// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExplainAnswer, HealthAnswer } from "@/types/health";
import { HEALTH_MESSAGES, HealthCheckScreen } from "./HealthCheckScreen";

const { check, explain } = vi.hoisted(() => ({ check: vi.fn(), explain: vi.fn() }));

vi.mock("./health-client", () => ({ requestHealthCheck: check, requestExplanation: explain }));
vi.mock("@/ui/plants/photo-prep", () => ({
  prepareForUpload: vi.fn(async (file: File) => ({ ok: true, blob: new Blob([`small ${file.name}`], { type: "image/jpeg" }) })),
  fitRequest: vi.fn(async (photos: { blob: Blob }[]) => ({ ok: true, blobs: photos.map((p) => p.blob) })),
}));

const POTS = [{ id: "20000000-0000-0000-0000-00000000000a", name: "고무나무" }];
const OK: HealthAnswer = {
  kind: "ok",
  candidates: [
    { code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 },
    { code: "ERYSCI", name: "Erysiphe cichoracearum", score: 0.12 },
  ],
  analyzedAt: "2026-11-22T06:00:00Z",
  speciesName: "Ficus elastica",
  token: "signed-result",
};

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  check.mockResolvedValue(OK);
  explain.mockResolvedValue({ kind: "none" } satisfies ExplainAnswer);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openWithPhoto(initialPotId: string | null = null) {
  render(<HealthCheckScreen pots={POTS} initialPotId={initialPotId} />);
  fireEvent.click(screen.getByRole("button", { name: "+ 증상 사진 추가" }));
  await act(async () => {
    fireEvent.change(screen.getByTestId("gallery-input"), { target: { files: [new File(["x"], "leaf.jpg", { type: "image/jpeg" })] } });
  });
  await waitFor(() => expect(screen.getByText("준비됨")).toBeTruthy());
}

const analyzeButton = () => screen.getByRole("button", { name: "분석하기" }) as HTMLButtonElement;

async function analyze() {
  fireEvent.click(screen.getByRole("checkbox", { name: /Pl@ntNet에 사진을 보내/ }));
  await act(async () => fireEvent.click(analyzeButton()));
}

describe("S07-A 건강 점검 입력 (03 §4, ADR-0003 D5)", () => {
  it("keeps [분석하기] off and sends nothing until a photo is ready and consent is ticked", async () => {
    render(<HealthCheckScreen pots={POTS} initialPotId={null} />);
    expect(analyzeButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Pl@ntNet에 사진을 보내/ }));
    expect(analyzeButton().disabled).toBe(true);
    cleanup();

    await openWithPhoto();
    expect(analyzeButton().disabled).toBe(true);
    fireEvent.click(analyzeButton());
    expect(check).not.toHaveBeenCalled();
  });

  it("sends the prepared photos with the pot, symptoms, time and notes, with consent", async () => {
    await openWithPhoto(POTS[0].id);
    fireEvent.click(screen.getByRole("checkbox", { name: "반점" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "해충 의심" }));
    fireEvent.change(screen.getByLabelText("발견 시점"), { target: { value: "this_week" } });
    fireEvent.change(screen.getByLabelText(/추가 설명/), { target: { value: "  잎에 회색 가루  " } });
    await analyze();
    const [blobs, consent, input] = check.mock.calls[0];
    expect(await (blobs as Blob[])[0].text()).toBe("small leaf.jpg");
    expect(consent).toBe(true);
    expect(input).toEqual({ symptoms: ["spots", "pests"], noticed: "this_week", notes: "잎에 회색 가루", potId: POTS[0].id });
  });

  it("keeps the photos and answers on failure, says why, and asks for consent again", async () => {
    check.mockResolvedValueOnce({ kind: "quota" });
    await openWithPhoto();
    fireEvent.click(screen.getByRole("checkbox", { name: "시듦" }));
    await analyze();
    expect(screen.getByRole("alert").textContent).toBe(HEALTH_MESSAGES.quota);
    expect(screen.getByText("준비됨")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "시듦" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Pl@ntNet에 사진을 보내/ }) as HTMLInputElement).checked).toBe(false);
  });

  it("refuses notes over 300 characters before sending", async () => {
    await openWithPhoto();
    fireEvent.change(screen.getByLabelText(/추가 설명/), { target: { value: "가".repeat(301) } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Pl@ntNet에 사진을 보내/ }));
    expect(analyzeButton().disabled).toBe(true);
    expect(screen.getByText("추가 설명은 300자까지 쓸 수 있습니다.")).toBeTruthy();
  });
});

describe("S07-B 건강 결과 (03 §4 result structure, ADR-0006)", () => {
  it("shows possible causes by rank without scores, the fixed checks, the limits, and never a diagnosis", async () => {
    await openWithPhoto();
    fireEvent.click(screen.getByRole("checkbox", { name: "반점" }));
    await analyze();
    expect(screen.getByRole("heading", { name: "건강 점검 결과" })).toBeTruthy();
    expect(screen.getByRole("note").textContent).toContain("확정 진단이 아닙니다");
    const causes = screen.getByRole("list", { name: "가능한 원인 후보" });
    expect(causes.textContent).toContain("후보 1 Botrytis cinerea 가능성");
    expect(causes.textContent).toContain("EPPO 코드 BOTRCI");
    expect(causes.textContent).not.toMatch(/0\.3|30%/);
    expect(screen.getByText(/며칠 간격으로 같은 잎을 찍어/)).toBeTruthy();
    expect(screen.getByText(/사진만으로 원인을 확정할 수 없습니다/)).toBeTruthy();
  });

  it("asks the AI after showing the result, then shows its texts in one card with a single 'AI 생성' note", async () => {
    let resolve: (answer: ExplainAnswer) => void = () => {};
    explain.mockImplementationOnce(() => new Promise<ExplainAnswer>((done) => (resolve = done)));
    await openWithPhoto();
    await analyze();
    expect(screen.getByRole("status").textContent).toContain("쉬운 말로 풀어 쓰는 중");
    // The server takes the causes from the signed result, not from what the browser sends.
    expect(explain).toHaveBeenCalledWith("signed-result", { symptoms: [], noticed: "unknown", notes: "", potId: null });

    await act(async () =>
      resolve({
        kind: "ok",
        explanation: {
          causes: [{ code: "BOTRCI", text: "습할 때 생기는 곰팡이일 가능성이 있습니다." }],
          checks: ["통풍이 되는지 보기"],
          actions: ["시든 잎을 모아 두지 않기"],
          model: "model-x",
        },
      }),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/습할 때 생기는 곰팡이일 가능성/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "AI 참고 설명" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "AI가 덧붙인 확인과 행동" }).textContent).toContain("통풍이 되는지 보기");
    // No label on every line (owner decision 2026-11-22): one note at the bottom.
    expect(screen.queryByText("AI 생성")).toBeNull();
    const note = screen.getByRole("note", { name: "AI 생성 안내" });
    expect(note.textContent).toContain("AI(model-x)가 쓴 참고 내용");
    expect(note.parentElement?.lastElementChild).toBe(note);
  });

  it("keeps the fixed parts and says so when the AI explanation is not available", async () => {
    explain.mockResolvedValueOnce({ kind: "unavailable" });
    await openWithPhoto();
    await analyze();
    expect(await screen.findByText("AI 설명은 지금 만들지 못해 기본 확인 항목만 보여 줍니다.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "AI 참고 설명" })).toBeNull();
    expect(screen.queryByRole("note", { name: "AI 생성 안내" })).toBeNull();
    expect(screen.getByText(/흙 상태를 손가락으로/)).toBeTruthy();
  });

  it("says '판단 어려움' when nothing passed, without asking the AI", async () => {
    check.mockResolvedValueOnce({ kind: "unclear", analyzedAt: OK.analyzedAt, speciesName: null, token: "t" });
    await openWithPhoto();
    await analyze();
    expect(screen.getByText(/판단 어려움/)).toBeTruthy();
    expect(explain).not.toHaveBeenCalled();
    expect(screen.getByText(/대상 식물을 정하지 않아 정확도가 더 낮을 수 있습니다/)).toBeTruthy();
  });

  it("[다시 점검] returns to the input with the photos and answers kept, consent cleared", async () => {
    await openWithPhoto();
    fireEvent.click(screen.getByRole("checkbox", { name: "잎 갈변" }));
    await analyze();
    fireEvent.click(screen.getByRole("button", { name: "다시 점검" }));
    expect(screen.getByText("준비됨")).toBeTruthy();
    expect((screen.getByRole("checkbox", { name: "잎 갈변" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: /Pl@ntNet에 사진을 보내/ }) as HTMLInputElement).checked).toBe(false);
  });
});

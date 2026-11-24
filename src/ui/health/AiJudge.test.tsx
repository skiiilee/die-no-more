// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HealthAnswer, HealthInput, JudgeAnswer } from "@/types/health";
import { JUDGE_MESSAGES } from "./AiJudgePanel";
import { HealthResult } from "./HealthResult";

const { judge, explain } = vi.hoisted(() => ({ judge: vi.fn(), explain: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./health-client", () => ({ requestAiJudgement: judge, requestExplanation: explain }));

const UNCLEAR: HealthAnswer = { kind: "unclear", analyzedAt: "2026-11-22T06:00:00Z", speciesName: null, token: "unclear-result" };
const INPUT: HealthInput = { symptoms: ["browning"], noticed: "today", notes: "개인 메모", potId: null };
const PHOTOS = [new Blob(["leaf"], { type: "image/jpeg" })];
const RECIPIENT = { name: "Google Gemini", model: "gemini-3.5-flash-lite" };

beforeEach(() => {
  explain.mockResolvedValue({ kind: "none" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderUnclear = (recipient: typeof RECIPIENT | null = RECIPIENT) =>
  render(<HealthResult answer={UNCLEAR} input={INPUT} photos={PHOTOS} aiRecipient={recipient} onAgain={() => {}} />);

const askButton = () => screen.getByRole("button", { name: "AI에게 사진으로 물어보기" }) as HTMLButtonElement;
const consentBox = () => screen.getByRole("checkbox", { name: /Google Gemini에 이 사진을 보내/ }) as HTMLInputElement;

describe("S07-B '판단 어려움' → AI photo reading (ADR-0006 D6)", () => {
  it("offers the AI only after '판단 어려움', naming who gets the photos and the training risk", () => {
    renderUnclear();
    expect(screen.getByText(/판단 어려움/)).toBeTruthy();
    expect(screen.getByText(/무료 등급이라 보낸 사진이 해당 서비스의 개선\(학습\)에 쓰일 수 있습니다/)).toBeTruthy();
    expect(screen.getByText(/추가 설명은 보내지 않습니다/)).toBeTruthy();
    expect(askButton().disabled).toBe(true);
    fireEvent.click(askButton());
    expect(judge).not.toHaveBeenCalled();
  });

  it("is not offered when the AI is not configured, or when Pl@ntNet found causes", () => {
    renderUnclear(null);
    expect(screen.queryByRole("button", { name: "AI에게 사진으로 물어보기" })).toBeNull();
    cleanup();
    const found: HealthAnswer = {
      kind: "ok",
      candidates: [{ code: "BOTRCI", name: "Botrytis cinerea", score: 0.3 }],
      analyzedAt: UNCLEAR.analyzedAt,
      speciesName: null,
      token: "ok-result",
    };
    render(<HealthResult answer={found} input={INPUT} photos={PHOTOS} aiRecipient={RECIPIENT} onAgain={() => {}} />);
    expect(screen.queryByRole("button", { name: "AI에게 사진으로 물어보기" })).toBeNull();
  });

  it("sends the same photos with consent, then shows the AI's signs and causes, noted once at the bottom", async () => {
    judge.mockResolvedValueOnce({
      kind: "ok",
      judgement: {
        signs: ["잎 끝이 갈색으로 말라 있음"],
        causes: [{ name: "건조", reason: "잎 끝이 바삭해 보입니다." }],
        checks: ["흙 속 습도 확인"],
        actions: [],
        model: "gemini-3.5-flash-lite",
      },
      token: "signed-judgement",
    } satisfies JudgeAnswer);
    renderUnclear();
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(askButton()));
    expect(judge).toHaveBeenCalledWith(PHOTOS, true, INPUT, "unclear-result");
    expect(screen.getByRole("heading", { name: "AI의 사진 판단 (참고)" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "AI가 본 가능한 원인" }).textContent).toContain("건조 가능성");
    expect(screen.queryByText("AI 생성")).toBeNull();
    const note = screen.getByRole("note", { name: "AI 생성 안내" });
    expect(note.textContent).toContain("AI의 사진 판단");
    expect(note.textContent).toContain("AI(gemini-3.5-flash-lite)가 쓴 참고 내용");
    expect(note.textContent).toContain("틀릴 수 있습니다");
  });

  it("tells the user to check again when the server refuses an old or unrelated result", async () => {
    judge.mockResolvedValueOnce({ kind: "stale" }).mockResolvedValueOnce({ kind: "not_allowed" });
    renderUnclear();
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(askButton()));
    expect(screen.getByRole("alert").textContent).toBe(JUDGE_MESSAGES.stale);
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(askButton()));
    expect(screen.getByRole("alert").textContent).toBe(JUDGE_MESSAGES.not_allowed);
  });

  it("says when the AI found nothing or failed, and asks for consent again", async () => {
    judge.mockResolvedValueOnce({ kind: "none" }).mockResolvedValueOnce({ kind: "quota" });
    renderUnclear();
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(askButton()));
    expect(screen.getByRole("alert").textContent).toBe(JUDGE_MESSAGES.none);
    expect(consentBox().checked).toBe(false);
    fireEvent.click(consentBox());
    await act(async () => fireEvent.click(askButton()));
    expect(screen.getByRole("alert").textContent).toBe(JUDGE_MESSAGES.quota);
  });
});

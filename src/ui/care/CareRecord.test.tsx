// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CareRecordSummary, SavedCareRecord } from "@/types/care";
import { koreanLocalTime } from "./care-client";
import { CareHistoryCard } from "./CareHistoryCard";
import { CARE_SAVE_MESSAGES, CareRecordScreen } from "./CareRecordScreen";
import { SavedCareView } from "./SavedCareView";

const { push, save } = vi.hoisted(() => ({ push: vi.fn(), save: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("./care-client", async (original) => ({
  ...(await original<typeof import("./care-client")>()),
  requestCareSave: save,
}));

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

const saveButton = () => screen.getByRole("button", { name: /기록 저장하기|저장 중|저장했습니다/ }) as HTMLButtonElement;

describe("S08 관리 기록", () => {
  it("cannot be saved empty, and sends only what was entered with one form key", async () => {
    save.mockResolvedValue({ kind: "saved", potId: POT_A, recordId: "r1" });
    render(<CareRecordScreen pots={POTS} initialPotId={POT_A} />);
    expect((screen.getByLabelText("화분") as HTMLSelectElement).value).toBe(POT_A);
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(CARE_SAVE_MESSAGES.empty)).toBeTruthy();

    fireEvent.click(screen.getByLabelText("실제 물주기"));
    fireEvent.change(screen.getByLabelText("물의 양 (선택, ml)"), { target: { value: "300" } });
    fireEvent.click(screen.getByLabelText("마름"));
    expect(saveButton().disabled).toBe(false);
    await act(async () => fireEvent.click(saveButton()));

    const [key, form, photos] = save.mock.calls[0];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(form).toMatchObject({ potId: POT_A, actions: ["water"], waterMl: "300", soilState: "dry", observation: "", notes: "" });
    expect(photos).toEqual([]);
    expect(push).toHaveBeenCalledWith(`/plants/${POT_A}?record=saved`);
    expect(saveButton().textContent).toBe("저장했습니다");
  });

  it("shows the detail field of a ticked activity only, and blocks a bad amount", () => {
    render(<CareRecordScreen pots={POTS} initialPotId={POT_A} />);
    expect(screen.queryByLabelText("비료 주기 메모 (선택)")).toBeNull();
    fireEvent.click(screen.getByLabelText("비료 주기"));
    expect(screen.getByLabelText("비료 주기 메모 (선택)")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("실제 물주기"));
    fireEvent.change(screen.getByLabelText("물의 양 (선택, ml)"), { target: { value: "많이" } });
    expect(screen.getByText(/사이의 숫자로 입력해 주세요/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps everything entered after a failure, and sends the same key again", async () => {
    save.mockResolvedValueOnce({ kind: "network" }).mockResolvedValueOnce({ kind: "saved", potId: POT_A, recordId: "r1" });
    render(<CareRecordScreen pots={POTS} initialPotId={POT_A} />);
    fireEvent.change(screen.getByLabelText(/잎·해충·환경 관찰/), { target: { value: "새 잎이 나옴" } });
    await act(async () => fireEvent.click(saveButton()));
    expect(screen.getByRole("alert").textContent).toBe(CARE_SAVE_MESSAGES.network);
    expect((screen.getByLabelText(/잎·해충·환경 관찰/) as HTMLTextAreaElement).value).toBe("새 잎이 나옴");
    expect(push).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(saveButton()));
    expect(save.mock.calls[1][0]).toBe(save.mock.calls[0][0]);
  });

  it("asks for a pot first when there is none", () => {
    render(<CareRecordScreen pots={[]} initialPotId="" />);
    expect(screen.getByRole("link", { name: "식물 추가" })).toBeTruthy();
  });

  it("formats now as Korean local time for the date field", () => {
    expect(koreanLocalTime(new Date("2026-11-26T15:30:00Z"))).toBe("2026-11-27T00:30");
  });
});

describe("S06 최근 관리 기록 and the saved record", () => {
  const RECORDS: CareRecordSummary[] = [
    { id: "r1", recordedAt: "2026-11-26T05:30:00Z", actions: ["water", "fertilize"], soilState: "dry", hasObservation: true, photoCount: 2, hasNotes: false },
  ];

  it("lists each record by what it holds, links its detail, and offers a new record", () => {
    render(<CareHistoryCard potId={POT_A} records={RECORDS} justSaved />);
    expect(screen.getByRole("status").textContent).toBe("관리 기록을 저장했습니다.");
    const link = screen.getByRole("link", { name: /물주기 · 비료 · 흙 마름 · 관찰 · 사진 2장/ });
    expect(link.getAttribute("href")).toBe(`/plants/${POT_A}/records/r1`);
    expect(screen.getByRole("link", { name: "관리 기록" }).getAttribute("href")).toBe(`/plants/${POT_A}/records/new`);
  });

  it("shows an empty card when there are no records", () => {
    render(<CareHistoryCard potId={POT_A} records={[]} />);
    expect(screen.getByText("아직 남긴 관리 기록이 없습니다.")).toBeTruthy();
  });

  it("shows only the parts of a record that were entered", () => {
    const record: SavedCareRecord = {
      id: "r1",
      recordedAt: "2026-11-26T05:30:00Z",
      actions: [{ type: "water", amountMl: 1500, notes: "" }],
      soilState: null,
      observation: null,
      notes: "베란다에서",
      photos: [{ id: "p1", url: null }],
    };
    render(<SavedCareView potId={POT_A} potName="거실 몬스테라" record={record} />);
    expect(screen.getByText(/실제 물주기 · 1,500ml/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "관찰" })).toBeNull();
    expect(screen.getByRole("img", { name: "사진을 불러오지 못함" })).toBeTruthy();
    expect(screen.getByText("베란다에서")).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentificationView } from "@/types/photo";
import { IdentificationResults } from "./IdentificationResults";
import { handOverPhotos, pendingPhotos } from "./pending-photos";
import { DELETE_FAILED, IDENTIFY_MESSAGES, PhotoListScreen } from "./PhotoListScreen";
import { PhotoScanButton } from "./PhotoScanButton";

const { push, upload, identify, remove } = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  upload: vi.fn(),
  identify: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// The browser canvas is not available in jsdom: preparation always succeeds here.
vi.mock("./photo-prep", () => ({
  prepareForUpload: vi.fn(async () => ({ ok: true, blob: new Blob(["x"], { type: "image/jpeg" }) })),
}));
vi.mock("./photo-client", () => ({ uploadPhotoFile: upload, requestIdentification: identify, deleteUploadedPhoto: remove }));

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  let n = 0;
  upload.mockImplementation(async () => ({ kind: "ok", id: `40000000-0000-0000-0000-00000000000${n++}` }));
  remove.mockResolvedValue(true);
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("S03 [식물 스캔]", () => {
  it("opens the camera/gallery dialog; [취소] closes it and stays on S03", () => {
    render(<PhotoScanButton />);
    fireEvent.click(screen.getByRole("button", { name: "식물 스캔" }));
    expect(screen.getByRole("dialog", { name: "사진 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "카메라로 촬영" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "갤러리에서 선택" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("hands the picked photos to S03-P", () => {
    render(<PhotoScanButton />);
    fireEvent.click(screen.getByRole("button", { name: "식물 스캔" }));
    const files = [photo("a.jpg"), photo("b.jpg")];
    fireEvent.change(screen.getByTestId("gallery-input"), { target: { files } });
    expect(pendingPhotos()).toEqual(files);
    expect(push).toHaveBeenCalledWith("/plants/new/photos");
  });

  it("asks the camera for a photo from the back camera", () => {
    render(<PhotoScanButton />);
    fireEvent.click(screen.getByRole("button", { name: "식물 스캔" }));
    expect(screen.getByTestId("camera-input").getAttribute("capture")).toBe("environment");
  });
});

async function openS03P(files: File[]) {
  handOverPhotos(files);
  render(<PhotoListScreen />);
  await waitFor(() => expect(screen.getAllByText("올림")).toHaveLength(Math.min(files.length, 5)));
}

describe("S03-P 업로드한 사진 (ADR-0003 D5)", () => {
  it("uploads the photos picked on S03 and lists them", async () => {
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("img", { name: /올린 사진/ })).toHaveLength(2);
  });

  it("keeps [사진으로 식물 찾기] off and sends nothing until consent is ticked", async () => {
    await openS03P([photo("a.jpg")]);
    const find = screen.getByRole("button", { name: "사진으로 식물 찾기" }) as HTMLButtonElement;
    expect(find.disabled).toBe(true);
    fireEvent.click(find);
    expect(identify).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(find.disabled).toBe(false);
  });

  it("sends the uploaded ids with consent and opens S04-A for the session", async () => {
    identify.mockResolvedValue({ kind: "ok", sessionId: "50000000-0000-0000-0000-000000000001" });
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진으로 식물 찾기" })));
    expect(identify).toHaveBeenCalledWith(
      ["40000000-0000-0000-0000-000000000000", "40000000-0000-0000-0000-000000000001"],
      true,
    );
    expect(push).toHaveBeenCalledWith("/plants/new/identify/50000000-0000-0000-0000-000000000001");
  });

  it("shows why it failed, keeps the photos, and asks for consent again", async () => {
    identify.mockResolvedValue({ kind: "quota" });
    await openS03P([photo("a.jpg")]);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진으로 식물 찾기" })));
    expect(screen.getByRole("alert").textContent).toBe(IDENTIFY_MESSAGES.quota);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByText("올림")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "이름 검색으로 돌아가기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "직접 입력하기" })).toBeTruthy();
  });

  it("takes at most 5 photos and says so", async () => {
    await openS03P(Array.from({ length: 7 }, (_, i) => photo(`${i}.jpg`)));
    expect(upload).toHaveBeenCalledTimes(5);
    expect(screen.getByText(/5장까지 올릴 수 있습니다/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "+ 사진 추가" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("[삭제] removes the photo from the list once the server confirms it", async () => {
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진 1 삭제" })));
    expect(screen.getAllByText("올림")).toHaveLength(1);
    expect(remove).toHaveBeenCalledWith("40000000-0000-0000-0000-000000000000");
  });

  it("keeps the photo and says so when the server could not delete it (PR #17 review)", async () => {
    remove.mockResolvedValue(false);
    await openS03P([photo("a.jpg")]);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진 1 삭제" })));
    expect(screen.getAllByText("올림")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain(DELETE_FAILED);
    // [삭제] can be pressed again.
    remove.mockResolvedValue(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진 1 삭제" })));
    expect(screen.queryAllByText("올림")).toHaveLength(0);
  });

  it("shows 지우는 중 and blocks [사진으로 식물 찾기] while a delete is in flight", async () => {
    let finish: (ok: boolean) => void = () => undefined;
    remove.mockImplementation(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "사진 1 삭제" }));
    expect(screen.getByText("지우는 중")).toBeTruthy();
    expect((screen.getByRole("button", { name: "사진으로 식물 찾기" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish(true));
    expect(screen.queryByText("지우는 중")).toBeNull();
  });

  it("does not offer [삭제] while a photo is still uploading (PR #17 review)", async () => {
    upload.mockImplementation(() => new Promise(() => undefined));
    handOverPhotos([photo("a.jpg")]);
    render(<PhotoListScreen />);
    await screen.findByText("올리는 중");
    expect((screen.getByRole("button", { name: "사진 1 삭제" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("deletes a photo whose upload finishes after the screen was left", async () => {
    let finish: (answer: unknown) => void = () => undefined;
    upload.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    handOverPhotos([photo("a.jpg")]);
    const { unmount } = render(<PhotoListScreen />);
    await screen.findByText("올리는 중");
    unmount();
    await act(async () => finish({ kind: "ok", id: "40000000-0000-0000-0000-000000000009" }));
    expect(remove).toHaveBeenCalledWith("40000000-0000-0000-0000-000000000009", { keepalive: true });
  });

  it("deletes the uploaded photos when the screen is left without identifying", async () => {
    handOverPhotos([photo("a.jpg"), photo("b.jpg")]);
    const { unmount } = render(<PhotoListScreen />);
    await waitFor(() => expect(screen.getAllByText("올림")).toHaveLength(2));
    unmount();
    expect(remove).toHaveBeenCalledWith("40000000-0000-0000-0000-000000000000", { keepalive: true });
    expect(remove).toHaveBeenCalledWith("40000000-0000-0000-0000-000000000001", { keepalive: true });
  });

  it("keeps the photos when leaving for the results of an identification", async () => {
    identify.mockResolvedValue({ kind: "ok", sessionId: "50000000-0000-0000-0000-000000000001" });
    handOverPhotos([photo("a.jpg")]);
    const { unmount } = render(<PhotoListScreen />);
    await waitFor(() => expect(screen.getAllByText("올림")).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진으로 식물 찾기" })));
    unmount();
    expect(remove).not.toHaveBeenCalled();
  });

  it("shows the server's reason when a photo is refused", async () => {
    upload.mockResolvedValueOnce({ kind: "invalid", message: "사진을 읽지 못했습니다. 다른 사진을 골라 주세요." });
    handOverPhotos([photo("a.jpg")]);
    render(<PhotoListScreen />);
    expect(await screen.findByText("사진을 읽지 못했습니다. 다른 사진을 골라 주세요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    expect((screen.getByRole("button", { name: "사진으로 식물 찾기" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts empty after a reload, with [사진 추가]", () => {
    handOverPhotos([]);
    render(<PhotoListScreen />);
    expect(screen.getByText("아직 올린 사진이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ 사진 추가" }));
    expect(screen.getByRole("dialog", { name: "사진 선택" })).toBeTruthy();
  });
});

const SESSION = "50000000-0000-0000-0000-000000000001";

describe("S04-A 사진으로 찾은 식물", () => {
  const view: IdentificationView = {
    kind: "completed",
    sessionId: SESSION,
    candidates: [
      {
        rank: 1,
        speciesId: "s1",
        koreanName: "몬스테라",
        scientificName: "Monstera deliciosa",
        imageUrl: "https://bs.plantnet.org/image/m/6c79",
        imageCredit: "Soynano Gallego / Pl@ntNet, cc-by-sa",
      },
      { rank: 2, speciesId: "s2", koreanName: null, scientificName: "Philodendron bipinnatifidum", imageUrl: null, imageCredit: null },
    ],
  };

  it("lists candidates by rank with Pl@ntNet's credited photo, and opens S04-B with the session", () => {
    render(<IdentificationResults view={view} />);
    expect(screen.getByText("후보 1")).toBeTruthy();
    expect(screen.getByText("사진: Soynano Gallego / Pl@ntNet, cc-by-sa")).toBeTruthy();
    expect(screen.getByRole("img", { name: "사진 없음" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "몬스테라 보기" }).getAttribute("href")).toBe(
      `/plants/new/species/s1?session=${SESSION}`,
    );
    expect(document.body.textContent).not.toMatch(/%|0\.8/);
    expect(screen.getByText(/확정된 결과가 아니니/)).toBeTruthy();
  });

  it("offers search and manual entry when nothing was found or the request failed", () => {
    render(<IdentificationResults view={{ kind: "completed", sessionId: SESSION, candidates: [] }} />);
    expect(screen.getByText("사진으로 식물을 찾지 못했습니다.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "직접 입력하기" }).getAttribute("href")).toBe("/plants/new/manual");
    cleanup();
    render(<IdentificationResults view={{ kind: "failed", sessionId: SESSION }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("link", { name: "다시 검색하기" }).getAttribute("href")).toBe("/plants/new");
  });
});

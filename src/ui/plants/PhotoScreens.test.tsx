// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IdentificationView } from "@/types/photo";
import { IdentificationResults } from "./IdentificationResults";
import { clearKeptPhotos, handOverPhotos, keepPhotos, keptPhotos, pendingPhotos } from "./pending-photos";
import { IDENTIFY_MESSAGES, PhotoListScreen } from "./PhotoListScreen";
import { PhotoScanButton } from "./PhotoScanButton";

const { push, identify, fit } = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  identify: vi.fn(),
  fit: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// The browser canvas is not available in jsdom: preparation always succeeds here.
vi.mock("./photo-prep", () => ({
  prepareForUpload: vi.fn(async (file: File) => ({ ok: true, blob: new Blob([`small ${file.name}`], { type: "image/jpeg" }) })),
  fitRequest: fit,
}));
vi.mock("./photo-client", () => ({ requestIdentification: identify }));

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });

beforeEach(() => {
  fit.mockImplementation(async (photos: { blob: Blob }[]) => ({ ok: true, blobs: photos.map((p) => p.blob) }));
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  clearKeptPhotos();
  vi.clearAllMocks();
});

/** Lets the delayed clean-up after an unmount run. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

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
  const view = render(<PhotoListScreen />);
  await waitFor(() => expect(screen.getAllByText("준비됨")).toHaveLength(Math.min(files.length, 5)));
  return view;
}

async function sendWithConsent() {
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진으로 식물 찾기" })));
}

describe("S03-P 고른 사진 (ADR-0003 D5, D6 changed 2026-11-18)", () => {
  it("prepares the photos picked on S03 in the browser and lists them; nothing is sent yet", async () => {
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    expect(screen.getAllByRole("img", { name: /고른 사진/ })).toHaveLength(2);
    expect(identify).not.toHaveBeenCalled();
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

  it("sends the prepared photos with consent, in order, and opens S04-A for the session", async () => {
    identify.mockResolvedValue({ kind: "ok", sessionId: "50000000-0000-0000-0000-000000000001" });
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    await sendWithConsent();
    const [blobs, consent] = identify.mock.calls[0]!;
    expect(consent).toBe(true);
    expect(await Promise.all((blobs as Blob[]).map((b) => b.text()))).toEqual(["small a.jpg", "small b.jpg"]);
    expect(push).toHaveBeenCalledWith("/plants/new/identify/50000000-0000-0000-0000-000000000001");
  });

  it("sends the smaller photos when all of them would not fit in one request", async () => {
    const smaller = [new Blob(["tiny"], { type: "image/jpeg" })];
    fit.mockResolvedValue({ ok: true, blobs: smaller });
    identify.mockResolvedValue({ kind: "ok", sessionId: "50000000-0000-0000-0000-000000000001" });
    await openS03P([photo("a.jpg")]);
    await sendWithConsent();
    expect(identify).toHaveBeenCalledWith(smaller, true);
  });

  it("says so, and sends nothing, when the photos cannot be made small enough", async () => {
    fit.mockResolvedValue({ ok: false, message: "사진 용량이 너무 큽니다. 사진 수를 줄여 다시 시도해 주세요." });
    await openS03P([photo("a.jpg")]);
    await sendWithConsent();
    expect(identify).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("사진 수를 줄여");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("shows why it failed, keeps the photos, and asks for consent again", async () => {
    identify.mockResolvedValue({ kind: "quota" });
    await openS03P([photo("a.jpg")]);
    await sendWithConsent();
    expect(screen.getByRole("alert").textContent).toBe(IDENTIFY_MESSAGES.quota);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByText("준비됨")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "이름 검색으로 돌아가기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "직접 입력하기" })).toBeTruthy();
  });

  it("shows the server's reason when a photo is refused", async () => {
    identify.mockResolvedValue({ kind: "invalid", message: "사진 2: 사진을 읽지 못했습니다. 다른 사진을 골라 주세요." });
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    await sendWithConsent();
    expect(screen.getByRole("alert").textContent).toBe("사진 2: 사진을 읽지 못했습니다. 다른 사진을 골라 주세요.");
  });

  it("takes at most 5 photos and says so", async () => {
    await openS03P(Array.from({ length: 7 }, (_, i) => photo(`${i}.jpg`)));
    expect(screen.getByText(/5장까지 고를 수 있습니다/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "+ 사진 추가" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("[삭제] takes the photo off the list at once; there is nothing on the server to delete", async () => {
    await openS03P([photo("a.jpg"), photo("b.jpg")]);
    fireEvent.click(screen.getByRole("button", { name: "사진 1 삭제" }));
    expect(screen.getAllByText("준비됨")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "+ 사진 추가" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("starts empty after a reload, with [사진 추가]", () => {
    handOverPhotos([]);
    render(<PhotoListScreen />);
    expect(screen.getByText("아직 고른 사진이 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ 사진 추가" }));
    expect(screen.getByRole("dialog", { name: "사진 선택" })).toBeTruthy();
  });

  it("shows the same photos again when coming back from S04-A", async () => {
    identify.mockResolvedValue({ kind: "ok", sessionId: "50000000-0000-0000-0000-000000000001" });
    const first = await openS03P([photo("a.jpg"), photo("b.jpg")]);
    await sendWithConsent();
    first.unmount();
    await settle();
    expect(keptPhotos()).toHaveLength(2);

    render(<PhotoListScreen />);
    expect(screen.getAllByText("준비됨")).toHaveLength(2);
    // Consent is asked again for the next request.
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });

  it("forgets the photos when the screen is left without identifying", async () => {
    keepPhotos([{ file: photo("a.jpg"), blob: new Blob(["a"]) }]);
    const view = render(<PhotoListScreen />);
    expect(screen.getAllByText("준비됨")).toHaveLength(1);
    view.unmount();
    await settle();
    expect(keptPhotos()).toEqual([]);
    expect(pendingPhotos()).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
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

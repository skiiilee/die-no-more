// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FreshWhenShownAgain } from "@/ui/shell/FreshWhenShownAgain";
import { clearKeptPhotos, handOverPhotos } from "./pending-photos";
import { PhotoListScreen } from "./PhotoListScreen";

const { push, identify } = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>(), identify: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/plants/new/photos" }));
vi.mock("./photo-prep", () => ({
  prepareForUpload: vi.fn(async (file: File) => ({ ok: true, blob: new Blob([`small ${file.name}`], { type: "image/jpeg" }) })),
  fitRequest: vi.fn(async (photos: { blob: Blob }[]) => ({ ok: true, blobs: photos.map((p) => p.blob) })),
}));
vi.mock("./photo-client", () => ({ requestIdentification: identify }));

const photo = (name: string) => new File(["x"], name, { type: "image/jpeg" });
/** Lets the delayed clean-ups (setTimeout 0) run. */
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  identify.mockResolvedValue({ kind: "ok", sessionId: "50000000-0000-0000-0000-000000000001" });
});
afterEach(() => {
  cleanup();
  clearKeptPhotos();
  vi.clearAllMocks();
});

/** The S03-P page as Next keeps it with Cache Components: inside an <Activity>. */
const page = (mode: "visible" | "hidden") => (
  <Activity mode={mode}>
    <FreshWhenShownAgain>
      <PhotoListScreen />
    </FreshWhenShownAgain>
  </Activity>
);

describe("S03-P shown again after S04-A [뒤로] (device test 2026-11-19)", () => {
  it("comes back ready for another try: photos kept, not 찾는 중…, consent asked again", async () => {
    handOverPhotos([photo("a.jpg"), photo("b.jpg")]);
    const view = render(page("visible"));
    await waitFor(() => expect(screen.getAllByText("준비됨")).toHaveLength(2));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "사진으로 식물 찾기" })));
    expect(push).toHaveBeenCalledWith("/plants/new/identify/50000000-0000-0000-0000-000000000001");
    expect(screen.getByRole("button", { name: "찾는 중…" })).toBeTruthy();

    // Next hides S03-P while S04-A is shown, then shows it again on [뒤로].
    await act(async () => view.rerender(page("hidden")));
    await settle();
    await act(async () => view.rerender(page("visible")));

    expect(screen.queryByRole("button", { name: "찾는 중…" })).toBeNull();
    const find = screen.getByRole("button", { name: "사진으로 식물 찾기" }) as HTMLButtonElement;
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(find.disabled).toBe(true);
    expect(screen.getAllByText("준비됨")).toHaveLength(2);
    expect((screen.getByRole("button", { name: "+ 사진 추가" }) as HTMLButtonElement).disabled).toBe(false);
    for (const remove of screen.getAllByRole("button", { name: /삭제/ })) {
      expect((remove as HTMLButtonElement).disabled).toBe(false);
    }

    fireEvent.click(screen.getByRole("checkbox"));
    expect(find.disabled).toBe(false);
  });

  it("is not restarted by React's development double effect, so the picked photos stay", async () => {
    handOverPhotos([photo("a.jpg")]);
    render(<StrictMode>{page("visible")}</StrictMode>);
    await settle();
    await waitFor(() => expect(screen.getAllByText("준비됨")).toHaveLength(1));
  });
});

// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { Activity } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PotPhotoFormState, PotView, RegisterFormState } from "@/types/plant";
import { PlantList } from "./PlantList";
import { PotPhotoPanel } from "./PotPhotoPanel";
import { RegisterPlantForm } from "./RegisterPlantForm";
import { usePickedPhoto } from "./use-picked-photo";

const { register, addPhoto, deletePhoto, prepare } = vi.hoisted(() => ({
  register: vi.fn<(prev: RegisterFormState, formData: FormData) => Promise<RegisterFormState>>(),
  addPhoto: vi.fn<(prev: PotPhotoFormState, formData: FormData) => Promise<PotPhotoFormState>>(),
  deletePhoto: vi.fn<(prev: PotPhotoFormState, formData: FormData) => Promise<PotPhotoFormState>>(),
  prepare: vi.fn(),
}));

vi.mock("@/runtime/plant-actions", () => ({
  registerPotAction: register,
  addPotPhotoAction: addPhoto,
  deletePotPhotoAction: deletePhoto,
}));
vi.mock("./photo-prep", () => ({ prepareForUpload: prepare }));

const PREPARED = new Blob(["resized"], { type: "image/jpeg" });
const POT_ID = "20000000-0000-0000-0000-00000000000a";
const PHOTO_ID = "30000000-0000-0000-0000-00000000000b";

beforeEach(() => {
  register.mockReset().mockImplementation(async (prev) => prev);
  addPhoto.mockReset().mockImplementation(async () => ({ status: "idle" }));
  deletePhoto.mockReset().mockImplementation(async () => ({ status: "idle" }));
  prepare.mockReset().mockImplementation(async () => ({ ok: true, blob: PREPARED }));
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

/** Opens 사진 선택 and picks one file from the gallery. */
async function pickFromGallery(button: string) {
  fireEvent.click(screen.getByRole("button", { name: button }));
  const original = new File(["original 12MB"], "IMG_0001.HEIC", { type: "image/heic" });
  await act(async () => {
    fireEvent.change(screen.getByTestId("gallery-input"), { target: { files: [original] } });
  });
  return original;
}

function renderS05() {
  return render(
    <RegisterPlantForm
      identity={{ kind: "manual", name: "고무나무" }}
      plantName="고무나무"
      reminders={{ water: false, fertilizer: false }}
      backHref="/plants/new/manual"
    />,
  );
}

function chooseAll() {
  const pick = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  pick("마지막으로 물 준 시기", "about_1_week");
  pick("빛이 얼마나 들어오나요?", "medium");
  pick("마지막 분갈이 시기", "unknown");
  pick("화분의 재질", "plastic");
}

describe("S05 화분 사진 (선택)", () => {
  it("previews the picked photo and sends the browser-resized copy with [식물 추가하기]", async () => {
    renderS05();
    expect(screen.getByRole("img", { name: "사진 없음" })).toBeTruthy();
    const original = await pickFromGallery("사진 고르기");
    expect(prepare).toHaveBeenCalledWith(original);
    expect(screen.getByAltText("고른 화분 사진 미리보기").getAttribute("src")).toBe("blob:preview");

    chooseAll();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "식물 추가하기" }));
    });
    await waitFor(() => expect(register).toHaveBeenCalled());
    const sent = register.mock.calls[0][1].get("photo");
    expect(sent).toBeInstanceOf(Blob);
    expect(await (sent as Blob).text()).toBe("resized");
  });

  it("sends no photo when none was picked or it was taken out again", async () => {
    renderS05();
    await pickFromGallery("사진 고르기");
    fireEvent.click(screen.getByRole("button", { name: "사진 빼기" }));
    expect(screen.getByRole("img", { name: "사진 없음" })).toBeTruthy();
    chooseAll();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "식물 추가하기" }));
    });
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][1].get("photo")).toBeNull();
  });

  it("shows why a photo cannot be used, and keeps the form usable without it", async () => {
    prepare.mockResolvedValueOnce({ ok: false, message: "이 사진을 열지 못했습니다. JPEG로 다시 선택해 주세요." });
    renderS05();
    await pickFromGallery("사진 고르기");
    expect(screen.getByRole("alert").textContent).toContain("이 사진을 열지 못했습니다");
    expect((screen.getByRole("button", { name: "식물 추가하기" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sends no photo when a new pick fails after an earlier one (PR #20 review P2)", async () => {
    renderS05();
    await pickFromGallery("사진 고르기");
    expect(screen.getByAltText("고른 화분 사진 미리보기")).toBeTruthy();

    prepare.mockResolvedValueOnce({ ok: false, message: "이 사진을 열지 못했습니다. JPEG로 다시 선택해 주세요." });
    await pickFromGallery("다른 사진 고르기");
    expect(screen.queryByAltText("고른 화분 사진 미리보기")).toBeNull();
    expect(screen.getByRole("img", { name: "사진 없음" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("이 사진을 열지 못했습니다");

    chooseAll();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "식물 추가하기" }));
    });
    await waitFor(() => expect(register).toHaveBeenCalled());
    expect(register.mock.calls[0][1].get("photo")).toBeNull();
  });

  it("keeps the latest pick when an earlier, slower preparation finishes last", async () => {
    // The screen disables picking while a photo is prepared; the hook guards anyway.
    let finishFirst: (value: unknown) => void = () => {};
    prepare
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockImplementationOnce(async () => ({ ok: true, blob: new Blob(["second"], { type: "image/jpeg" }) }));
    const { result } = renderHook(() => usePickedPhoto());
    let first: Promise<Blob | null> = Promise.resolve(null);
    await act(async () => {
      first = result.current.pick(new File(["a"], "a.jpg", { type: "image/jpeg" }));
      await result.current.pick(new File(["b"], "b.jpg", { type: "image/jpeg" }));
    });
    await act(async () => {
      finishFirst({ ok: true, blob: new Blob(["first"], { type: "image/jpeg" }) });
      expect(await first).toBeNull();
    });
    expect(await result.current.photo?.text()).toBe("second");
  });

  it("forgets a preparation that finishes after [사진 빼기]", async () => {
    let finish: (value: unknown) => void = () => {};
    prepare.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => usePickedPhoto());
    act(() => {
      void result.current.pick(new File(["a"], "a.jpg", { type: "image/jpeg" }));
    });
    act(() => result.current.clear());
    await act(async () => {
      finish({ ok: true, blob: PREPARED });
    });
    expect(result.current.photo).toBeNull();
    expect(result.current.preparing).toBe(false);
  });

  it("shows the server's photo message, and drops it once another photo is picked", async () => {
    register.mockImplementationOnce(async () => ({
      status: "invalid",
      errors: { photo: "사진을 읽지 못했습니다. 다른 사진을 골라 주세요." },
      values: {},
    }));
    renderS05();
    await pickFromGallery("사진 고르기");
    chooseAll();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "식물 추가하기" }));
    });
    expect(await screen.findByText("사진을 읽지 못했습니다. 다른 사진을 골라 주세요.")).toBeTruthy();
    await pickFromGallery("다른 사진 고르기");
    expect(screen.queryByText("사진을 읽지 못했습니다. 다른 사진을 골라 주세요.")).toBeNull();
  });
});

describe("S06 화분 사진", () => {
  const PHOTO = { id: PHOTO_ID, url: "https://signed.example/p.jpg", createdAt: "2026-11-19T00:00:00Z" };

  it("shows '사진 없음' and only [사진 추가] when the pot has no photo", () => {
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={null} />);
    expect(screen.getByRole("img", { name: "사진 없음" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "사진 삭제" })).toBeNull();
  });

  it("adds the resized photo to this pot as soon as it is picked", async () => {
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={null} />);
    await pickFromGallery("사진 추가");
    await waitFor(() => expect(addPhoto).toHaveBeenCalled());
    const form = addPhoto.mock.calls[0][1];
    expect(form.get("potId")).toBe(POT_ID);
    expect(await (form.get("photo") as Blob).text()).toBe("resized");
  });

  it("shows the server's answer when the photo could not be saved", async () => {
    addPhoto.mockImplementationOnce(async () => ({ status: "failed", message: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." }));
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={null} />);
    await pickFromGallery("사진 추가");
    expect(await screen.findByText("사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.")).toBeTruthy();
  });

  it("asks before deleting, does nothing on [취소], and deletes the shown photo on [삭제]", async () => {
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={PHOTO} />);
    expect(screen.getByAltText("고무나무 사진").getAttribute("src")).toBe(PHOTO.url);

    fireEvent.click(screen.getByRole("button", { name: "사진 삭제" }));
    expect(screen.getByRole("alertdialog", { name: "이 사진을 삭제할까요?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(deletePhoto).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "사진 삭제" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    });
    await waitFor(() => expect(deletePhoto).toHaveBeenCalled());
    const form = deletePhoto.mock.calls[0][1];
    expect([form.get("potId"), form.get("photoId")]).toEqual([POT_ID, PHOTO_ID]);
  });

  it("keeps [사진 추가] and [사진 삭제] usable after a photo is added (real-device bug)", async () => {
    addPhoto.mockImplementationOnce(async () => ({ status: "done" }));
    const { rerender } = render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={null} />);
    await pickFromGallery("사진 추가");
    await waitFor(() => expect(addPhoto).toHaveBeenCalled());
    rerender(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={PHOTO} />);
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "사진 삭제" }) as HTMLButtonElement).disabled).toBe(false),
    );
    expect((screen.getByRole("button", { name: "사진 추가" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the buttons usable when S06 is hidden and shown again ([뒤로] with Cache Components)", async () => {
    const panel = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <PotPhotoPanel potId={POT_ID} name="고무나무" photo={PHOTO} />
      </Activity>
    );
    const { rerender } = render(panel("visible"));
    fireEvent.click(screen.getByRole("button", { name: "사진 삭제" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    });
    await waitFor(() => expect(deletePhoto).toHaveBeenCalled());
    await act(async () => rerender(panel("hidden")));
    await act(async () => rerender(panel("visible")));
    expect((screen.getByRole("button", { name: "사진 삭제" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "사진 추가" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("frees the buttons and says so when the request itself fails", async () => {
    deletePhoto.mockImplementationOnce(async () => {
      throw new Error("network");
    });
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={PHOTO} />);
    fireEvent.click(screen.getByRole("button", { name: "사진 삭제" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    });
    expect(await screen.findByText("사진을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "사진 삭제" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("drops an earlier [사진 추가] error once a delete is tried", async () => {
    addPhoto.mockImplementationOnce(async () => ({ status: "failed", message: "사진을 저장하지 못했습니다." }));
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={PHOTO} />);
    await pickFromGallery("사진 추가");
    expect(await screen.findByText("사진을 저장하지 못했습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "사진 삭제" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    });
    await waitFor(() => expect(deletePhoto).toHaveBeenCalled());
    expect(screen.queryByText("사진을 저장하지 못했습니다.")).toBeNull();
  });

  it("says when the photo link could not be made instead of showing a broken image", () => {
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={{ ...PHOTO, url: null }} />);
    expect(screen.getByRole("img", { name: "사진을 불러오지 못함" })).toBeTruthy();
  });

  it("tells the user when S05 saved the pot but not its photo", () => {
    render(<PotPhotoPanel potId={POT_ID} name="고무나무" photo={null} registrationPhotoFailed />);
    expect(screen.getByRole("alert").textContent).toContain("사진은 저장하지 못했습니다");
  });
});

describe("S11 card photo", () => {
  const pot = (id: string, photo: PotView["photo"]) =>
    ({ id, nickname: id, userEnteredName: null, species: null, environment: "indoor", location: null, photo }) as PotView;

  it("shows the newest photo on the card, and '사진 없음' when there is none", () => {
    render(<PlantList pots={[pot("a", { id: "p", url: "https://signed.example/a.jpg", createdAt: "x" }), pot("b", null)]} />);
    const links = screen.getAllByRole("link").filter((link) => link.getAttribute("href")?.startsWith("/plants/"));
    expect(links[1].querySelector("img")?.getAttribute("src")).toBe("https://signed.example/a.jpg");
    expect(links[2].textContent).toContain("사진 없음");
  });
});

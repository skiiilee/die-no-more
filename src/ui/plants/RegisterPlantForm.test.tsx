// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegisterFormState } from "@/types/plant";
import { NavList } from "@/ui/shell/MainNav";
import { RegisterPlantForm } from "./RegisterPlantForm";

const { navigate, action } = vi.hoisted(() => ({
  /** Records where a link would have gone. */
  navigate: vi.fn<(href: string) => void>(),
  action: vi.fn<(prev: RegisterFormState, formData: FormData) => Promise<RegisterFormState>>(),
}));

// Plain anchor standing in for next/link: navigates unless a click handler cancels.
vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...rest }: ComponentProps<"a"> & { href: string }) => (
    <a
      href={href}
      {...rest}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) navigate(href);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/runtime/plant-actions", () => ({ registerPotAction: action }));

const NO_REMINDERS = { water: false, fertilizer: false };

function renderS05() {
  return render(
    <>
      <NavList />
      <RegisterPlantForm
        identity={{ kind: "manual", name: "고무나무" }}
        plantName="고무나무"
        reminders={NO_REMINDERS}
        backHref="/plants/new/manual"
      />
    </>,
  );
}

function typeNickname(value: string) {
  fireEvent.change(screen.getByLabelText("화분 별명 (선택)"), { target: { value } });
}

function back() {
  fireEvent.click(screen.getByRole("link", { name: "뒤로" }));
}

/** True when the page asked the browser to warn before unload. */
function unloadIsBlocked(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

let confirm: ReturnType<typeof vi.fn<(message?: string) => boolean>>;

beforeEach(() => {
  navigate.mockReset();
  action.mockReset();
  confirm = vi.fn<(message?: string) => boolean>(() => false);
  window.confirm = confirm;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("S05 leave warning (PR #13 review, item 2)", () => {
  it("leaves without asking when nothing was typed", () => {
    renderS05();
    back();
    expect(confirm).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/plants/new/manual");
    expect(unloadIsBlocked()).toBe(false);
  });

  it("asks before [뒤로] drops typed input; cancel keeps the screen and the input", () => {
    confirm.mockReturnValue(false);
    renderS05();
    typeNickname("거실 고무");
    back();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("저장하지 않은 내용"));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "내 화분 등록" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("화분 별명 (선택)").value).toBe("거실 고무");
  });

  it("leaves when the user confirms", () => {
    confirm.mockReturnValue(true);
    renderS05();
    typeNickname("거실 고무");
    back();
    expect(navigate).toHaveBeenCalledWith("/plants/new/manual");
  });

  it("asks before a main menu link drops typed input", () => {
    confirm.mockReturnValue(false);
    renderS05();
    typeNickname("거실 고무");
    fireEvent.click(screen.getByRole("link", { name: "오늘" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not interfere with opening a link in a new tab", () => {
    renderS05();
    typeNickname("거실 고무");
    fireEvent.click(screen.getByRole("link", { name: "오늘" }), { ctrlKey: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps the browser's reload and close warning while input is unsaved", () => {
    renderS05();
    typeNickname("거실 고무");
    expect(unloadIsBlocked()).toBe(true);
  });

  it("does not warn while a save is running and redirecting to S06", async () => {
    // The real action redirects; here the save stays in flight until the end.
    let finish: (state: RegisterFormState) => void = () => {};
    action.mockReturnValue(new Promise<RegisterFormState>((resolve) => (finish = resolve)));
    renderS05();
    typeNickname("거실 고무");
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "식물 추가하기" }).closest("form")!);
    });
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(unloadIsBlocked()).toBe(false);
    back();
    expect(confirm).not.toHaveBeenCalled();
    // Settle the action: React keeps later actions waiting while one is pending.
    await act(async () => finish({ status: "idle", errors: {}, values: {} }));
  });

  it("warns again after a failed save, with the input still on screen", async () => {
    confirm.mockReturnValue(false);
    action.mockImplementation(async (_prev, formData) => ({
      status: "save_failed",
      errors: {},
      values: { nickname: String(formData.get("nickname")), environment: "indoor" },
    }));
    renderS05();
    typeNickname("거실 고무");
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "식물 추가하기" }).closest("form")!);
    });
    await screen.findByText(/저장하지 못했습니다/);
    expect(screen.getByLabelText<HTMLInputElement>("화분 별명 (선택)").value).toBe("거실 고무");
    back();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});

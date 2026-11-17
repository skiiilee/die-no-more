// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkPending } from "./LinkPending";
import { SEARCHING_MESSAGE, searchHref, SpeciesSearchForm } from "./SpeciesSearchForm";

const { push, transition, link } = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  transition: { pending: false },
  link: { pending: false },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Stand in for React's transition and Next's link status, so the "still loading" state can be held open.
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return { ...react, useTransition: () => [transition.pending, (run: () => void) => run()] };
});
vi.mock("next/link", async (original) => ({
  ...(await original<typeof import("next/link")>()),
  useLinkStatus: () => ({ pending: link.pending }),
}));

afterEach(() => {
  cleanup();
  transition.pending = false;
  link.pending = false;
  vi.clearAllMocks();
});

describe("name search loading (S03, S04-A)", () => {
  it("opens S04-A for the typed query", () => {
    render(<SpeciesSearchForm />);
    fireEvent.change(screen.getByRole("searchbox", { name: "식물 이름 검색" }), { target: { value: "몬스테라 델리시오사" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith(searchHref("몬스테라 델리시오사"));
    expect(searchHref("a&b")).toBe("/plants/new/search?q=a%26b");
  });

  it("shows a spinner, '검색 중…' and a status line while the results load", () => {
    transition.pending = true;
    render(<SpeciesSearchForm query="ficus" />);
    const button = screen.getByRole("button", { name: /검색 중/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId("spinner")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(SEARCHING_MESSAGE);
    expect(screen.getByRole("search").getAttribute("aria-busy")).toBe("true");
  });

  it("shows the plain [검색] button and no status line otherwise", () => {
    render(<SpeciesSearchForm />);
    expect(screen.getByRole("button", { name: "검색" })).toBeTruthy();
    expect(screen.queryByTestId("spinner")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("[보기] loading (S04-A → S04-B)", () => {
  it("shows a spinner and says it is loading while S04-B loads", () => {
    link.pending = true;
    render(<LinkPending />);
    expect(screen.getByTestId("spinner")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("불러오는 중");
  });

  it("shows nothing when no navigation is pending", () => {
    const { container } = render(<LinkPending />);
    expect(container.textContent).toBe("");
  });
});

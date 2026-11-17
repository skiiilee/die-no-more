// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SpeciesLoading from "@/app/(main)/plants/new/species/[id]/loading";
import { LoadingScreen } from "./LoadingScreen";

afterEach(cleanup);

describe("LoadingScreen", () => {
  it("shows a large spinner and the message as a status", () => {
    render(<LoadingScreen message="불러오는 중입니다." />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("불러오는 중입니다.");
    expect(status.querySelector("[data-testid=spinner-large]")).toBeTruthy();
  });

  it("is what S04-B shows right after [보기] while the details load", () => {
    render(<SpeciesLoading />);
    expect(screen.getByRole("status").textContent).toBe("식물 정보를 불러오는 중입니다. 몇 초 걸릴 수 있습니다.");
    expect(screen.getByTestId("spinner-large")).toBeTruthy();
  });
});

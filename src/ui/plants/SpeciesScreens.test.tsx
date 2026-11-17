// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { QUOTA_MESSAGE, SpeciesResults } from "./SpeciesResults";
import { SpeciesPreviewScreen } from "./SpeciesPreviewScreen";

afterEach(cleanup);

const ID = "10000000-0000-0000-0000-000000000001";

describe("S04-A 검색 결과", () => {
  it("shows Korean and scientific names, the provider photo or '사진 없음', and opens S04-B with the query", () => {
    render(
      <SpeciesResults
        outcome={{
          kind: "results",
          query: "ficus",
          from: "providers",
          partial: false,
          dropped: false,
          candidates: [
            { id: ID, koreanName: "고무나무", scientificName: "Ficus elastica", imageUrl: "https://example.test/f.jpg", imageCredit: null },
            { id: "x2", koreanName: null, scientificName: "Ficus lyrata", imageUrl: null, imageCredit: null },
          ],
        }}
      />,
    );
    expect(screen.getByText("고무나무")).toBeTruthy();
    expect(screen.getByAltText("고무나무 참고 사진").getAttribute("src")).toBe("https://example.test/f.jpg");
    expect(screen.getByRole("img", { name: "사진 없음" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "고무나무 보기" }).getAttribute("href")).toBe(`/plants/new/species/${ID}?q=ficus`);
    expect(screen.getByRole("link", { name: "직접 입력하기" }).getAttribute("href")).toBe("/plants/new/manual");
    expect(screen.getByRole("link", { name: "다시 검색하기" }).getAttribute("href")).toBe("/plants/new");
  });

  it("says when some results could not be stored (PR #15 review, item 3)", () => {
    render(
      <SpeciesResults
        outcome={{
          kind: "results",
          query: "ficus",
          from: "providers",
          partial: false,
          dropped: true,
          candidates: [{ id: ID, koreanName: null, scientificName: "Ficus elastica", imageUrl: null, imageCredit: null }],
        }}
      />,
    );
    expect(screen.getByText("일부 결과를 저장하지 못해 목록에서 뺐습니다.")).toBeTruthy();
  });

  it("uses the fixed quota wording from 03 §3", () => {
    render(<SpeciesResults outcome={{ kind: "quota", query: "ficus" }} />);
    expect(screen.getByRole("alert").textContent).toBe(QUOTA_MESSAGE);
    expect(QUOTA_MESSAGE).toBe("오늘은 식물 검색을 더 이상 이용할 수 없습니다. 내일 다시 시도해 주세요.");
  });

  it("explains that Korean search covers few plants yet and keeps manual entry", () => {
    render(<SpeciesResults outcome={{ kind: "empty", query: "몬스테라", korean: true, partial: false }} />);
    expect(screen.getByText(/한국어 이름은 아직 일부 식물만/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "직접 입력하기" })).toBeTruthy();
  });
});

describe("S04-B 식물 정보 확인", () => {
  it("shows provider care values and '정보 없음' for the rest, then goes to S05 for this species", () => {
    render(
      <SpeciesPreviewScreen
        back={{ kind: "search", query: "ficus" }}
        preview={{
          id: ID,
          koreanName: "고무나무",
          scientificName: "Ficus elastica",
          imageUrl: null,
          imageCredit: null,
          care: {
            status: "available",
            facts: {
              careLevel: "보통",
              light: null,
              watering: "보통",
              wateringInterval: "7~10일",
              description: "The Indian Rubberplant is a houseplant.",
            },
          },
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "고무나무" })).toBeTruthy();
    expect(screen.getByText("Ficus elastica")).toBeTruthy();
    expect(screen.getByText("7~10일")).toBeTruthy();
    expect(screen.getByText("The Indian Rubberplant is a houseplant.")).toBeTruthy();
    expect(screen.getAllByText("정보 없음")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "이 식물 추가하기" }).getAttribute("href")).toBe(
      `/plants/new/register?mode=species&species=${ID}`,
    );
    expect(screen.getByRole("link", { name: "뒤로" }).getAttribute("href")).toBe("/plants/new/search?q=ficus");
  });

  it("says when the species has no care data, without inventing any", () => {
    render(
      <SpeciesPreviewScreen
        back={null}
        preview={{
          id: ID,
          koreanName: null,
          scientificName: "Monstera deliciosa",
          imageUrl: null,
          imageCredit: null,
          care: { status: "none" },
        }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Monstera deliciosa" })).toBeTruthy();
    expect(screen.getByText(/이 식물의 관리 정보가 없습니다/)).toBeTruthy();
    expect(screen.getAllByText("정보 없음")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "뒤로" }).getAttribute("href")).toBe("/plants/new");
  });

  it("returns to the photo results it came from and credits the Pl@ntNet photo", () => {
    render(
      <SpeciesPreviewScreen
        back={{ kind: "identify", sessionId: "30000000-0000-0000-0000-000000000003" }}
        preview={{
          id: ID,
          koreanName: null,
          scientificName: "Monstera deliciosa",
          imageUrl: "https://bs.plantnet.org/image/m/abc",
          imageCredit: "Soynano Gallego / Pl@ntNet, cc-by-sa",
          care: { status: "none" },
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "뒤로" }).getAttribute("href")).toBe(
      "/plants/new/identify/30000000-0000-0000-0000-000000000003",
    );
    expect(screen.getByText("사진: Soynano Gallego / Pl@ntNet, cc-by-sa")).toBeTruthy();
  });
});

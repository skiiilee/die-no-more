/** Main navigation tabs (ADR-0003 D15): MO bottom tabs, PC left menu. */
export type MainTab = {
  /** Screen ID from docs/stage2/01-information-architecture.md */
  screen: "S02" | "S11" | "S07" | "S12";
  label: string;
  href: string;
};

export const MAIN_TABS: readonly MainTab[] = [
  { screen: "S02", label: "오늘", href: "/today" },
  { screen: "S11", label: "내 식물", href: "/plants" },
  { screen: "S07", label: "건강 점검", href: "/health" },
  { screen: "S12", label: "더보기", href: "/more" },
] as const;

/**
 * Returns the tab that owns a pathname, matching on path segments so that
 * "/plants/123" belongs to "내 식물" but "/plantsfoo" does not.
 */
export function findActiveTab(pathname: string): MainTab | undefined {
  return MAIN_TABS.find(
    (tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  );
}

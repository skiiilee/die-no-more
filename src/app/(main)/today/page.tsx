import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/ui/shell/ScreenPlaceholder";

export const metadata: Metadata = { title: "오늘" };

/** S02 오늘 */
export default function Page() {
  return <ScreenPlaceholder screen="S02" title="오늘" />;
}

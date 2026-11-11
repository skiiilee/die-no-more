import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/ui/shell/ScreenPlaceholder";

export const metadata: Metadata = { title: "내 식물" };

/** S11 내 식물 */
export default function Page() {
  return <ScreenPlaceholder screen="S11" title="내 식물" />;
}

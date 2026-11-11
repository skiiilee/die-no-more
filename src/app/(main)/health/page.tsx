import type { Metadata } from "next";
import { ScreenPlaceholder } from "@/ui/shell/ScreenPlaceholder";

export const metadata: Metadata = { title: "건강 점검" };

/** S07-A 건강 점검 */
export default function Page() {
  return <ScreenPlaceholder screen="S07-A" title="건강 점검" />;
}

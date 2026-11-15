import type { Metadata } from "next";
import { ManualEntryForm } from "@/ui/plants/ManualEntryForm";

export const metadata: Metadata = { title: "직접 입력 / 종 미상" };

/** S05-M 직접 입력 / 종 미상 */
export default function Page() {
  return <ManualEntryForm />;
}

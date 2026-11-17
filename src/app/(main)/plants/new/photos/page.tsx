import type { Metadata } from "next";
import { PhotoListScreen } from "@/ui/plants/PhotoListScreen";

export const metadata: Metadata = { title: "업로드한 사진" };

/** S03-P 업로드한 사진. Photos picked in the S03 dialog arrive in memory, not in the URL. */
export default function Page() {
  return <PhotoListScreen />;
}

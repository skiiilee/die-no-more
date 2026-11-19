import type { Metadata } from "next";
import { PhotoListScreen } from "@/ui/plants/PhotoListScreen";
import { FreshWhenShownAgain } from "@/ui/shell/FreshWhenShownAgain";

export const metadata: Metadata = { title: "업로드한 사진" };

/**
 * S03-P 업로드한 사진. Photos picked in the S03 dialog arrive in memory, not in
 * the URL. Coming back from S04-A starts the screen afresh (kept photos, no
 * "찾는 중…", consent asked again) instead of showing the screen as it was left.
 */
export default function Page() {
  return (
    <FreshWhenShownAgain>
      <PhotoListScreen />
    </FreshWhenShownAgain>
  );
}

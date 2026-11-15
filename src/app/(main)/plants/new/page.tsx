import type { Metadata } from "next";
import { AddPlantStart } from "@/ui/plants/AddPlantStart";

export const metadata: Metadata = { title: "식물 추가" };

/** S03 식물 추가 */
export default function Page() {
  return <AddPlantStart />;
}

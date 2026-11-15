"use client";

import { PlantsLoadError } from "@/ui/plants/PlantsLoadError";

/** Load failures on the plants screens: retry instead of "not found". */
export default function PlantsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PlantsLoadError onRetry={retry} />;
}

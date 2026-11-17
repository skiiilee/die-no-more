import { LoadingScreen } from "@/ui/shell/LoadingScreen";

const SPECIES_LOADING_MESSAGE = "식물 정보를 불러오는 중입니다. 몇 초 걸릴 수 있습니다.";

/**
 * S04-B waits for Trefle (Korean name) and Perenual (care data). Shown at
 * once after [보기] on S04-A, until the details are ready.
 */
export default function Loading() {
  return <LoadingScreen message={SPECIES_LOADING_MESSAGE} />;
}

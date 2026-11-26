import { handleHealthSave } from "@/runtime/health-save-api";

/** Upload of up to 5 photos plus one database call; well inside 30 s. */
export const maxDuration = 30;

/**
 * POST /api/health-checks/save: S07-S 이 화분에 결과 저장. Only the signed
 * result, its photos and signed AI texts are stored (ADR-0006 D5).
 */
export async function POST(request: Request) {
  return handleHealthSave(request);
}

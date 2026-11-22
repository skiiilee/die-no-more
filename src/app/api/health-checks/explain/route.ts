import { handleHealthExplain } from "@/runtime/health-api";

/** The AI step has its own 25 s budget (ADR-0006, like ADR-0005 D6). */
export const maxDuration = 30;

/**
 * POST /api/health-checks/explain: the AI explanation of S07-B's possible
 * causes (ADR-0006). Text only; no photo is ever sent here.
 */
export async function POST(request: Request) {
  return handleHealthExplain(request);
}

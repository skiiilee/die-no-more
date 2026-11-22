import { handleHealthJudge } from "@/runtime/health-api";

/** The AI step has its own 25 s budget (ADR-0006). */
export const maxDuration = 30;

/**
 * POST /api/health-checks/ai-judge: when Pl@ntNet found nothing, the photo
 * AI's reading, with this request's own consent to send the photos to the AI
 * (ADR-0006 D6). Photos travel in this request and are not stored.
 */
export async function POST(request: Request) {
  return handleHealthJudge(request);
}

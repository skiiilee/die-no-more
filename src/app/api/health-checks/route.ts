import { handleHealthCheck } from "@/runtime/health-api";

/** Function limit for the 25 s request budget plus the response (ADR-0003 D7). */
export const maxDuration = 30;

/**
 * POST /api/health-checks: S07-A [분석하기] → Pl@ntNet disease identification,
 * with this request's consent (D5). Photos travel in this request and are not stored.
 */
export async function POST(request: Request) {
  return handleHealthCheck(request);
}

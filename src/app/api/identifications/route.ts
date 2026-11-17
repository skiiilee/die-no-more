import { handleIdentify } from "@/runtime/photo-api";

/** Function limit for the 25 s request budget plus the response (ADR-0003 D7). */
export const maxDuration = 30;

/** POST /api/identifications: S03-P [사진으로 식물 찾기] → Pl@ntNet, with this request's consent (D5). */
export async function POST(request: Request) {
  return handleIdentify(request);
}

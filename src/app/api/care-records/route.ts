import { handleCareSave } from "@/runtime/care-api";

/** Upload of up to 5 photos plus one database call; well inside 30 s. */
export const maxDuration = 30;

/** POST /api/care-records: S08 관리 기록 저장. Only what was entered is stored (03 §7). */
export async function POST(request: Request) {
  return handleCareSave(request);
}

import { handleUpload } from "@/runtime/photo-api";

/** POST /api/uploads: one photo for S03-P, checked and re-encoded on the server (ADR-0003 D4, D7). */
export async function POST(request: Request) {
  return handleUpload(request);
}

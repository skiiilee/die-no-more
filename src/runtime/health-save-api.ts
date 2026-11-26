import "server-only";
import { supabaseHealthStore } from "@/repo/health-repo";
import { supabasePlantStore } from "@/repo/plant-repo";
import { supabasePotPhotoStore } from "@/repo/pot-photo-repo";
import { sharpImageProcessor } from "@/service/adapters/image";
import { readHealthInput } from "@/service/health-check";
import { saveHealthCheck, type SignedAi } from "@/service/health-save";
import { readAiAnswer, readHealthToken } from "@/service/health-token";
import { PHOTO_MESSAGES } from "@/service/photo-cleaning";
import type { SaveAnswer } from "@/types/health";
import { json, readForm, tokenSecret } from "./health-api";
import { IDENTIFY_BODY_MAX, isSameOrigin, readBodyWithin, signedIn } from "./photo-api";

const SAVE_STATUS: Record<SaveAnswer["kind"], number> = {
  saved: 201,
  invalid: 400,
  stale: 409,
  not_allowed: 403,
  not_found: 404,
  failed: 500,
};

/**
 * POST /api/health-checks/save (S07-S). Multipart: `token` (the signed
 * result), the same 1–5 `photos`, the S07-A fields with the chosen `potId`,
 * and optionally `explainToken` / `judgeToken` (signed AI texts). Same guards
 * as the other health requests; every query runs as the user (RLS).
 */
export async function handleHealthSave(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ kind: "forbidden" }, 403);
  const user = await signedIn();
  if (!user) return json({ kind: "signed_out" }, 401);

  const tooLarge = () => json({ kind: "invalid", message: PHOTO_MESSAGES.requestTooLarge }, 413);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IDENTIFY_BODY_MAX) return tooLarge();
  const body = await readBodyWithin(request, IDENTIFY_BODY_MAX);
  if (body === "too_large") return tooLarge();
  const form = await readForm(request, body);
  const input = readHealthInput(form.fields);
  if (!input.ok) return json({ kind: "invalid", message: input.message }, 400);

  const secret = tokenSecret();
  const result = secret ? readHealthToken(secret, form.token, user.userId) : null;
  // A field that is present must verify; an absent one means "no AI text".
  const signed = (value: FormDataEntryValue | null): SignedAi => {
    if (value === null || value === "") return null;
    if (!secret || !result) return "invalid";
    return readAiAnswer(secret, value, user.userId, String(form.token)) ?? "invalid";
  };

  const plants = supabasePlantStore(user.client);
  const answer = await saveHealthCheck(
    {
      image: sharpImageProcessor,
      photos: supabasePotPhotoStore(user.client),
      health: supabaseHealthStore(user.client),
      potExists: async (potId) => (await plants.getPot(potId)) !== null,
      newId: () => crypto.randomUUID(),
    },
    {
      result,
      resultToken: String(form.token ?? ""),
      photos: form.photos,
      input: input.input,
      explanation: signed(form.explainToken),
      judgement: signed(form.judgeToken),
    },
  );
  return json(answer, SAVE_STATUS[answer.kind]);
}

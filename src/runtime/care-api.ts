import "server-only";
import { supabaseCareStore } from "@/repo/care-repo";
import { supabasePlantStore } from "@/repo/plant-repo";
import { supabasePotPhotoStore } from "@/repo/pot-photo-repo";
import { sharpImageProcessor } from "@/service/adapters/image";
import { readCareInput, saveCareRecord, type CareFields } from "@/service/care-record";
import { PHOTO_MESSAGES } from "@/service/photo-cleaning";
import type { CareSaveAnswer } from "@/types/care";
import { json } from "./health-api";
import { IDENTIFY_BODY_MAX, isSameOrigin, readBodyWithin, signedIn } from "./photo-api";

const SAVE_STATUS: Record<CareSaveAnswer["kind"], number> = {
  saved: 201,
  invalid: 400,
  not_found: 404,
  failed: 500,
};

const EMPTY_FIELDS: CareFields = {
  potId: null,
  recordedAt: null,
  actions: [],
  waterMl: null,
  actionNotes: {},
  soilState: null,
  observation: null,
  notes: null,
};

async function readCareForm(request: Request, body: Uint8Array<ArrayBuffer>) {
  try {
    const form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const photos: Uint8Array[] = [];
    for (const value of form.getAll("photos")) {
      if (value instanceof Blob) photos.push(new Uint8Array(await value.arrayBuffer()));
    }
    const fields: CareFields = {
      potId: form.get("potId"),
      recordedAt: form.get("recordedAt"),
      actions: form.getAll("actions"),
      waterMl: form.get("waterMl"),
      actionNotes: { fertilize: form.get("fertilizeNotes"), repot: form.get("repotNotes"), prune: form.get("pruneNotes") },
      soilState: form.get("soilState"),
      observation: form.get("observation"),
      notes: form.get("notes"),
    };
    return { key: String(form.get("key") ?? ""), fields, photos };
  } catch {
    return { key: "", fields: EMPTY_FIELDS, photos: [] };
  }
}

/**
 * POST /api/care-records (S08 기록 저장). Multipart: `key` (one per form, for
 * double submits), `potId`, `recordedAt` (Korean time), the ticked `actions`
 * with `waterMl` and the activity notes, `soilState`, `observation`, `notes`
 * and 0–5 `photos`. Same guards as the photo requests: same-origin, signed
 * in, body capped while reading; every query runs as the user (RLS).
 */
export async function handleCareSave(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ kind: "forbidden" }, 403);
  const user = await signedIn();
  if (!user) return json({ kind: "signed_out" }, 401);

  const tooLarge = () => json({ kind: "invalid", message: PHOTO_MESSAGES.requestTooLarge }, 413);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IDENTIFY_BODY_MAX) return tooLarge();
  const body = await readBodyWithin(request, IDENTIFY_BODY_MAX);
  if (body === "too_large") return tooLarge();
  const form = await readCareForm(request, body);
  const input = readCareInput(form.fields, new Date());
  if (!input.ok) return json({ kind: "invalid", message: input.message }, 400);

  const plants = supabasePlantStore(user.client);
  const answer = await saveCareRecord(
    {
      image: sharpImageProcessor,
      photos: supabasePotPhotoStore(user.client),
      care: supabaseCareStore(user.client),
      potExists: async (potId) => (await plants.getPot(potId)) !== null,
      newId: () => crypto.randomUUID(),
    },
    { key: form.key, input: input.input, photos: form.photos },
  );
  return json(answer, SAVE_STATUS[answer.kind]);
}

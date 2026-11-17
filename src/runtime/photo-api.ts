import "server-only";
import { readProviderConfig } from "@/config/providers";
import { supabaseAuthGateway } from "@/repo/auth-repo";
import { supabaseIdentificationStore } from "@/repo/identification-repo";
import { supabasePhotoStore } from "@/repo/photo-repo";
import { supabaseSpeciesStore } from "@/repo/species-repo";
import { supabaseUsageStore } from "@/repo/usage-repo";
import { httpClient, providerClient, REQUEST_BUDGET_MS } from "@/service/adapters/http";
import { sharpImageProcessor } from "@/service/adapters/image";
import { plantnet, plantnetUsage } from "@/service/adapters/plantnet";
import { identifyPhotos } from "@/service/photo-identification";
import { deleteUploadedPhoto, UPLOAD_MESSAGES, uploadPhoto } from "@/service/photo-upload";
import { utcDayStart, usageGate } from "@/service/provider-usage";
import { PHOTO_RULES, type IdentifyAnswer, type UploadAnswer } from "@/types/photo";
import { requestSupabase } from "./request-supabase";

/**
 * Route handlers for S03-P (ADR-0003 D7): POST /api/uploads,
 * DELETE /api/uploads/{id}, POST /api/identifications. Each one checks the
 * session itself (the proxy check is only optimistic) and refuses requests
 * from other sites. Every query runs as the signed-in user (RLS). Answers are
 * JSON with a `kind`; no database or provider detail is returned.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Room for the multipart envelope around a 3 MB photo. */
const UPLOAD_BODY_MAX = PHOTO_RULES.maxUploadBytes + 64 * 1024;

type SignedIn = { client: NonNullable<Awaited<ReturnType<typeof requestSupabase>>>["client"]; userId: string };

async function signedIn(): Promise<SignedIn | null> {
  const supabase = await requestSupabase();
  if (!supabase) return null;
  const userId = await supabaseAuthGateway(supabase.client).getUserId();
  return userId ? { client: supabase.client, userId } : null;
}

/**
 * Cookies alone do not prove the request came from this app. Browsers send
 * Origin on POST and DELETE; when it is present it must be this site.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const refused = () => json({ kind: "forbidden" }, 403);
const signedOut = () => json({ kind: "signed_out" }, 401);

const UPLOAD_STATUS: Record<UploadAnswer["kind"], number> = { ok: 201, invalid: 400, failed: 500 };

export async function handleUpload(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return refused();
  const user = await signedIn();
  if (!user) return signedOut();

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > UPLOAD_BODY_MAX) return json({ kind: "invalid", message: UPLOAD_MESSAGES.tooLarge }, 413);

  let bytes: Uint8Array | null = null;
  try {
    const file = (await request.formData()).get("photo");
    if (file instanceof Blob) bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    bytes = null;
  }
  const answer = await uploadPhoto({ photos: supabasePhotoStore(user.client, user.userId), image: sharpImageProcessor }, bytes);
  return json(answer, UPLOAD_STATUS[answer.kind]);
}

export async function handleDeleteUpload(request: Request, id: string): Promise<Response> {
  if (!isSameOrigin(request)) return refused();
  const user = await signedIn();
  if (!user) return signedOut();
  if (!UUID.test(id)) return json({ kind: "not_found" }, 404);
  const outcome = await deleteUploadedPhoto(supabasePhotoStore(user.client, user.userId), id);
  return json({ kind: outcome }, outcome === "deleted" ? 200 : outcome === "not_found" ? 404 : 500);
}

const IDENTIFY_STATUS: Record<IdentifyAnswer["kind"], number> = {
  ok: 201,
  invalid: 400,
  consent_required: 400,
  photos_missing: 409,
  quota: 429,
  rejected: 422,
  unavailable: 503,
  failed: 500,
};

export async function handleIdentify(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return refused();
  const user = await signedIn();
  if (!user) return signedOut();

  let input: { photoIds?: unknown; consent?: unknown } = {};
  try {
    input = ((await request.json()) as typeof input) ?? {};
  } catch {
    input = {};
  }

  // After the cookie read above, so the deadline is per request.
  const http = httpClient({ deadline: Date.now() + REQUEST_BUDGET_MS });
  const config = readProviderConfig().plantnet;
  const usage = supabaseUsageStore(user.client);
  const adapter = config
    ? plantnet(
        providerClient(
          http,
          usageGate({
            usage,
            provider: "plantnet",
            dailyLimit: config.dailyLimit,
            classify: (result) => plantnetUsage(result),
            dayStart: utcDayStart,
          }),
        ),
        config.key,
      )
    : null;

  const answer = await identifyPhotos(
    {
      photos: supabasePhotoStore(user.client, user.userId),
      sessions: supabaseIdentificationStore(user.client),
      species: supabaseSpeciesStore(user.client),
      plantnet: adapter,
    },
    { photoIds: input.photoIds, consent: input.consent },
  );
  return json(answer, IDENTIFY_STATUS[answer.kind]);
}

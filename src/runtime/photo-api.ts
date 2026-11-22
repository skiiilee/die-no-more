import "server-only";
import { readProviderConfig } from "@/config/providers";
import { supabaseAuthGateway } from "@/repo/auth-repo";
import { supabaseIdentificationStore } from "@/repo/identification-repo";
import { supabaseSpeciesStore } from "@/repo/species-repo";
import { supabaseUsageStore } from "@/repo/usage-repo";
import { httpClient, providerClient, REQUEST_BUDGET_MS } from "@/service/adapters/http";
import { sharpImageProcessor } from "@/service/adapters/image";
import { plantnet, plantnetUsage } from "@/service/adapters/plantnet";
import { PHOTO_MESSAGES } from "@/service/photo-cleaning";
import { identifyPhotos } from "@/service/photo-identification";
import { utcDayStart, usageGate } from "@/service/provider-usage";
import { PHOTO_RULES, type IdentifyAnswer } from "@/types/photo";
import { requestSupabase } from "./request-supabase";

/**
 * POST /api/identifications for S03-P (ADR-0003 D5–D7). The request is
 * multipart: `consent` ("true" for this request only) and 1–5 `photos`. The
 * photos are checked, re-encoded and sent to Pl@ntNet; they are never stored
 * (D6, changed 2026-11-18). The handler checks the session itself (the proxy
 * check is only optimistic) and refuses requests from other sites. Every
 * query runs as the signed-in user (RLS). Answers are JSON with a `kind`; no
 * database or provider detail is returned.
 */

/** Room for the multipart envelope around the photos. Stays under Vercel's 4.5 MB. */
export const IDENTIFY_BODY_MAX = PHOTO_RULES.maxRequestBytes + 64 * 1024;

/** The signed-in user and their Supabase client, or null. */
export async function signedIn() {
  const supabase = await requestSupabase();
  if (!supabase) return null;
  const userId = await supabaseAuthGateway(supabase.client).getUserId();
  return userId ? { client: supabase.client, userId } : null;
}

/**
 * Cookies alone do not prove the request came from this app. Browsers send
 * Origin on POST; when it is present it must be this site.
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

/**
 * The request body, read chunk by chunk and abandoned as soon as it passes
 * `max` bytes, so a large body never sits in memory whatever Content-Length
 * says. A body that cannot be read counts as empty.
 */
export async function readBodyWithin(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | "too_large"> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => undefined);
        return "too_large";
      }
      chunks.push(value);
    }
  } catch {
    return new Uint8Array(0);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** The consent flag and photo bytes of a multipart request; nothing for any other body. */
async function readIdentifyForm(request: Request, body: Uint8Array<ArrayBuffer>) {
  try {
    const form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const photos: Uint8Array[] = [];
    for (const value of form.getAll("photos")) {
      if (value instanceof Blob) photos.push(new Uint8Array(await value.arrayBuffer()));
    }
    return { consent: form.get("consent") === "true", photos };
  } catch {
    return { consent: false, photos: [] };
  }
}

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

const IDENTIFY_STATUS: Record<IdentifyAnswer["kind"], number> = {
  ok: 201,
  invalid: 400,
  consent_required: 400,
  quota: 429,
  rejected: 422,
  unavailable: 503,
  failed: 500,
};

export async function handleIdentify(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ kind: "forbidden" }, 403);
  const user = await signedIn();
  if (!user) return json({ kind: "signed_out" }, 401);

  const tooLarge = () => json({ kind: "invalid", message: PHOTO_MESSAGES.requestTooLarge }, 413);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > IDENTIFY_BODY_MAX) return tooLarge();
  // The header is only a hint (it can be missing or wrong): the cap is applied while reading.
  const body = await readBodyWithin(request, IDENTIFY_BODY_MAX);
  if (body === "too_large") return tooLarge();
  const input = await readIdentifyForm(request, body);

  // After the body is read, so the deadline covers only our own work.
  const http = httpClient({ deadline: Date.now() + REQUEST_BUDGET_MS });
  const config = readProviderConfig().plantnet;
  const adapter = config
    ? plantnet(
        providerClient(
          http,
          usageGate({
            usage: supabaseUsageStore(user.client),
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
      image: sharpImageProcessor,
      sessions: supabaseIdentificationStore(user.client),
      species: supabaseSpeciesStore(user.client),
      plantnet: adapter,
    },
    input,
  );
  return json(answer, IDENTIFY_STATUS[answer.kind]);
}

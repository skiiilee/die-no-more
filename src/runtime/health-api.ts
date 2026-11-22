import "server-only";
import { readProviderConfig } from "@/config/providers";
import { supabasePlantStore } from "@/repo/plant-repo";
import type { SupabaseServerClient } from "@/repo/supabase-client";
import { supabaseUsageStore } from "@/repo/usage-repo";
import { careAiUsage } from "@/service/adapters/care-ai";
import { healthAi } from "@/service/adapters/health-ai";
import { httpClient, providerClient, REQUEST_BUDGET_MS } from "@/service/adapters/http";
import { sharpImageProcessor } from "@/service/adapters/image";
import { plantnetUsage } from "@/service/adapters/plantnet";
import { plantnetHealth } from "@/service/adapters/plantnet-health";
import { checkHealth, explainHealth, readCandidates, readHealthInput } from "@/service/health-check";
import { PHOTO_MESSAGES } from "@/service/photo-cleaning";
import { utcDayStart, usageGate } from "@/service/provider-usage";
import type { HealthAnswer } from "@/types/health";
import { IDENTIFY_BODY_MAX, isSameOrigin, readBodyWithin, signedIn } from "./photo-api";

/**
 * POST /api/health-checks and /api/health-checks/explain for S07 (ADR-0003
 * D5–D7, ADR-0006). Same guards as identification: same-origin, signed in,
 * body capped while reading, every query as the user (RLS), JSON answers with
 * a `kind` and no provider detail. Photos are never stored in this step.
 */

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** Health explanation step: its own budget, like the care AI step (ADR-0005 D6). */
const EXPLAIN_BUDGET_MS = 25_000;
const EXPLAIN_ATTEMPT_MAX_MS = 20_000;
/** The explain request carries text only. */
const EXPLAIN_BODY_MAX = 16 * 1024;

const HEALTH_STATUS: Record<HealthAnswer["kind"], number> = {
  ok: 201,
  unclear: 201,
  invalid: 400,
  consent_required: 400,
  quota: 429,
  rejected: 422,
  unavailable: 503,
};

/** The chosen pot's species name for the AI, when the pot is the user's own (RLS) and has one. */
async function speciesOf(client: SupabaseServerClient, potId: string | null): Promise<string | null> {
  if (!potId) return null;
  try {
    const pot = await supabasePlantStore(client).getPot(potId);
    return pot?.species?.scientificName ?? null;
  } catch {
    return null;
  }
}

async function readForm(request: Request, body: Uint8Array<ArrayBuffer>) {
  try {
    const form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const photos: Uint8Array[] = [];
    for (const value of form.getAll("photos")) {
      if (value instanceof Blob) photos.push(new Uint8Array(await value.arrayBuffer()));
    }
    return {
      consent: form.get("consent") === "true",
      photos,
      fields: { symptoms: form.getAll("symptoms"), noticed: form.get("noticed"), notes: form.get("notes"), potId: form.get("potId") },
    };
  } catch {
    return { consent: false, photos: [], fields: { symptoms: [], noticed: null, notes: null, potId: null } };
  }
}

export async function handleHealthCheck(request: Request): Promise<Response> {
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

  const http = httpClient({ deadline: Date.now() + REQUEST_BUDGET_MS });
  const config = readProviderConfig().plantnet;
  // Species and disease identification share Pl@ntNet's daily quota, so they share the usage gate.
  const adapter = config
    ? plantnetHealth(
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

  const answer = await checkHealth(
    { image: sharpImageProcessor, plantnet: adapter },
    { consent: form.consent, photos: form.photos, speciesName: await speciesOf(user.client, input.input.potId) },
  );
  return json(answer, HEALTH_STATUS[answer.kind]);
}

export async function handleHealthExplain(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return json({ kind: "forbidden" }, 403);
  const user = await signedIn();
  if (!user) return json({ kind: "signed_out" }, 401);

  const body = await readBodyWithin(request, EXPLAIN_BODY_MAX);
  if (body === "too_large") return json({ kind: "unavailable" }, 413);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
  } catch {
    return json({ kind: "unavailable" }, 400);
  }
  const candidates = readCandidates(raw?.candidates);
  const input = readHealthInput({ symptoms: raw?.symptoms, noticed: raw?.noticed, notes: raw?.notes, potId: raw?.potId });
  if (!candidates || !input.ok) return json({ kind: "unavailable" }, 400);

  const http = httpClient({ deadline: Date.now() + EXPLAIN_BUDGET_MS, attemptMaxMs: EXPLAIN_ATTEMPT_MAX_MS });
  const config = readProviderConfig().careAi;
  // The same model, key and daily limit as the care AI (ADR-0006 D2).
  const adapter = config
    ? healthAi(
        providerClient(
          http,
          usageGate({
            usage: supabaseUsageStore(user.client),
            provider: "care_ai",
            dailyLimit: config.dailyLimit,
            classify: (result) => careAiUsage(result),
          }),
        ),
        { baseUrl: config.baseUrl, key: config.key, model: config.model },
      )
    : null;

  const answer = await explainHealth(adapter, {
    candidates,
    input: input.input,
    speciesName: await speciesOf(user.client, input.input.potId),
  });
  return json(answer, 200);
}

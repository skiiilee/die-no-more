import "server-only";
import { readProviderConfig } from "@/config/providers";
import { supabasePlantStore } from "@/repo/plant-repo";
import type { SupabaseServerClient } from "@/repo/supabase-client";
import { supabaseUsageStore } from "@/repo/usage-repo";
import { careAiUsage } from "@/service/adapters/care-ai";
import { healthAi } from "@/service/adapters/health-ai";
import { healthVision } from "@/service/adapters/health-ai-vision";
import { httpClient, providerClient, REQUEST_BUDGET_MS } from "@/service/adapters/http";
import { sharpImageProcessor } from "@/service/adapters/image";
import { plantnetUsage } from "@/service/adapters/plantnet";
import { plantnetHealth } from "@/service/adapters/plantnet-health";
import { checkHealth, explainHealth, judgeHealth, readHealthInput } from "@/service/health-check";
import { readHealthToken, signAiAnswer, signHealthToken } from "@/service/health-token";
import { PHOTO_MESSAGES } from "@/service/photo-cleaning";
import { utcDayStart, usageGate } from "@/service/provider-usage";
import type { HealthAnswer, JudgeAnswer } from "@/types/health";
import { IDENTIFY_BODY_MAX, isSameOrigin, readBodyWithin, signedIn } from "./photo-api";

/**
 * POST /api/health-checks and /api/health-checks/explain for S07 (ADR-0003
 * D5–D7, ADR-0006). Same guards as identification: same-origin, signed in,
 * body capped while reading, every query as the user (RLS), JSON answers with
 * a `kind` and no provider detail. Photos are never stored in this step.
 */

export const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

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

const JUDGE_STATUS: Record<JudgeAnswer["kind"], number> = {
  ok: 200,
  none: 200,
  invalid: 400,
  consent_required: 400,
  stale: 409,
  not_allowed: 403,
  quota: 429,
  unavailable: 503,
};

/**
 * Key material for the result token (PR #23 review P2): the server-only
 * Pl@ntNet key, never sent anywhere else; health-token.ts derives a separate
 * signing key from it with a purpose label. Null when Pl@ntNet is not set up,
 * in which case there are no results to sign either.
 */
export function tokenSecret(): string | null {
  return readProviderConfig().plantnet?.key ?? null;
}

/**
 * The care AI endpoint for one health AI request (ADR-0006 D2): same model,
 * key and `care_ai` daily limit, with its own budget. Null when not configured.
 */
function aiClient(client: SupabaseServerClient) {
  const config = readProviderConfig().careAi;
  if (!config) return null;
  const http = httpClient({ deadline: Date.now() + EXPLAIN_BUDGET_MS, attemptMaxMs: EXPLAIN_ATTEMPT_MAX_MS });
  const provider = providerClient(
    http,
    usageGate({
      usage: supabaseUsageStore(client),
      provider: "care_ai",
      dailyLimit: config.dailyLimit,
      classify: (result) => careAiUsage(result),
    }),
  );
  return { provider, options: { baseUrl: config.baseUrl, key: config.key, model: config.model } };
}

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

export async function readForm(request: Request, body: Uint8Array<ArrayBuffer>) {
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
      token: form.get("token"),
      // S07-S only: the signed AI texts to save with the result.
      explainToken: form.get("explainToken"),
      judgeToken: form.get("judgeToken"),
    };
  } catch {
    return { consent: false, photos: [], fields: { symptoms: [], noticed: null, notes: null, potId: null }, token: null, explainToken: null, judgeToken: null };
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

  const secret = config?.key ?? "";
  const answer = await checkHealth(
    {
      image: sharpImageProcessor,
      plantnet: adapter,
      // Bound to this user and the photos exactly as received; the AI requests must bring it back.
      sign: (result) => signHealthToken(secret, { userId: user.userId, ...result, photos: form.photos }),
    },
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
  // The causes come only from the signed token, never from the body (PR #23 review P2).
  const secret = tokenSecret();
  const result = secret ? readHealthToken(secret, raw?.token, user.userId) : null;
  const input = readHealthInput({ symptoms: raw?.symptoms, noticed: raw?.noticed, notes: null, potId: raw?.potId });
  if (!secret || !result || !input.ok) return json({ kind: "unavailable" }, 400);
  const resultToken = raw.token as string;

  const ai = aiClient(user.client);
  const adapter = ai ? healthAi(ai.provider, ai.options) : null;

  const answer = await explainHealth(adapter, {
    result,
    input: input.input,
    speciesName: await speciesOf(user.client, input.input.potId),
    sign: (explanation) =>
      signAiAnswer(secret, { userId: user.userId, resultToken, kind: "explain", content: explanation }),
  });
  return json(answer, 200);
}

/**
 * POST /api/health-checks/ai-judge: when Pl@ntNet found nothing, the photo
 * AI's reading (ADR-0006 D6). Multipart like /api/health-checks: `consent`
 * here is the consent to send these photos to the AI, for this request only.
 */
export async function handleHealthJudge(request: Request): Promise<Response> {
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
  const ai = aiClient(user.client);
  const answer = await judgeHealth(
    {
      image: sharpImageProcessor,
      vision: ai ? healthVision(ai.provider, ai.options) : null,
      sign: (judgement) =>
        signAiAnswer(secret ?? "", { userId: user.userId, resultToken: String(form.token), kind: "judge", content: judgement }),
    },
    {
      consent: form.consent,
      photos: form.photos,
      input: input.input,
      speciesName: await speciesOf(user.client, input.input.potId),
      // ADR-0006 D6 on the server: only an 'unclear' result for these same photos (PR #23 review P2).
      result: secret ? readHealthToken(secret, form.token, user.userId) : null,
    },
  );
  return json(answer, JUDGE_STATUS[answer.kind]);
}

/**
 * Who receives the photos if the user asks the AI (S07-B consent text), or
 * null when the AI is not configured and the option is hidden. The adapter
 * stays provider-neutral (ADR-0005 D1); only this label names the service.
 */
export function healthAiRecipient(): { name: string; model: string } | null {
  const config = readProviderConfig().careAi;
  if (!config) return null;
  const host = new URL(config.baseUrl).host;
  const name = host === "generativelanguage.googleapis.com" ? "Google Gemini" : host;
  return { name, model: config.model };
}

import type { AiJudgement } from "@/types/health";
import { jsonBody, record, text, type HttpCall, type ProviderJsonClient } from "./http";
import { safeList, safeText, unfence } from "./health-ai";

/**
 * Photo AI reading for S07-B when Pl@ntNet found nothing (ADR-0006 D6, owner
 * choice 2026-11-22). Same OpenAI-compatible endpoint, key, model and daily
 * limit as the care AI. The photos are sent only after this request's own AI
 * consent, already cleaned and re-encoded (EXIF removed); free-text notes are
 * never sent. The model may describe visible signs and up to 3 possible
 * causes as possibilities; every text goes through the same checks as the
 * explanation (no chemicals, doses or certainty), and a broken body is a failure.
 */

export type VisionInput = {
  photos: Uint8Array[];
  /** Korean labels of the ticked symptoms. */
  symptoms: string[];
  noticed: string;
  speciesName: string | null;
};

export type VisionAnswer =
  | { kind: "ok"; judgement: AiJudgement }
  | { kind: "none" }
  | { kind: "quota" }
  | { kind: "unavailable" };

export type HealthVisionAdapter = { judge(input: VisionInput): Promise<VisionAnswer> };

const MAX_CAUSES = 3;
const MAX_NAME = 40;

export function buildVisionPrompt(): string {
  return [
    "You help one person look after a houseplant. The photos show one plant the user is worried about. A plant disease service could not find a cause.",
    "Reply with one JSON object and nothing else, in Korean, with exactly these keys:",
    '- "signs": up to 4 short descriptions of what is visible in the photos (colour, spots, wilting, insects), only what you can see.',
    '- "causes": up to 3 {"name": short name of a possible cause, "reason": one sentence on which visible sign points to it}. Common causes such as overwatering, underwatering, too much or too little light, cold, pests or fungus are fine.',
    '- "checks": up to 4 short things the user can check themselves.',
    '- "actions": up to 4 short safe next steps limited to observing, taking more photos, adjusting watering, light, airflow or isolating the pot.',
    "Rules:",
    "- Every cause is only a possibility. Never say a cause is certain or confirmed.",
    "- Never suggest pesticides, fungicides, chemicals, medicine, doses or any treatment product.",
    "- If the photos do not clearly show a plant or any sign, return empty arrays. Do not guess.",
  ].join("\n");
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** The reading of a chat-completion answer, each text checked, or null when it is not the expected JSON. */
export function parseVisionAnswer(body: unknown, model: string): AiJudgement | null {
  const choice = record((record(body)?.choices as unknown[] | undefined)?.[0]);
  const content = text(record(choice?.message)?.content);
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(content));
  } catch {
    return null;
  }
  const answer = record(parsed);
  if (!answer) return null;
  const causes: AiJudgement["causes"] = [];
  for (const item of Array.isArray(answer.causes) ? answer.causes : []) {
    const cause = record(item);
    const name = safeText(cause?.name);
    const reason = safeText(cause?.reason);
    if (!name || name.length > MAX_NAME || !reason || causes.some((kept) => kept.name === name)) continue;
    causes.push({ name, reason });
  }
  return {
    signs: safeList(answer.signs),
    causes: causes.slice(0, MAX_CAUSES),
    checks: safeList(answer.checks),
    actions: safeList(answer.actions),
    model,
  };
}

export function healthVision(
  client: ProviderJsonClient,
  options: { baseUrl: string; key: string; model: string },
): HealthVisionAdapter {
  return {
    async judge(input) {
      const call: HttpCall = await client.postJson(
        `${options.baseUrl}/chat/completions`,
        {
          model: options.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildVisionPrompt() },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ plant: input.speciesName ?? "unknown", symptoms: input.symptoms, noticed: input.noticed }),
                },
                ...input.photos.map((photo) => ({
                  type: "image_url",
                  image_url: { url: `data:image/jpeg;base64,${base64(photo)}` },
                })),
              ],
            },
          ],
        },
        { authorization: `Bearer ${options.key}` },
        "health_vision",
      );
      const { result } = call;
      if (result.kind === "blocked") {
        return { kind: result.reason === "limit" || result.reason === "quota" ? "quota" : "unavailable" };
      }
      if (result.kind !== "response" || result.status !== 200) return { kind: "unavailable" };
      const judgement = parseVisionAnswer(jsonBody(result), options.model);
      if (!judgement) return { kind: "unavailable" };
      return judgement.causes.length === 0 && judgement.signs.length === 0 ? { kind: "none" } : { kind: "ok", judgement };
    },
  };
}

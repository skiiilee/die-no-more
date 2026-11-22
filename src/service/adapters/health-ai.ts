import type { HealthCandidate, HealthExplanation } from "@/types/health";
import { jsonBody, record, text, type HttpCall, type ProviderJsonClient } from "./http";

/**
 * Health explanation AI (ADR-0006). Uses the same OpenAI-compatible endpoint,
 * key, model and daily limit as the care AI (ADR-0005). It never sees the
 * photos (only Pl@ntNet does, ADR-0003 D5) nor the user's free-text notes
 * (the free tier may use inputs for training, ADR-0006 D2), and never decides anything:
 * - it explains only the possible causes Pl@ntNet returned, as possibilities;
 * - it lists checks the user can do and safe next steps (observation and
 *   environment only);
 * - it must not name a confirmed disease, add causes, or suggest chemicals,
 *   pesticides, fungicides, doses or other treatments.
 * The answer is checked here: unknown codes, long texts and any text that
 * mentions a treatment are dropped (ADR-0006 D3). A body that is not the
 * expected JSON is a failure; S07-B then shows the fixed checks only.
 */

export type HealthAiInput = {
  candidates: HealthCandidate[];
  /** Korean labels of the ticked symptoms. */
  symptoms: string[];
  /** Korean label of when it was noticed. */
  noticed: string;
  speciesName: string | null;
};

export type HealthAiAnswer =
  | { kind: "ok"; explanation: HealthExplanation }
  | { kind: "none" }
  | { kind: "quota" }
  | { kind: "unavailable" };

export type HealthAiAdapter = { explain(input: HealthAiInput): Promise<HealthAiAnswer> };

const MAX_TEXT = 200;
const MAX_ITEMS = 4;

/**
 * Words that mark a treatment or a definite diagnosis. A text containing one
 * is dropped, not edited (ADR-0006 D3: no risky action is ever shown).
 */
const FORBIDDEN = [
  /농약|살충제|살균제|살비제|약제|방제|살포|희석|처방|치료제|소독약|구충/,
  /확진|진단됩니다|확실히|틀림없/,
  // Doses: "10ml", "2g", "1000배".
  /\d+\s*(?:ml|mL|㎖|그램|배|g)(?![a-zA-Z])/,
];

export function buildHealthPrompt(): string {
  return [
    "You help one person look after a houseplant. A photo service returned possible causes for the symptoms.",
    "Reply with one JSON object and nothing else, in Korean, with exactly these keys:",
    '- "causes": an array of {"code": one of the given codes, "text": one or two short sentences explaining that cause in plain words, as a possibility}.',
    '- "checks": up to 4 short things the user can check themselves (soil moisture, watering history, leaf undersides, drainage, light).',
    '- "actions": up to 4 short safe next steps limited to observing, taking more photos, adjusting watering, light, airflow or isolating the pot.',
    "Rules:",
    "- Only explain the given codes. Do not add other causes and do not say any cause is certain or confirmed.",
    "- Never suggest pesticides, fungicides, chemicals, medicine, doses or any treatment product.",
    "- If you are not sure about something, leave it out. Use empty arrays rather than guessing.",
  ].join("\n");
}

function userMessage(input: HealthAiInput): string {
  return JSON.stringify({
    plant: input.speciesName ?? "unknown",
    symptoms: input.symptoms,
    noticed: input.noticed,
    possible_causes: input.candidates.map((candidate) => ({ code: candidate.code, name: candidate.name })),
  });
}

/** A checked text: a string up to MAX_TEXT characters with no treatment or certainty words, or null. */
export function safeText(value: unknown): string | null {
  const trimmed = text(value);
  if (trimmed === null || trimmed.length > MAX_TEXT) return null;
  return FORBIDDEN.some((pattern) => pattern.test(trimmed)) ? null : trimmed;
}

/** Checked texts, without repeats, at most MAX_ITEMS. */
export function safeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const kept: string[] = [];
  for (const item of value) {
    const checked = safeText(item);
    if (checked && !kept.includes(checked)) kept.push(checked);
  }
  return kept.slice(0, MAX_ITEMS);
}

/** Strips a Markdown code fence some models add around JSON. */
export function unfence(content: string): string {
  return content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

/**
 * The explanation of a chat-completion answer, each text checked, or null when
 * the body is not a chat answer with a JSON object as its content.
 */
export function parseHealthAnswer(
  body: unknown,
  codes: readonly string[],
  model: string,
): HealthExplanation | null {
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
  const causes: HealthExplanation["causes"] = [];
  for (const item of Array.isArray(answer.causes) ? answer.causes : []) {
    const cause = record(item);
    const code = text(cause?.code);
    const explanation = safeText(cause?.text);
    if (!code || !codes.includes(code) || !explanation || causes.some((kept) => kept.code === code)) continue;
    causes.push({ code, text: explanation });
  }
  return { causes, checks: safeList(answer.checks), actions: safeList(answer.actions), model };
}

function isEmpty(explanation: HealthExplanation): boolean {
  return explanation.causes.length === 0 && explanation.checks.length === 0 && explanation.actions.length === 0;
}

export function healthAi(
  client: ProviderJsonClient,
  options: { baseUrl: string; key: string; model: string },
): HealthAiAdapter {
  return {
    async explain(input) {
      const call: HttpCall = await client.postJson(
        `${options.baseUrl}/chat/completions`,
        {
          model: options.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildHealthPrompt() },
            { role: "user", content: userMessage(input) },
          ],
        },
        { authorization: `Bearer ${options.key}` },
        "health",
      );
      const { result } = call;
      if (result.kind === "blocked") {
        return { kind: result.reason === "limit" || result.reason === "quota" ? "quota" : "unavailable" };
      }
      if (result.kind !== "response" || result.status !== 200) return { kind: "unavailable" };
      const explanation = parseHealthAnswer(
        jsonBody(result),
        input.candidates.map((candidate) => candidate.code),
        options.model,
      );
      if (!explanation) return { kind: "unavailable" };
      return isEmpty(explanation) ? { kind: "none" } : { kind: "ok", explanation };
    },
  };
}

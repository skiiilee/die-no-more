import { AI_CARE_FIELDS, type AiCare, type CareField } from "@/types/species";
import { jsonBody, record, retryAfter, text, type HttpCall, type HttpResult, type ProviderJsonClient } from "./http";
import type { UsageSettlement } from "./perenual";

/**
 * Care AI adapter (ADR-0005). Calls any OpenAI-compatible chat endpoint
 * (base URL, key and model from config), asks for the requested care fields of
 * one species as JSON, and keeps only values that pass the checks below. The
 * model's answer is never trusted as-is: a value that breaks a rule is dropped,
 * and an answer that is not JSON of the expected shape is a failure, not "no
 * data", so the species is asked again next time.
 */

export type CareAiAnswer =
  | { kind: "ok"; care: AiCare; model: string }
  /** The model answered, but every requested value was empty or rejected. Stored as checked, nothing saved. */
  | { kind: "none"; model: string }
  | { kind: "quota" }
  | { kind: "unavailable" };

export type CareAiAdapter = {
  /** Asks only for `fields` (the ones the provider left empty), never for the rest. */
  describe(scientificName: string, fields: readonly CareField[]): Promise<CareAiAnswer>;
};

/** Care levels use the same Korean labels as the S04-B table (care-labels.ts). */
const CARE_LEVELS = ["쉬움", "보통", "어려움"];
/** Longest accepted text per field. A longer value is rejected, not cut. */
const MAX_TEXT = 200;

/** Per field: the JSON key the model answers with and the instruction for it. */
const SPEC: Record<CareField, { key: string; line: string }> = {
  careLevel: { key: "care_level", line: '"care_level": one of "쉬움", "보통", "어려움", or null.' },
  light: { key: "light", line: '"light": short Korean text on light needs for indoor or pot cultivation, or null.' },
  watering: { key: "watering", line: '"watering": short Korean text on how often and how much to water, or null.' },
  wateringInterval: {
    key: "watering_interval_days",
    line: '"watering_interval_days": {"min": integer, "max": integer} as days between checks of the soil, or null.',
  },
  temperature: { key: "temperature", line: '"temperature": short Korean text on the suitable temperature range, or null.' },
  soil: { key: "soil", line: '"soil": short Korean text on the soil type, or null.' },
  fertilizer: { key: "fertilizer", line: '"fertilizer": short Korean text on fertilizing (season and interval), or null.' },
  description: { key: "description", line: '"description": at most two short Korean sentences describing the plant, or null.' },
};

/** The prompt for the requested fields only. */
export function buildPrompt(fields: readonly CareField[]): string {
  return [
    "You are a houseplant care reference for a plant-care app used by one person.",
    "The user gives one plant's scientific name. Reply with one JSON object and nothing else, with exactly these keys:",
    ...fields.map((field) => `- ${SPEC[field].line}`),
    "Use null for anything you are not sure about. Do not guess.",
    "Do not give toxicity, pest, or disease information, and do not diagnose anything.",
  ].join("\n");
}

/** Usage row for a care AI attempt. A 429 is a rate limit: a short cooldown, not the daily cap. */
export function careAiUsage(result: HttpResult, nowMs: number = Date.now()): UsageSettlement {
  if (result.kind !== "response" || result.status >= 500) return { status: "failure", retryAt: null };
  if (result.status === 429) {
    return { status: "failure", retryAt: retryAfter(result.headers, nowMs, 60_000) };
  }
  return { status: "success", retryAt: null };
}

/** A text field: a string up to MAX_TEXT characters, or null. */
function textField(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed !== null && trimmed.length <= MAX_TEXT ? trimmed : null;
}

/** Days between checks: integers 1–365 with min <= max, or null. */
function intervalField(value: unknown): { min: number; max: number } | null {
  const interval = record(value);
  const min = interval?.min;
  const max = interval?.max;
  if (!Number.isInteger(min) || !Number.isInteger(max)) return null;
  const low = min as number;
  const high = max as number;
  return low >= 1 && low <= high && high <= 365 ? { min: low, max: high } : null;
}

/** Strips a Markdown code fence some models add around JSON. */
function unfence(content: string): string {
  return content.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
}

const EMPTY: AiCare = {
  careLevel: null,
  light: null,
  watering: null,
  wateringBenchmark: null,
  temperature: null,
  soil: null,
  fertilizer: null,
  description: null,
};

/**
 * The care values of a chat-completion answer, checked field by field, or null
 * when the body is not a chat answer with a JSON object as its content. Only the
 * requested fields are kept; the others come back null.
 */
export function parseCareAnswer(body: unknown, fields: readonly CareField[] = AI_CARE_FIELDS): AiCare | null {
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
  const care: AiCare = { ...EMPTY };
  for (const field of fields) {
    switch (field) {
      case "careLevel": {
        const level = text(answer.care_level);
        care.careLevel = level && CARE_LEVELS.includes(level) ? level : null;
        break;
      }
      case "wateringInterval":
        care.wateringBenchmark = intervalField(answer.watering_interval_days);
        break;
      case "light":
      case "watering":
      case "temperature":
      case "soil":
      case "fertilizer":
      case "description":
        care[field] = textField(answer[SPEC[field].key]);
        break;
    }
  }
  return care;
}

function isEmpty(care: AiCare): boolean {
  return Object.values(care).every((value) => value === null);
}

export function careAi(
  client: ProviderJsonClient,
  options: { baseUrl: string; key: string; model: string },
): CareAiAdapter {
  return {
    async describe(scientificName, fields) {
      if (fields.length === 0) return { kind: "none", model: options.model };
      const call: HttpCall = await client.postJson(
        `${options.baseUrl}/chat/completions`,
        {
          model: options.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildPrompt(fields) },
            { role: "user", content: `Scientific name: ${scientificName}` },
          ],
        },
        { authorization: `Bearer ${options.key}` },
        "care",
      );
      const { result } = call;
      if (result.kind === "blocked") {
        return { kind: result.reason === "limit" || result.reason === "quota" ? "quota" : "unavailable" };
      }
      if (result.kind !== "response" || result.status !== 200) return { kind: "unavailable" };
      const care = parseCareAnswer(jsonBody(result), fields);
      if (!care) return { kind: "unavailable" };
      return isEmpty(care) ? { kind: "none", model: options.model } : { kind: "ok", care, model: options.model };
    },
  };
}

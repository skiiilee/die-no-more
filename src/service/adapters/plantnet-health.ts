import { HEALTH_LIMITS, HEALTH_MIN_SCORE, type HealthCandidate } from "@/types/health";
import { jsonBody, record, text, type HttpCall, type ProviderPostClient } from "./http";

/**
 * Pl@ntNet disease identification (docs/04-api-design.md "Pl@ntNet", 03 §4
 * F05). Same rules as species identification: only Pl@ntNet receives the
 * photos, only after this request's consent (ADR-0003 D5), and the shared
 * daily quota is counted by the same usage gate ("plantnet").
 *
 * - POST /v2/diseases/identify with 1–5 `images`, one `organs` value each.
 * - 200: `results[]` with `name` (EPPO code), `score` and `description`
 *   (an English label; Korean is not offered, live check 2026-11-13).
 * - 404: nothing recognised. A normal answer ('판단 어려움').
 * - 429: daily quota.
 * A 200 whose body is not the expected shape is a failure, never "nothing found".
 */

const ENDPOINT = "https://my-api.plantnet.org/v2/diseases/identify";
/** How many results to ask for; S07-B shows at most HEALTH_LIMITS.candidates of them. */
const ASK_RESULTS = 10;
/** EPPO codes are short upper-case codes such as "PHYTIN" or "1BOTRG". */
const CODE = /^[0-9A-Z]{3,10}$/;
const MAX_NAME = 120;

export type DiagnoseResult =
  | { kind: "ok"; candidates: HealthCandidate[] }
  | { kind: "none" }
  | { kind: "quota" }
  | { kind: "rejected" }
  | { kind: "unavailable" };

export type PlantnetHealthAdapter = { diagnose(images: Uint8Array[]): Promise<DiagnoseResult> };

/**
 * Candidates of a 200 answer that pass the score bar, best first, at most
 * HEALTH_LIMITS.candidates; null when the body is not a result list.
 */
export function parseDiseases(body: unknown): HealthCandidate[] | null {
  const answer = record(body);
  if (!answer || !Array.isArray(answer.results)) return null;
  const candidates: HealthCandidate[] = [];
  for (const item of answer.results) {
    const result = record(item);
    const code = text(result?.name);
    const name = text(result?.description);
    const score = result?.score;
    if (!code || !CODE.test(code) || typeof score !== "number" || !Number.isFinite(score)) continue;
    if (score < HEALTH_MIN_SCORE || candidates.some((candidate) => candidate.code === code)) continue;
    candidates.push({ code, name: name && name.length <= MAX_NAME ? name : code, score });
  }
  return candidates.sort((a, b) => b.score - a.score).slice(0, HEALTH_LIMITS.candidates);
}

function answer(call: HttpCall): DiagnoseResult {
  const { result } = call;
  if (result.kind === "blocked") {
    return { kind: result.reason === "usage_unavailable" ? "unavailable" : "quota" };
  }
  if (result.kind === "failed") return { kind: "unavailable" };
  if (result.status === 404) return { kind: "none" };
  if (result.status === 429) return { kind: "quota" };
  if (result.status === 400 || result.status === 413 || result.status === 415) return { kind: "rejected" };
  if (result.status !== 200) return { kind: "unavailable" };
  const candidates = parseDiseases(jsonBody(result));
  if (!candidates) return { kind: "unavailable" };
  return candidates.length > 0 ? { kind: "ok", candidates } : { kind: "none" };
}

/** The key goes in the query string of a server call only; URLs are never logged. */
export function plantnetHealth(client: ProviderPostClient, apiKey: string): PlantnetHealthAdapter {
  return {
    async diagnose(images) {
      const url = new URL(ENDPOINT);
      url.searchParams.set("nb-results", String(ASK_RESULTS));
      url.searchParams.set("lang", "en");
      url.searchParams.set("api-key", apiKey);
      const form = () => {
        const body = new FormData();
        images.forEach((bytes, index) => {
          body.append("images", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/jpeg" }), `photo-${index + 1}.jpg`);
          body.append("organs", "auto");
        });
        return body;
      };
      return answer(await client.post(url.toString(), form, "diseases"));
    },
  };
}

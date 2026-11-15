/**
 * Provider HTTP calls under the ADR-0003 D7 time budget:
 * - request deadline 25 s after the request starts;
 * - each attempt times out at min(10 s, time left − 5 s), keeping 5 s for DB writes;
 * - one retry on timeout, connection error or 5xx, only with ≥ 12 s left.
 * URLs carry provider keys, so they are never logged or returned.
 */

export const REQUEST_BUDGET_MS = 25_000;
const ATTEMPT_MAX_MS = 10_000;
const RESERVE_MS = 5_000;
const RETRY_MIN_LEFT_MS = 12_000;

export type HttpResult =
  | { kind: "response"; status: number; headers: Headers; body: string }
  | { kind: "failed"; reason: "timeout" | "network" };

/** One provider call, possibly retried. `attempts` counts toward the daily cap. */
export type HttpCall = { result: HttpResult; attempts: number };

export type HttpClient = { get(url: string): Promise<HttpCall> };

type Clock = () => number;
type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

function retryable(result: HttpResult): boolean {
  return result.kind === "failed" || result.status >= 500;
}

async function attempt(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<HttpResult> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    return { kind: "response", status: response.status, headers: response.headers, body: await response.text() };
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError");
    return { kind: "failed", reason: timedOut ? "timeout" : "network" };
  }
}

/** A client for one request. Every call shares the same deadline. */
export function httpClient(options: { deadline: number; fetchImpl?: FetchLike; now?: Clock }): HttpClient {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const now = options.now ?? Date.now;
  const timeLeft = () => options.deadline - now();

  return {
    async get(url) {
      let attempts = 0;
      let result: HttpResult = { kind: "failed", reason: "timeout" };
      while (attempts < 2) {
        const timeout = Math.min(ATTEMPT_MAX_MS, timeLeft() - RESERVE_MS);
        if (timeout <= 0) break;
        attempts += 1;
        result = await attempt(fetchImpl, url, timeout);
        if (!retryable(result) || timeLeft() < RETRY_MIN_LEFT_MS) break;
      }
      return { result, attempts };
    },
  };
}

/** Parses a JSON body; null when it is not JSON. */
export function jsonBody(result: HttpResult): unknown {
  if (result.kind !== "response") return null;
  try {
    return JSON.parse(result.body) as unknown;
  } catch {
    return null;
  }
}

/** Reads `value` as a record, or null. */
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** An https URL, or null. Provider photos are shown only over https. */
export function httpsUrl(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    return new URL(candidate).protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

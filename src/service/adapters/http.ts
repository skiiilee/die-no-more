/**
 * Provider HTTP calls under the ADR-0003 D7 time budget:
 * - request deadline 25 s after the request starts;
 * - each attempt times out at min(10 s, time left − 5 s), keeping 5 s for DB writes;
 * - one retry on timeout, connection error or 5xx, only with ≥ 12 s left.
 * Every attempt, retries included, first passes the call gate (daily cap and
 * provider back-off, see provider-usage.ts); a refused gate sends nothing.
 * URLs carry provider keys, so they are never logged or returned.
 */

export const REQUEST_BUDGET_MS = 25_000;
const ATTEMPT_MAX_MS = 10_000;
const RESERVE_MS = 5_000;
const RETRY_MIN_LEFT_MS = 12_000;

/** Why the gate refused a call: our cap, the provider's quota answer, its back-off, or usage not recordable. */
export type BlockReason = "limit" | "quota" | "cooldown" | "usage_unavailable";

export type HttpResult =
  | { kind: "response"; status: number; headers: Headers; body: string }
  | { kind: "failed"; reason: "timeout" | "network" }
  | { kind: "blocked"; reason: BlockReason };

export type HttpCall = { result: HttpResult; attempts: number };

/** One reserved attempt. `settle` records how it ended. */
export type Ticket = { settle(result: HttpResult): Promise<void> };

/** Reserves one call before it is sent. */
export type CallGate = { open(): Promise<{ ok: true; ticket: Ticket } | { ok: false; reason: BlockReason }> };

export type HttpClient = { get(url: string, gate?: CallGate): Promise<HttpCall> };

/** What adapters use: a client already bound to one provider's gate. */
export type ProviderClient = { get(url: string, operation: string): Promise<HttpCall> };

type Clock = () => number;
type FetchLike = (url: string, init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

function retryable(result: HttpResult): boolean {
  return result.kind === "failed" || (result.kind === "response" && result.status >= 500);
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
    async get(url, gate) {
      let attempts = 0;
      let result: HttpResult = { kind: "failed", reason: "timeout" };
      while (attempts < 2) {
        const timeout = Math.min(ATTEMPT_MAX_MS, timeLeft() - RESERVE_MS);
        if (timeout <= 0) break;
        const opened = gate ? await gate.open() : null;
        if (opened && !opened.ok) {
          // A refused retry keeps the first attempt's answer.
          if (attempts === 0) result = { kind: "blocked", reason: opened.reason };
          break;
        }
        attempts += 1;
        result = await attempt(fetchImpl, url, timeout);
        if (opened?.ok) await opened.ticket.settle(result);
        if (!retryable(result) || timeLeft() < RETRY_MIN_LEFT_MS) break;
      }
      return { result, attempts };
    },
  };
}

/** Binds a client to a provider's gate, one gate per operation (for the usage log). */
export function providerClient(client: HttpClient, gateFor: (operation: string) => CallGate): ProviderClient {
  return { get: (url, operation) => client.get(url, gateFor(operation)) };
}

/** Parses a JSON body; undefined when it is not a response or not JSON. */
export function jsonBody(result: HttpResult): unknown {
  if (result.kind !== "response") return undefined;
  try {
    return JSON.parse(result.body) as unknown;
  } catch {
    return undefined;
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

/** Retry-After as an instant: seconds or an HTTP date. Missing or invalid → `fallbackMs` from now. */
export function retryAfter(headers: Headers, nowMs: number, fallbackMs: number): Date {
  const raw = headers.get("retry-after")?.trim();
  const maxMs = 24 * 60 * 60 * 1000;
  if (raw && /^\d+$/.test(raw)) return new Date(nowMs + Math.min(Number(raw) * 1000, maxMs));
  const date = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(date) && date > nowMs) return new Date(Math.min(date, nowMs + maxMs));
  return new Date(nowMs + fallbackMs);
}

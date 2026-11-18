import "server-only";
import { readProviderConfig } from "@/config/providers";
import { supabaseSpeciesStore } from "@/repo/species-repo";
import { supabaseUsageStore } from "@/repo/usage-repo";
import { careAi, careAiUsage } from "@/service/adapters/care-ai";
import { httpClient, providerClient, REQUEST_BUDGET_MS } from "@/service/adapters/http";
import { perenual, perenualUsage } from "@/service/adapters/perenual";
import { trefle, trefleUsage } from "@/service/adapters/trefle";
import { notConnectedTranslator } from "@/service/adapters/translator";
import { usageGate } from "@/service/provider-usage";
import { loadAiCareFill, loadSpeciesPreview } from "@/service/species-preview";
import { searchSpecies } from "@/service/species-search";
import type { SearchOutcome, SpeciesCare, SpeciesPreview } from "@/types/species";
import { requestSupabase } from "./request-supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Care AI step of S04-B (ADR-0005 D6): its own budget, started when the step
 * starts. Live answers take 6–10 s and a 503 can come after ~9 s, so one
 * attempt may take 20 s and a retry still fits.
 */
export const CARE_AI_BUDGET_MS = 25_000;
const CARE_AI_ATTEMPT_MAX_MS = 20_000;

/**
 * Stores and provider adapters for one request, all running as the signed-in
 * owner. Every provider attempt passes that provider's usage gate.
 */
async function requestDeps(budget: { deadlineMs: number; attemptMaxMs?: number } = { deadlineMs: REQUEST_BUDGET_MS }) {
  const supabase = await requestSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  // After the cookie read above, so the time is per request (Cache Components).
  const http = httpClient({ deadline: Date.now() + budget.deadlineMs, attemptMaxMs: budget.attemptMaxMs });
  const config = readProviderConfig();
  const usage = supabaseUsageStore(supabase.client);

  const perenualAdapter = config.perenual
    ? perenual(
        providerClient(
          http,
          usageGate({ usage, provider: "perenual", dailyLimit: config.perenual.dailyLimit, classify: perenualUsage }),
        ),
        config.perenual.key,
      )
    : null;
  const trefleAdapter = config.trefle
    ? trefle(
        providerClient(
          http,
          usageGate({ usage, provider: "trefle", dailyLimit: config.trefle.dailyLimit, classify: (r) => trefleUsage(r) }),
        ),
        config.trefle.key,
      )
    : null;

  const careAiAdapter = config.careAi
    ? careAi(
        providerClient(
          http,
          usageGate({ usage, provider: "care_ai", dailyLimit: config.careAi.dailyLimit, classify: (r) => careAiUsage(r) }),
        ),
        { baseUrl: config.careAi.baseUrl, key: config.careAi.key, model: config.careAi.model },
      )
    : null;

  return {
    species: supabaseSpeciesStore(supabase.client),
    perenual: perenualAdapter,
    trefle: trefleAdapter,
    translator: notConnectedTranslator,
    careAi: careAiAdapter,
  };
}

/** S04-A: search candidates for the query in the URL. */
export async function searchSpeciesForPage(query: string | undefined): Promise<SearchOutcome> {
  return searchSpecies(await requestDeps(), query);
}

/** S04-B: one species, or null when the id is not in the plant DB. */
export async function getSpeciesPreview(id: string): Promise<SpeciesPreview | null> {
  if (!UUID.test(id)) return null;
  return loadSpeciesPreview(await requestDeps(), id);
}

/**
 * S04-B second step: the care with the AI values filled in (ADR-0005 D6).
 * Streamed in after the screen is shown. A failure keeps the first step's care.
 */
export async function getAiCareFill(preview: SpeciesPreview): Promise<SpeciesCare> {
  if (preview.aiFill.length === 0) return preview.care;
  try {
    const deps = await requestDeps({ deadlineMs: CARE_AI_BUDGET_MS, attemptMaxMs: CARE_AI_ATTEMPT_MAX_MS });
    return await loadAiCareFill(deps, preview);
  } catch (error) {
    console.error("care AI fill failed", error instanceof Error ? error.name : "unknown");
    return preview.care;
  }
}

import "server-only";
import { readProviderConfig, type ProviderAccess } from "@/config/providers";
import { supabaseSpeciesStore } from "@/repo/species-repo";
import { supabaseUsageStore, type UsageProvider, type UsageStore } from "@/repo/usage-repo";
import { httpClient, REQUEST_BUDGET_MS, type HttpClient } from "@/service/adapters/http";
import { perenual } from "@/service/adapters/perenual";
import { trefle } from "@/service/adapters/trefle";
import { notConnectedTranslator } from "@/service/adapters/translator";
import { meter } from "@/service/provider-usage";
import { loadSpeciesPreview } from "@/service/species-preview";
import { searchSpecies, type Metered } from "@/service/species-search";
import type { SearchOutcome, SpeciesPreview } from "@/types/species";
import { requestSupabase } from "./request-supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function metered<T>(
  access: ProviderAccess | null,
  usage: UsageStore,
  provider: UsageProvider,
  build: (key: string) => T,
): Metered<T> | null {
  return access ? { adapter: build(access.key), meter: meter(usage, provider, access.dailyLimit) } : null;
}

/** Stores and provider clients for one request, all running as the signed-in owner. */
async function requestDeps() {
  const supabase = await requestSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  // After the cookie read above, so the time is per request (Cache Components).
  const client: HttpClient = httpClient({ deadline: Date.now() + REQUEST_BUDGET_MS });
  const config = readProviderConfig();
  const usage = supabaseUsageStore(supabase.client);
  return {
    species: supabaseSpeciesStore(supabase.client),
    perenual: metered(config.perenual, usage, "perenual", (key) => perenual(client, key)),
    trefle: metered(config.trefle, usage, "trefle", (key) => trefle(client, key)),
    translator: notConnectedTranslator,
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

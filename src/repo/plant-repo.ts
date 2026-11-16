import "server-only";
import type { PlantRegistration, PotView, SpeciesSummary } from "@/types/plant";
import type { SupabaseServerClient } from "./supabase-client";

/**
 * Pot storage. Runs as the signed-in user; RLS limits every query to own rows.
 * Lookups return null only when the row does not exist (or RLS hides it); a
 * failed query throws, so a database outage is never shown as "not found".
 */
export type PlantStore = {
  /** Inserts a pot owned by the signed-in user and returns its id. */
  insertPot(registration: PlantRegistration): Promise<{ ok: true; id: string } | { ok: false }>;
  getPot(id: string): Promise<PotView | null>;
  listActivePots(): Promise<PotView[]>;
  getSpecies(id: string): Promise<SpeciesSummary | null>;
  /** Which reminder intervals the species' Perenual data has (D16). User values never count (D13). */
  getReminderData(speciesId: string): Promise<{ hasWateringBenchmark: boolean; hasFertilizerInterval: boolean }>;
};

/** Thrown when a query fails. Carries no database detail to the screen. */
export class PlantStoreError extends Error {
  constructor(operation: string, options?: { cause?: unknown }) {
    super(`Plant store query failed: ${operation}`, options);
    this.name = "PlantStoreError";
  }
}

const POT_COLUMNS = `
  id, nickname, user_entered_name, environment, location, memo,
  initial_last_watered_range, light_level, initial_last_repotted_range, pot_material,
  initial_state_recorded_at, water_reminder_enabled, fertilizer_reminder_enabled, created_at,
  species:plant_species ( id, korean_name, scientific_name )
`;

type SpeciesRow = { id: string; korean_name: string | null; scientific_name: string };
type PotRow = {
  id: string;
  nickname: string | null;
  user_entered_name: string | null;
  environment: PotView["environment"];
  location: string | null;
  memo: string | null;
  initial_last_watered_range: PotView["lastWatered"];
  light_level: PotView["lightLevel"];
  initial_last_repotted_range: PotView["lastRepotted"];
  pot_material: PotView["potMaterial"];
  initial_state_recorded_at: string;
  water_reminder_enabled: boolean;
  fertilizer_reminder_enabled: boolean;
  created_at: string;
  species: SpeciesRow | SpeciesRow[] | null;
};

function toSpecies(row: SpeciesRow): SpeciesSummary {
  return { id: row.id, koreanName: row.korean_name, scientificName: row.scientific_name };
}

function toPot(row: PotRow): PotView {
  const species = Array.isArray(row.species) ? row.species[0] ?? null : row.species;
  return {
    id: row.id,
    nickname: row.nickname,
    userEnteredName: row.user_entered_name,
    species: species ? toSpecies(species) : null,
    environment: row.environment,
    location: row.location,
    memo: row.memo,
    lastWatered: row.initial_last_watered_range,
    lightLevel: row.light_level,
    lastRepotted: row.initial_last_repotted_range,
    potMaterial: row.pot_material,
    initialStateRecordedAt: row.initial_state_recorded_at,
    waterReminder: row.water_reminder_enabled,
    fertilizerReminder: row.fertilizer_reminder_enabled,
    createdAt: row.created_at,
  };
}

/** Maps a validated registration to user_plants columns. user_id defaults to auth.uid(). */
export function potInsertRow(registration: PlantRegistration) {
  const { identity } = registration;
  return {
    species_id: identity.kind === "species" ? identity.speciesId : null,
    user_entered_name: identity.kind === "manual" ? identity.name : null,
    nickname: registration.nickname,
    environment: registration.environment,
    location: registration.location,
    memo: registration.memo,
    initial_last_watered_range: registration.lastWatered,
    light_level: registration.lightLevel,
    initial_last_repotted_range: registration.lastRepotted,
    pot_material: registration.potMaterial,
    water_reminder_enabled: registration.waterReminder,
    fertilizer_reminder_enabled: registration.fertilizerReminder,
  };
}

export function supabasePlantStore(client: SupabaseServerClient): PlantStore {
  return {
    async insertPot(registration) {
      const { data, error } = await client
        .from("user_plants")
        .insert(potInsertRow(registration))
        .select("id")
        .single();
      if (error || !data) return { ok: false };
      return { ok: true, id: data.id as string };
    },
    async getPot(id) {
      const { data, error } = await client.from("user_plants").select(POT_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new PlantStoreError("getPot", { cause: error });
      if (!data) return null;
      return toPot(data as unknown as PotRow);
    },
    async listActivePots() {
      const { data, error } = await client
        .from("user_plants")
        .select(POT_COLUMNS)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error || !data) throw new PlantStoreError("listActivePots", { cause: error });
      return (data as unknown as PotRow[]).map(toPot);
    },
    async getSpecies(id) {
      const { data, error } = await client
        .from("plant_species")
        .select("id, korean_name, scientific_name")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new PlantStoreError("getSpecies", { cause: error });
      if (!data) return null;
      return toSpecies(data as SpeciesRow);
    },
    async getReminderData(speciesId) {
      const { data, error } = await client
        .from("species_care")
        .select("field")
        .eq("species_id", speciesId)
        .eq("source", "perenual")
        .in("field", ["watering_benchmark", "fertilizer_interval"]);
      if (error || !data) throw new PlantStoreError("getReminderData", { cause: error });
      const fields = new Set((data as { field: string }[]).map((row) => row.field));
      return { hasWateringBenchmark: fields.has("watering_benchmark"), hasFertilizerInterval: fields.has("fertilizer_interval") };
    },
  };
}

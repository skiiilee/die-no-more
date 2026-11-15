import "server-only";
import { isStorableImageUrl, type CareStatus, type FoundSpecies, type PerenualCare, type SpeciesRecord } from "@/types/species";
import { PlantStoreError } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

/**
 * Plant DB (shared species reference). Runs as the signed-in owner; see
 * docs/09-deferred-items.md DF-01 for why signed-in users may write it.
 * A failed query throws PlantStoreError; "not found" is null.
 */
export type SpeciesStore = {
  /** Plant DB search (search_species, ADR-0003 D10). */
  searchLocal(query: string): Promise<SpeciesRecord[]>;
  /** Stores provider results by scientific-name key and returns the rows in the same order. */
  saveFound(found: FoundSpecies[]): Promise<SpeciesRecord[]>;
  getRecord(id: string): Promise<SpeciesRecord | null>;
  /** Perenual care values stored for the species, or null when none. */
  getCare(id: string): Promise<PerenualCare | null>;
  /** Records the Korean-name lookup, with or without a name (ADR-0004 D2). */
  saveKoreanName(id: string, answer: { koreanName: string | null; trefleId: number | null }): Promise<void>;
  /** Records the Perenual care lookup and, when available, its values. */
  saveCare(id: string, answer: { status: CareStatus; perenualId: number | null; care: PerenualCare | null }): Promise<void>;
};

const COLUMNS =
  "id, scientific_name_key, scientific_name, common_name_en, korean_name, family, perenual_id, trefle_id, image_url, korean_name_checked_at, care_status";

export type Row = {
  id: string;
  scientific_name_key: string;
  scientific_name: string;
  common_name_en: string | null;
  korean_name: string | null;
  family: string | null;
  perenual_id: number | null;
  trefle_id: number | null;
  image_url: string | null;
  korean_name_checked_at: string | null;
  care_status: CareStatus | null;
};

function toRecord(row: Row): SpeciesRecord {
  return {
    id: row.id,
    scientificNameKey: row.scientific_name_key,
    scientificName: row.scientific_name,
    commonNameEn: row.common_name_en,
    koreanName: row.korean_name,
    family: row.family,
    perenualId: row.perenual_id,
    trefleId: row.trefle_id,
    imageUrl: row.image_url,
    koreanNameCheckedAt: row.korean_name_checked_at,
    careStatus: row.care_status,
  };
}

export function insertRow(found: FoundSpecies) {
  return {
    scientific_name_key: found.scientificNameKey,
    scientific_name: found.scientificName,
    common_name_en: found.commonNameEn,
    family: found.family,
    perenual_id: found.perenualId,
    trefle_id: found.trefleId,
    image_url: isStorableImageUrl(found.imageUrl) ? found.imageUrl : null,
    source: found.source,
  };
}

/** Fields a stored row lacks and a new answer has. Existing values are never replaced. */
export function missingFields(row: Row, found: FoundSpecies): Partial<Row> {
  const update: Partial<Row> = {};
  if (row.perenual_id === null && found.perenualId !== null) update.perenual_id = found.perenualId;
  if (row.trefle_id === null && found.trefleId !== null) update.trefle_id = found.trefleId;
  if (row.image_url === null && isStorableImageUrl(found.imageUrl)) update.image_url = found.imageUrl;
  if (row.common_name_en === null && found.commonNameEn !== null) update.common_name_en = found.commonNameEn;
  if (row.family === null && found.family !== null) update.family = found.family;
  return update;
}

export function toCare(rows: { field: string; value: unknown }[]): PerenualCare | null {
  if (rows.length === 0) return null;
  const value = (field: string) => rows.find((row) => row.field === field)?.value;
  const benchmark = value("watering_benchmark") as { min?: unknown; max?: unknown } | undefined;
  const light = value("light");
  return {
    watering: typeof value("watering") === "string" ? (value("watering") as string) : null,
    wateringBenchmark:
      benchmark && typeof benchmark.min === "number" && typeof benchmark.max === "number"
        ? { min: benchmark.min, max: benchmark.max }
        : null,
    sunlight: Array.isArray(light) ? light.filter((item): item is string => typeof item === "string") : [],
    careLevel: typeof value("care_level") === "string" ? (value("care_level") as string) : null,
    description: typeof value("description") === "string" ? (value("description") as string) : null,
  };
}

/** species_care rows for one Perenual answer. Empty values are not stored. */
export function careRows(speciesId: string, care: PerenualCare, fetchedAt: string) {
  const rows: { field: string; value: unknown }[] = [];
  if (care.watering) rows.push({ field: "watering", value: care.watering });
  if (care.wateringBenchmark) rows.push({ field: "watering_benchmark", value: { ...care.wateringBenchmark, unit: "days" } });
  if (care.sunlight.length > 0) rows.push({ field: "light", value: care.sunlight });
  if (care.careLevel) rows.push({ field: "care_level", value: care.careLevel });
  if (care.description) rows.push({ field: "description", value: care.description });
  return rows.map((row) => ({ species_id: speciesId, ...row, source: "perenual", fetched_at: fetchedAt }));
}

export function supabaseSpeciesStore(client: SupabaseServerClient): SpeciesStore {
  const byKeys = async (keys: string[]) => {
    const { data, error } = await client.from("plant_species").select(COLUMNS).in("scientific_name_key", keys);
    if (error || !data) throw new PlantStoreError("species by key", { cause: error });
    return data as Row[];
  };

  return {
    async searchLocal(query) {
      const { data, error } = await client.rpc("search_species", { query, max_results: 20 }).select(COLUMNS);
      if (error || !data) throw new PlantStoreError("searchLocal", { cause: error });
      return (data as Row[]).map(toRecord);
    },

    async saveFound(found) {
      if (found.length === 0) return [];
      const keys = found.map((item) => item.scientificNameKey);
      const { error } = await client
        .from("plant_species")
        .upsert(found.map(insertRow), { onConflict: "scientific_name_key", ignoreDuplicates: true });
      if (error) {
        // A provider ID already stored under another name: store the rest one by one.
        for (const item of found) {
          await client.from("plant_species").upsert(insertRow(item), { onConflict: "scientific_name_key", ignoreDuplicates: true });
        }
      }
      const rows = await byKeys(keys);
      for (const row of rows) {
        const item = found.find((candidate) => candidate.scientificNameKey === row.scientific_name_key);
        const update = item ? missingFields(row, item) : {};
        if (Object.keys(update).length === 0) continue;
        const { error: updateError } = await client.from("plant_species").update(update).eq("id", row.id);
        if (!updateError) Object.assign(row, update);
      }
      const byKey = new Map(rows.map((row) => [row.scientific_name_key, row]));
      return keys.flatMap((key) => {
        const row = byKey.get(key);
        return row ? [toRecord(row)] : [];
      });
    },

    async getRecord(id) {
      const { data, error } = await client.from("plant_species").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new PlantStoreError("getRecord", { cause: error });
      return data ? toRecord(data as Row) : null;
    },

    async getCare(id) {
      const { data, error } = await client
        .from("species_care")
        .select("field, value")
        .eq("species_id", id)
        .eq("source", "perenual");
      if (error || !data) throw new PlantStoreError("getCare", { cause: error });
      return toCare(data as { field: string; value: unknown }[]);
    },

    async saveKoreanName(id, answer) {
      const update: Record<string, unknown> = { korean_name_checked_at: new Date().toISOString() };
      if (answer.trefleId !== null) update.trefle_id = answer.trefleId;
      if (answer.koreanName) {
        update.korean_name = answer.koreanName;
        update.korean_name_source = "trefle";
      }
      // Only rows without a Korean name yet: a stored name is never replaced.
      const { error } = await client.from("plant_species").update(update).eq("id", id).is("korean_name", null);
      if (error) throw new PlantStoreError("saveKoreanName", { cause: error });
    },

    async saveCare(id, answer) {
      const now = new Date().toISOString();
      if (answer.care) {
        const rows = careRows(id, answer.care, now);
        if (rows.length > 0) {
          const { error } = await client
            .from("species_care")
            .upsert(rows, { onConflict: "species_id,field,source,user_id", ignoreDuplicates: true });
          if (error) throw new PlantStoreError("saveCare values", { cause: error });
        }
      }
      const update: Record<string, unknown> = { care_status: answer.status, care_checked_at: now };
      if (answer.perenualId !== null) update.perenual_id = answer.perenualId;
      const { error } = await client.from("plant_species").update(update).eq("id", id);
      if (error) throw new PlantStoreError("saveCare status", { cause: error });
    },
  };
}

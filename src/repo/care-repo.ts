import "server-only";
import {
  CARE_ACTIONS,
  SOIL_STATES,
  type CareAction,
  type CareActionCode,
  type CareRecordSummary,
  type SoilStateCode,
} from "@/types/care";
import { PlantStoreError } from "./plant-repo";
import { planPendingCleanup } from "./pot-photo-repo";
import type { SupabaseServerClient } from "./supabase-client";

/**
 * S08 관리 기록 (care_records with their care_logs, plant_observations and
 * care_record_photos). Runs as the signed-in user; RLS and the
 * (plant_id, user_id) foreign keys keep every row to the user's own pots.
 * Reads throw on a failed query; the save answers null so the service can
 * remove the files it uploaded.
 */

/** What save_care_record() takes (20261126100000_care_record_save.sql). */
export type CareRecordRow = {
  recorded_at: string;
  notes: string | null;
  actions: { type: CareActionCode; amount_ml: number | null; notes: string | null }[];
  observation: { soil_state: SoilStateCode | null; notes: string | null } | null;
};

export type StoredCareRecord = {
  id: string;
  recordedAt: string;
  notes: string | null;
  actions: CareAction[];
  soilState: SoilStateCode | null;
  observation: string | null;
  photoPaths: { id: string; path: string }[];
};

export type SavedRecordRef = { recordId: string; potId: string };

export type CareStore = {
  /** The record already saved with this form key, or null. Throws when the lookup fails. */
  findByKey(idempotencyKey: string): Promise<SavedRecordRef | null>;
  /** Records the paths about to be uploaded as 'pending' clean-up. False when that failed. */
  planCleanup(requestId: string, paths: string[]): Promise<boolean>;
  /**
   * Stores the record, its logs, observation, photo rows and links in one
   * transaction. `created` is false when the same form was saved before.
   * Null when the database refused.
   */
  save(
    potId: string,
    row: CareRecordRow,
    photoPaths: string[],
    keys: { idempotencyKey: string; cleanupRequest: string | null },
  ): Promise<(SavedRecordRef & { created: boolean }) | null>;
  /** The newest records of a pot, newest first. */
  list(potId: string, limit: number): Promise<CareRecordSummary[]>;
  /** One record of this pot with its photo paths, or null when there is none. */
  get(potId: string, recordId: string): Promise<StoredCareRecord | null>;
};

type RecordRow = { id: string; recorded_at: string; notes: string | null };
type LogRow = { record_id: string; care_type: string; amount: number | string | null; notes: string | null };
type ObservationRow = { record_id: string; soil_state: string | null; notes: string | null };
type LinkRow = { record_id: string; photo_id: string };

const ACTION_ORDER: readonly string[] = CARE_ACTIONS.map((action) => action.code);
const SOIL_CODES: readonly string[] = SOIL_STATES.map((state) => state.code);

const soilOf = (value: string | null | undefined): SoilStateCode | null =>
  value && SOIL_CODES.includes(value) ? (value as SoilStateCode) : null;

function actionsOf(logs: LogRow[]): CareAction[] {
  return logs
    .filter((log) => ACTION_ORDER.includes(log.care_type))
    .sort((a, b) => ACTION_ORDER.indexOf(a.care_type) - ACTION_ORDER.indexOf(b.care_type))
    .map((log) => ({
      type: log.care_type as CareActionCode,
      amountMl: log.amount === null ? null : Number(log.amount),
      notes: log.notes ?? "",
    }));
}

const byRecord = <T extends { record_id: string }>(rows: T[], id: string) => rows.filter((row) => row.record_id === id);

export function supabaseCareStore(client: SupabaseServerClient): CareStore {
  /** The logs, observations and photo links of these records, in three queries. */
  async function partsOf(recordIds: string[]) {
    const [logs, observations, links] = await Promise.all([
      client.from("care_logs").select("record_id, care_type, amount, notes").in("record_id", recordIds),
      client.from("plant_observations").select("record_id, soil_state, notes").in("record_id", recordIds),
      client.from("care_record_photos").select("record_id, photo_id").in("record_id", recordIds),
    ]);
    if (logs.error || observations.error || links.error) {
      throw new PlantStoreError("careRecordParts", { cause: logs.error ?? observations.error ?? links.error });
    }
    return {
      logs: (logs.data ?? []) as LogRow[],
      observations: (observations.data ?? []) as ObservationRow[],
      links: (links.data ?? []) as LinkRow[],
    };
  }

  return {
    async findByKey(idempotencyKey) {
      const { data, error } = await client
        .from("care_records")
        .select("id, plant_id")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (error) throw new PlantStoreError("findCareRecord", { cause: error });
      const row = data as { id: string; plant_id: string } | null;
      return row ? { recordId: row.id, potId: row.plant_id } : null;
    },

    planCleanup: (requestId, paths) => planPendingCleanup(client, requestId, paths),

    async save(potId, row, photoPaths, keys) {
      const { data, error } = await client.rpc("save_care_record", {
        p_plant_id: potId,
        p_record: row,
        p_photo_paths: photoPaths,
        p_idempotency_key: keys.idempotencyKey,
        p_cleanup_request: keys.cleanupRequest,
      });
      const saved = (data as { record_id: string; plant_id: string; created: boolean }[] | null)?.[0];
      return error || !saved ? null : { recordId: saved.record_id, potId: saved.plant_id, created: saved.created };
    },

    async list(potId, limit) {
      const { data, error } = await client
        .from("care_records")
        .select("id, recorded_at, notes")
        .eq("plant_id", potId)
        .order("recorded_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error || !data) throw new PlantStoreError("listCareRecords", { cause: error });
      const records = data as RecordRow[];
      if (records.length === 0) return [];
      const parts = await partsOf(records.map((record) => record.id));
      return records.map((record) => {
        const observation = byRecord(parts.observations, record.id)[0];
        return {
          id: record.id,
          recordedAt: record.recorded_at,
          actions: actionsOf(byRecord(parts.logs, record.id)).map((action) => action.type),
          soilState: soilOf(observation?.soil_state),
          hasObservation: Boolean(observation?.notes),
          photoCount: byRecord(parts.links, record.id).length,
          hasNotes: Boolean(record.notes),
        };
      });
    },

    async get(potId, recordId) {
      const { data, error } = await client
        .from("care_records")
        .select("id, recorded_at, notes")
        .eq("plant_id", potId)
        .eq("id", recordId)
        .maybeSingle();
      if (error) throw new PlantStoreError("getCareRecord", { cause: error });
      if (!data) return null;
      const record = data as RecordRow;
      const parts = await partsOf([record.id]);

      const ids = parts.links.map((link) => link.photo_id);
      let photoPaths: { id: string; path: string }[] = [];
      if (ids.length > 0) {
        const photos = await client.from("plant_photos").select("id, storage_path, created_at").in("id", ids).order("created_at");
        if (photos.error) throw new PlantStoreError("getCareRecordPhotos", { cause: photos.error });
        photoPaths = (photos.data as { id: string; storage_path: string }[]).map((photo) => ({ id: photo.id, path: photo.storage_path }));
      }

      const observation = parts.observations[0];
      return {
        id: record.id,
        recordedAt: record.recorded_at,
        notes: record.notes,
        actions: actionsOf(parts.logs),
        soilState: soilOf(observation?.soil_state),
        observation: observation?.notes ?? null,
        photoPaths,
      };
    },
  };
}

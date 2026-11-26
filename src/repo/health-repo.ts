import "server-only";
import {
  NOTICED,
  SYMPTOMS,
  type AiJudgement,
  type HealthCandidate,
  type HealthExplanation,
  type NoticedCode,
  type SavedHealthSummary,
  type SymptomCode,
} from "@/types/health";
import { PlantStoreError } from "./plant-repo";
import type { SupabaseServerClient } from "./supabase-client";

/**
 * Saved health checks (S07-S, S06). Runs as the signed-in user; RLS and the
 * (plant_id, user_id) foreign keys keep every row to the user's own pots.
 * Reads throw on a failed query; the save answers null so the service can
 * remove the files it uploaded.
 */

/** What save_health_check() stores (20261124100000_health_check_save.sql). */
export type HealthCheckRow = {
  outcome: "found" | "unclear";
  causes: HealthCandidate[];
  symptoms: SymptomCode[];
  noticed: NoticedCode;
  notes: string | null;
  analyzed_at: string;
  uncertainty: string;
  ai_explanation: Omit<HealthExplanation, "model"> | null;
  ai_judgement: Omit<AiJudgement, "model"> | null;
  ai_model: string | null;
};

export type StoredHealthCheck = SavedHealthSummary & {
  symptoms: SymptomCode[];
  noticed: NoticedCode;
  notes: string | null;
  causes: HealthCandidate[];
  aiExplanation: Omit<HealthExplanation, "model"> | null;
  aiJudgement: Omit<AiJudgement, "model"> | null;
  aiModel: string | null;
  photoPaths: { id: string; path: string }[];
};

export type SavedRef = { checkId: string; potId: string };

export type HealthStore = {
  /** The check already saved for this result (by result digest), or null. Throws when the lookup fails. */
  findByDigest(resultDigest: string): Promise<SavedRef | null>;
  /**
   * Records the paths about to be uploaded as 'pending' clean-up under
   * `requestId` (PR #26 review P2). False when that could not be written.
   */
  planCleanup(requestId: string, paths: string[]): Promise<boolean>;
  /**
   * Stores the check, its photo rows and links in one transaction and drops
   * the clean-up record. `created` is false when the same result was saved
   * before; nothing new is stored then. Null when the database refused.
   */
  save(
    potId: string,
    row: HealthCheckRow,
    photoPaths: string[],
    keys: { resultDigest: string; cleanupRequest: string },
  ): Promise<(SavedRef & { created: boolean }) | null>;
  /** The newest checks of a pot, newest first. */
  list(potId: string, limit: number): Promise<SavedHealthSummary[]>;
  /** One check of this pot with its photo paths, or null when there is none. */
  get(potId: string, checkId: string): Promise<StoredHealthCheck | null>;
};

type AnalysisRow = {
  id: string;
  analyzed_at: string;
  outcome: string;
  candidate_causes: unknown;
  symptoms: unknown;
  noticed: string;
  notes: string | null;
  ai_explanation: unknown;
  ai_judgement: unknown;
  ai_model: string | null;
};

const SYMPTOM_CODES: readonly string[] = SYMPTOMS.map((symptom) => symptom.code);
const NOTICED_CODES: readonly string[] = NOTICED.map((option) => option.code);

function causesOf(value: unknown): HealthCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const cause = item as Partial<HealthCandidate> | null;
    return typeof cause?.code === "string" && typeof cause.name === "string" && typeof cause.score === "number"
      ? [{ code: cause.code, name: cause.name, score: cause.score }]
      : [];
  });
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function explanationOf(value: unknown): Omit<HealthExplanation, "model"> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const causes = Array.isArray(raw.causes)
    ? raw.causes.flatMap((item) => {
        const cause = item as { code?: unknown; text?: unknown } | null;
        return typeof cause?.code === "string" && typeof cause.text === "string" ? [{ code: cause.code, text: cause.text }] : [];
      })
    : [];
  return { causes, checks: strings(raw.checks), actions: strings(raw.actions) };
}

function judgementOf(value: unknown): Omit<AiJudgement, "model"> | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const causes = Array.isArray(raw.causes)
    ? raw.causes.flatMap((item) => {
        const cause = item as { name?: unknown; reason?: unknown } | null;
        return typeof cause?.name === "string" && typeof cause.reason === "string" ? [{ name: cause.name, reason: cause.reason }] : [];
      })
    : [];
  return { signs: strings(raw.signs), causes, checks: strings(raw.checks), actions: strings(raw.actions) };
}

function summaryOf(row: AnalysisRow): SavedHealthSummary {
  const causes = causesOf(row.candidate_causes);
  return {
    id: row.id,
    analyzedAt: row.analyzed_at,
    outcome: row.outcome === "unclear" ? "unclear" : "found",
    topCause: causes[0]?.name ?? null,
    hasAi: row.ai_explanation !== null || row.ai_judgement !== null,
  };
}

const COLUMNS = "id, analyzed_at, outcome, candidate_causes, symptoms, noticed, notes, ai_explanation, ai_judgement, ai_model";

export function supabaseHealthStore(client: SupabaseServerClient): HealthStore {
  return {
    async findByDigest(resultDigest) {
      const { data, error } = await client
        .from("plant_analyses")
        .select("id, plant_id")
        .eq("result_digest", resultDigest)
        .maybeSingle();
      if (error) throw new PlantStoreError("findHealthCheck", { cause: error });
      const row = data as { id: string; plant_id: string } | null;
      return row ? { checkId: row.id, potId: row.plant_id } : null;
    },

    async planCleanup(requestId, paths) {
      const { error } = await client
        .from("storage_deletions")
        .insert(paths.map((path) => ({ deletion_request_id: requestId, storage_path: path, status: "pending" })));
      return !error;
    },

    async save(potId, row, photoPaths, keys) {
      const { data, error } = await client.rpc("save_health_check", {
        p_plant_id: potId,
        p_analysis: row,
        p_photo_paths: photoPaths,
        p_result_digest: keys.resultDigest,
        p_cleanup_request: keys.cleanupRequest,
      });
      const saved = (data as { analysis_id: string; plant_id: string; created: boolean }[] | null)?.[0];
      return error || !saved ? null : { checkId: saved.analysis_id, potId: saved.plant_id, created: saved.created };
    },

    async list(potId, limit) {
      const { data, error } = await client
        .from("plant_analyses")
        .select(COLUMNS)
        .eq("plant_id", potId)
        .order("analyzed_at", { ascending: false })
        .limit(limit);
      if (error || !data) throw new PlantStoreError("listHealthChecks", { cause: error });
      return (data as AnalysisRow[]).map(summaryOf);
    },

    async get(potId, checkId) {
      const { data, error } = await client
        .from("plant_analyses")
        .select(COLUMNS)
        .eq("plant_id", potId)
        .eq("id", checkId)
        .maybeSingle();
      if (error) throw new PlantStoreError("getHealthCheck", { cause: error });
      if (!data) return null;
      const row = data as AnalysisRow;

      const links = await client.from("analysis_photos").select("photo_id").eq("analysis_id", checkId);
      if (links.error) throw new PlantStoreError("getHealthCheckPhotos", { cause: links.error });
      const ids = (links.data as { photo_id: string }[]).map((link) => link.photo_id);
      let photoPaths: { id: string; path: string }[] = [];
      if (ids.length > 0) {
        const photos = await client.from("plant_photos").select("id, storage_path, created_at").in("id", ids).order("created_at");
        if (photos.error) throw new PlantStoreError("getHealthCheckPhotos", { cause: photos.error });
        photoPaths = (photos.data as { id: string; storage_path: string }[]).map((photo) => ({ id: photo.id, path: photo.storage_path }));
      }

      return {
        ...summaryOf(row),
        symptoms: strings(row.symptoms).filter((code): code is SymptomCode => SYMPTOM_CODES.includes(code)),
        noticed: (NOTICED_CODES.includes(row.noticed) ? row.noticed : "unknown") as NoticedCode,
        notes: row.notes,
        causes: causesOf(row.candidate_causes),
        aiExplanation: explanationOf(row.ai_explanation),
        aiJudgement: judgementOf(row.ai_judgement),
        aiModel: row.ai_model,
        photoPaths,
      };
    },
  };
}

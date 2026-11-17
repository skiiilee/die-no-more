import { vi } from "vitest";
import type { IdentificationStore, SessionStatus } from "@/repo/identification-repo";
import type { PhotoStore } from "@/repo/photo-repo";
import type { IdentifyResult, PlantnetAdapter } from "@/service/adapters/plantnet";
import type { StoredCandidate } from "@/types/photo";

/** Test doubles for photo upload and identification. */

export function fakePhotoStore(options: { photos?: Record<string, Uint8Array>; failRead?: boolean } = {}) {
  const photos = new Map(Object.entries(options.photos ?? {}));
  let counter = 0;
  return {
    saveUnattached: vi.fn(async (bytes: Uint8Array) => {
      const id = `40000000-0000-0000-0000-00000000000${counter++}`;
      photos.set(id, bytes);
      return { id };
    }),
    deleteUnattached: vi.fn(async (id: string) => photos.delete(id)),
    readIdentificationPhotos: vi.fn(async (ids: string[]) => {
      if (options.failRead) throw new Error("storage down");
      return ids.every((id) => photos.has(id)) ? ids.map((id) => photos.get(id)!) : null;
    }),
    removeUnattachedBefore: vi.fn(async () => 0),
  } satisfies PhotoStore;
}

export function fakeSessions(options: { failCreate?: boolean; failComplete?: boolean } = {}) {
  const sessions = new Map<string, { id: string; status: SessionStatus; candidates: unknown; errorCode?: string; version?: string | null }>();
  let counter = 0;
  return {
    sessions,
    create: vi.fn(async () => {
      if (options.failCreate) throw new Error("insert failed");
      const id = `50000000-0000-0000-0000-00000000000${counter++}`;
      sessions.set(id, { id, status: "processing", candidates: [] });
      return id;
    }),
    complete: vi.fn(async (id: string, candidates: StoredCandidate[], version: string | null) => {
      if (options.failComplete) throw new Error("update failed");
      sessions.set(id, { id, status: "completed", candidates, version });
    }),
    fail: vi.fn(async (id: string, errorCode: string) => {
      sessions.set(id, { id, status: "failed", candidates: [], errorCode });
    }),
    get: vi.fn(async (id: string) => sessions.get(id) ?? null),
  } satisfies IdentificationStore & { sessions: unknown };
}

export function fakePlantnet(result: IdentifyResult) {
  return { identify: vi.fn(async () => result) } satisfies PlantnetAdapter;
}

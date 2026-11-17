import { vi } from "vitest";
import type { IdentificationStore, SessionStatus } from "@/repo/identification-repo";
import type { ImageProcessor } from "@/service/adapters/image";
import type { IdentifyResult, PlantnetAdapter } from "@/service/adapters/plantnet";
import type { StoredCandidate } from "@/types/photo";

/** Test doubles for photo identification. */

/** Re-encoding stand-in: marks each photo as cleaned so tests can tell. */
export function fakeImageProcessor(options: { unreadable?: boolean } = {}) {
  return {
    toCleanJpeg: vi.fn(async (bytes: Uint8Array) =>
      options.unreadable
        ? { ok: false as const }
        : { ok: true as const, bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xdb, ...bytes.slice(3)]) },
    ),
  } satisfies ImageProcessor;
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

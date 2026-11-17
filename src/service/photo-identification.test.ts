import { describe, expect, it, vi } from "vitest";
import type { IdentifiedSpecies } from "@/types/photo";
import type { IdentifyResult } from "./adapters/plantnet";
import { identifyPhotos, loadIdentification, parseStoredCandidates, PHOTO_COUNT_MESSAGE, type IdentifyDeps } from "./photo-identification";
import { fakePhotoStore, fakePlantnet, fakeSessions } from "../../tests/fakes/photos";
import { fakeSpeciesStore } from "../../tests/fakes/species";

const P1 = "40000000-0000-0000-0000-000000000001";
const P2 = "40000000-0000-0000-0000-000000000002";
const BYTES = new Uint8Array([0xff, 0xd8, 0xff]);

const MONSTERA: IdentifiedSpecies = {
  score: 0.88453,
  scientificName: "Monstera deliciosa",
  commonNameEn: "Monstera",
  family: "Araceae",
  imageUrl: "https://bs.plantnet.org/image/m/6c79",
  imageCredit: "Soynano Gallego / Pl@ntNet, cc-by-sa",
};
const PHILODENDRON: IdentifiedSpecies = {
  score: 0.0159,
  scientificName: "Philodendron bipinnatifidum",
  commonNameEn: null,
  family: "Araceae",
  imageUrl: null,
  imageCredit: null,
};
const FOUND: IdentifyResult = { kind: "ok", species: [MONSTERA, PHILODENDRON], version: "2026-03-20 (7.5)" };

function deps(result: IdentifyResult = FOUND, overrides: Partial<IdentifyDeps> = {}) {
  const base = {
    photos: fakePhotoStore({ photos: { [P1]: BYTES, [P2]: BYTES } }),
    sessions: fakeSessions(),
    species: fakeSpeciesStore(),
    plantnet: fakePlantnet(result),
    now: () => new Date("2026-11-17T06:00:00Z"),
  };
  return { ...base, ...overrides } as typeof base;
}

describe("identifyPhotos: consent and input (ADR-0003 D5)", () => {
  it("sends nothing and reads nothing without this request's consent", async () => {
    for (const consent of [undefined, false, "true", 1]) {
      const d = deps();
      expect(await identifyPhotos(d, { photoIds: [P1], consent })).toEqual({ kind: "consent_required" });
      expect(d.photos.readIdentificationPhotos).not.toHaveBeenCalled();
      expect(d.plantnet.identify).not.toHaveBeenCalled();
      expect(d.sessions.create).not.toHaveBeenCalled();
    }
  });

  it("accepts 1–5 distinct photo ids only", async () => {
    const six = Array.from({ length: 6 }, (_, i) => `40000000-0000-0000-0000-00000000001${i}`);
    for (const photoIds of [[], six, [P1, P1], ["not-a-uuid"], "P1", null]) {
      const d = deps();
      expect(await identifyPhotos(d, { photoIds, consent: true })).toEqual({ kind: "invalid", message: PHOTO_COUNT_MESSAGE });
      expect(d.plantnet.identify).not.toHaveBeenCalled();
    }
  });

  it("says the photos are gone when one was deleted or expired, without calling Pl@ntNet", async () => {
    const d = deps(FOUND, { photos: fakePhotoStore({ photos: { [P1]: BYTES } }) });
    expect(await identifyPhotos(d, { photoIds: [P1, P2], consent: true })).toEqual({ kind: "photos_missing" });
    expect(d.plantnet.identify).not.toHaveBeenCalled();
    expect(d.sessions.create).not.toHaveBeenCalled();
  });

  it("is unavailable when Pl@ntNet is not configured", async () => {
    expect(await identifyPhotos(deps(FOUND, { plantnet: null }), { photoIds: [P1], consent: true })).toEqual({
      kind: "unavailable",
    });
  });

  it("does not call Pl@ntNet when the session cannot be recorded first", async () => {
    const d = deps(FOUND, { sessions: fakeSessions({ failCreate: true }) });
    expect(await identifyPhotos(d, { photoIds: [P1], consent: true })).toEqual({ kind: "failed" });
    expect(d.plantnet.identify).not.toHaveBeenCalled();
  });
});

describe("identifyPhotos: results", () => {
  it("sends the stored photos in order, stores candidates in the plant DB and the ranked list in the session", async () => {
    const d = deps();
    const answer = await identifyPhotos(d, { photoIds: [P1, P2], consent: true });
    expect(answer).toEqual({ kind: "ok", sessionId: expect.any(String) });
    expect(d.plantnet.identify).toHaveBeenCalledWith([BYTES, BYTES]);
    expect(d.species.saveFound).toHaveBeenCalledWith([
      expect.objectContaining({ scientificNameKey: "monstera deliciosa", source: "plantnet", imageCredit: MONSTERA.imageCredit }),
      expect.objectContaining({ scientificNameKey: "philodendron bipinnatifidum", source: "plantnet" }),
    ]);
    const session = d.sessions.sessions.get((answer as { sessionId: string }).sessionId)!;
    expect(session).toMatchObject({ status: "completed", version: "2026-03-20 (7.5)" });
    expect(session.candidates).toEqual([
      expect.objectContaining({ rank: 1, score: 0.88453, scientificName: "Monstera deliciosa", provider: "plantnet", fetchedAt: "2026-11-17T06:00:00.000Z" }),
      expect.objectContaining({ rank: 2, score: 0.0159, scientificName: "Philodendron bipinnatifidum" }),
    ]);
  });

  it("records 'no match' as a completed session with no candidates", async () => {
    const d = deps({ kind: "none" });
    const answer = await identifyPhotos(d, { photoIds: [P1], consent: true });
    expect(answer.kind).toBe("ok");
    expect(d.species.saveFound).not.toHaveBeenCalled();
    expect([...d.sessions.sessions.values()][0]).toMatchObject({ status: "completed", candidates: [] });
  });

  it("records quota, rejected photos and outages as a failed session and says which", async () => {
    for (const kind of ["quota", "rejected", "unavailable"] as const) {
      const d = deps({ kind });
      expect(await identifyPhotos(d, { photoIds: [P1], consent: true })).toEqual({ kind });
      expect([...d.sessions.sessions.values()][0]).toMatchObject({ status: "failed", errorCode: kind });
      // The photos stay, so S03-P can try again without uploading them again.
      expect(d.photos.deleteUnattached).not.toHaveBeenCalled();
    }
  });

  it("fails, and marks the session failed, when the results cannot be stored", async () => {
    const species = fakeSpeciesStore();
    species.saveFound.mockRejectedValue(new Error("write failed"));
    const d = deps(FOUND, { species });
    expect(await identifyPhotos(d, { photoIds: [P1], consent: true })).toEqual({ kind: "failed" });
    expect([...d.sessions.sessions.values()][0]).toMatchObject({ status: "failed", errorCode: "save_failed" });
  });

  it("keeps one candidate per scientific-name key (D10)", async () => {
    const d = deps({ kind: "ok", species: [MONSTERA, { ...MONSTERA, scientificName: "monstera  Deliciosa", score: 0.1 }], version: null });
    await identifyPhotos(d, { photoIds: [P1], consent: true });
    expect(d.species.saveFound.mock.calls[0][0]).toHaveLength(1);
  });
});

describe("loadIdentification (S04-A)", () => {
  it("shows ranked candidates with the current Korean name and the credited photo, never the score", async () => {
    const d = deps();
    const { sessionId } = (await identifyPhotos(d, { photoIds: [P1], consent: true })) as { sessionId: string };
    const stored = await d.species.saveFound.mock.results[0].value;
    stored.records[0].koreanName = "몬스테라";

    const view = await loadIdentification(d, sessionId);
    expect(view).toEqual({
      kind: "completed",
      sessionId,
      candidates: [
        {
          rank: 1,
          speciesId: stored.records[0].id,
          koreanName: "몬스테라",
          scientificName: "Monstera deliciosa",
          imageUrl: MONSTERA.imageUrl,
          imageCredit: MONSTERA.imageCredit,
        },
        expect.objectContaining({ rank: 2, scientificName: "Philodendron bipinnatifidum", imageUrl: null, imageCredit: null }),
      ],
    });
    expect(JSON.stringify(view)).not.toContain("0.88");
  });

  it("returns null for a session that is not the user's, and the status of an unfinished one", async () => {
    const d = deps({ kind: "quota" });
    expect(await loadIdentification(d, "50000000-0000-0000-0000-000000000099")).toBeNull();
    await identifyPhotos(d, { photoIds: [P1], consent: true });
    expect(await loadIdentification(d, "50000000-0000-0000-0000-000000000000")).toEqual({
      kind: "failed",
      sessionId: "50000000-0000-0000-0000-000000000000",
    });
  });

  it("skips stored candidates that are not the expected shape", () => {
    expect(parseStoredCandidates([{ rank: 1 }, null, "x", { rank: 2, speciesId: "s", scientificName: "A b" }])).toEqual([
      expect.objectContaining({ rank: 2, speciesId: "s", imageUrl: null, imageCredit: null }),
    ]);
    expect(parseStoredCandidates({})).toEqual([]);
  });
});

describe("markFailed", () => {
  it("still answers the provider's failure when the session update itself fails", async () => {
    const sessions = fakeSessions();
    sessions.fail.mockRejectedValue(new Error("down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await identifyPhotos(deps({ kind: "quota" }, { sessions }), { photoIds: [P1], consent: true })).toEqual({ kind: "quota" });
    error.mockRestore();
  });
});

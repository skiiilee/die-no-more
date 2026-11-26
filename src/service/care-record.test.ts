import { describe, expect, it, vi } from "vitest";
import type { CareInput } from "@/types/care";
import { fakeImageProcessor } from "../../tests/fakes/photos";
import { CARE_MESSAGES, readCareInput, recordRow, saveCareRecord, type CareFields, type CareSaveDeps } from "./care-record";

const USER = "00000000-0000-0000-0000-00000000000a";
const POT = "20000000-0000-0000-0000-00000000000a";
const RECORD = "50000000-0000-0000-0000-0000000000c1";
const KEY = "60000000-0000-0000-0000-0000000000f1";
const P1 = new Uint8Array([0xff, 0xd8, 0xff, 1]);
const P2 = new Uint8Array([0xff, 0xd8, 0xff, 2]);
// 2026-11-26 15:00 in Korea.
const NOW = new Date("2026-11-26T06:00:00Z");

const fields = (overrides: Partial<CareFields> = {}): CareFields => ({
  potId: POT,
  recordedAt: "2026-11-26T14:30",
  actions: [],
  waterMl: null,
  actionNotes: {},
  soilState: null,
  observation: null,
  notes: null,
  ...overrides,
});

const read = (overrides: Partial<CareFields> = {}) => readCareInput(fields(overrides), NOW);

describe("readCareInput (S08)", () => {
  it("reads the date and time as Korean time and keeps only ticked activities", () => {
    const result = read({
      actions: ["water", "prune", "dance"],
      waterMl: " 300 ",
      actionNotes: { prune: " 아래 잎 정리 ", fertilize: "체크 안 함" },
      soilState: "dry",
      observation: "  새 잎 ",
      notes: "",
    });
    expect(result).toEqual({
      ok: true,
      input: {
        potId: POT,
        recordedAt: "2026-11-26T05:30:00.000Z",
        actions: [
          { type: "water", amountMl: 300, notes: "" },
          { type: "prune", amountMl: null, notes: "아래 잎 정리" },
        ],
        soilState: "dry",
        observation: "새 잎",
        notes: "",
      },
    });
  });

  it("takes watering without an amount, and ignores an amount without watering", () => {
    const watered = read({ actions: ["water"], waterMl: "" });
    expect(watered.ok && watered.input.actions).toEqual([{ type: "water", amountMl: null, notes: "" }]);
    const notWatered = read({ waterMl: "abc", soilState: "moist" });
    expect(notWatered.ok && notWatered.input.actions).toEqual([]);
  });

  it("refuses a missing pot, a bad, future or too old time, and a bad amount", () => {
    expect(read({ potId: "" })).toEqual({ ok: false, message: CARE_MESSAGES.noPot });
    expect(read({ recordedAt: "2026-11-26" })).toEqual({ ok: false, message: CARE_MESSAGES.time });
    expect(read({ recordedAt: "2026-13-40T99:99" })).toEqual({ ok: false, message: CARE_MESSAGES.time });
    expect(read({ recordedAt: "2026-11-26T15:30" })).toEqual({ ok: false, message: CARE_MESSAGES.future });
    expect(read({ recordedAt: "2026-11-26T15:05" }).ok).toBe(true);
    expect(read({ recordedAt: "2025-11-01T10:00" })).toEqual({ ok: false, message: CARE_MESSAGES.tooOld });
    for (const amount of ["0", "-1", "1.5", "10001", "많이"]) {
      expect(read({ actions: ["water"], waterMl: amount })).toEqual({ ok: false, message: CARE_MESSAGES.water });
    }
  });

  it("refuses text over its limit and an unknown soil state counts as none", () => {
    expect(read({ actions: ["repot"], actionNotes: { repot: "가".repeat(201) } })).toEqual({ ok: false, message: CARE_MESSAGES.actionNotes });
    expect(read({ observation: "가".repeat(501) })).toEqual({ ok: false, message: CARE_MESSAGES.observation });
    expect(read({ notes: "가".repeat(501) })).toEqual({ ok: false, message: CARE_MESSAGES.notes });
    const soil = read({ soilState: "muddy" });
    expect(soil.ok && soil.input.soilState).toBe(null);
  });
});

describe("recordRow", () => {
  it("sends an observation only when the soil state or the observation text was entered", () => {
    const base: CareInput = { potId: POT, recordedAt: "t", actions: [], soilState: null, observation: "", notes: "" };
    expect(recordRow(base).observation).toBeNull();
    expect(recordRow({ ...base, soilState: "wet" }).observation).toEqual({ soil_state: "wet", notes: null });
    expect(recordRow({ ...base, observation: "깍지벌레" }).observation).toEqual({ soil_state: null, notes: "깍지벌레" });
    expect(recordRow({ ...base, notes: "메모" }).notes).toBe("메모");
  });
});

/** newId() gives "id-1" (the clean-up request), then "id-2", "id-3"… (the photo files). */
function baseDeps() {
  let n = 0;
  return {
    image: fakeImageProcessor(),
    photos: {
      userId: vi.fn<CareSaveDeps["photos"]["userId"]>(async () => USER),
      upload: vi.fn<CareSaveDeps["photos"]["upload"]>(async () => true),
      removeObject: vi.fn<CareSaveDeps["photos"]["removeObject"]>(async () => true),
      markDeletion: vi.fn<CareSaveDeps["photos"]["markDeletion"]>(async () => undefined),
    },
    care: {
      findByKey: vi.fn<CareSaveDeps["care"]["findByKey"]>(async () => null),
      planCleanup: vi.fn<CareSaveDeps["care"]["planCleanup"]>(async () => true),
      save: vi.fn<CareSaveDeps["care"]["save"]>(async () => ({ recordId: RECORD, potId: POT, created: true })),
    },
    potExists: vi.fn(async () => true),
    newId: () => `id-${++n}`,
  };
}

function deps(overrides: Partial<ReturnType<typeof baseDeps>> = {}) {
  return { ...baseDeps(), ...overrides } satisfies CareSaveDeps;
}

const WATERED: CareInput = {
  potId: POT,
  recordedAt: "2026-11-26T05:30:00.000Z",
  actions: [{ type: "water", amountMl: 300, notes: "" }],
  soilState: "dry",
  observation: "",
  notes: "",
};
const EMPTY: CareInput = { ...WATERED, actions: [], soilState: null };

describe("saveCareRecord (S08)", () => {
  it("saves a record without photos straight away, with only what was entered", async () => {
    const d = deps();
    expect(await saveCareRecord(d, { key: KEY, input: WATERED, photos: [] })).toEqual({ kind: "saved", potId: POT, recordId: RECORD });
    expect(d.care.save).toHaveBeenCalledWith(
      POT,
      {
        recorded_at: "2026-11-26T05:30:00.000Z",
        notes: null,
        actions: [{ type: "water", amount_ml: 300, notes: null }],
        observation: { soil_state: "dry", notes: null },
      },
      [],
      { idempotencyKey: KEY, cleanupRequest: null },
    );
    expect(d.care.planCleanup).not.toHaveBeenCalled();
    expect(d.photos.upload).not.toHaveBeenCalled();
  });

  it("records the photo paths before uploading, then saves them with the record", async () => {
    const d = deps();
    expect((await saveCareRecord(d, { key: KEY, input: WATERED, photos: [P1, P2] })).kind).toBe("saved");
    const paths = [`${USER}/id-2.jpg`, `${USER}/id-3.jpg`];
    expect(d.care.planCleanup).toHaveBeenCalledWith("id-1", paths);
    expect(d.care.planCleanup.mock.invocationCallOrder[0]).toBeLessThan(d.photos.upload.mock.invocationCallOrder[0]);
    expect(d.care.save.mock.calls[0][2]).toEqual(paths);
    expect(d.care.save.mock.calls[0][3]).toEqual({ idempotencyKey: KEY, cleanupRequest: "id-1" });
    expect(d.photos.removeObject).not.toHaveBeenCalled();
  });

  it("saves photos alone, or a memo alone, but never an empty form", async () => {
    expect((await saveCareRecord(deps(), { key: KEY, input: EMPTY, photos: [P1] })).kind).toBe("saved");
    expect((await saveCareRecord(deps(), { key: KEY, input: { ...EMPTY, notes: "분무" }, photos: [] })).kind).toBe("saved");
    const d = deps();
    expect(await saveCareRecord(d, { key: KEY, input: EMPTY, photos: [] })).toEqual({ kind: "invalid", message: CARE_MESSAGES.empty });
    expect(d.care.save).not.toHaveBeenCalled();
  });

  it("answers the same form again with the record saved first, uploading nothing", async () => {
    const d = deps();
    d.care.findByKey.mockResolvedValueOnce({ recordId: RECORD, potId: POT });
    expect(await saveCareRecord(d, { key: KEY, input: WATERED, photos: [P1] })).toEqual({ kind: "saved", potId: POT, recordId: RECORD });
    expect(d.care.findByKey).toHaveBeenCalledWith(KEY);
    expect(d.photos.upload).not.toHaveBeenCalled();
    expect(d.care.save).not.toHaveBeenCalled();
  });

  it("keeps the first of two concurrent saves and removes the second one's files", async () => {
    const d = deps();
    d.care.save.mockResolvedValueOnce({ recordId: RECORD, potId: POT, created: false });
    expect(await saveCareRecord(d, { key: KEY, input: WATERED, photos: [P1] })).toEqual({ kind: "saved", potId: POT, recordId: RECORD });
    expect(d.photos.removeObject).toHaveBeenCalledWith(`${USER}/id-2.jpg`);
    expect(d.photos.markDeletion).toHaveBeenCalledWith("id-1", `${USER}/id-2.jpg`, { ok: true });
  });

  it("removes the uploaded files when the database save fails, and keeps a refused removal on record", async () => {
    const d = deps();
    d.care.save.mockResolvedValueOnce(null);
    d.photos.removeObject.mockResolvedValueOnce(false);
    expect(await saveCareRecord(d, { key: KEY, input: WATERED, photos: [P1] })).toEqual({ kind: "failed" });
    expect(d.photos.markDeletion).toHaveBeenCalledWith("id-1", `${USER}/id-2.jpg`, { ok: false, error: "unsaved care record photo" });
  });

  it("uploads nothing when the paths cannot be recorded, or a photo is unreadable", async () => {
    const unplanned = deps();
    unplanned.care.planCleanup.mockResolvedValueOnce(false);
    expect(await saveCareRecord(unplanned, { key: KEY, input: WATERED, photos: [P1] })).toEqual({ kind: "failed" });
    expect(unplanned.photos.upload).not.toHaveBeenCalled();
    expect(unplanned.care.save).not.toHaveBeenCalled();

    const unreadable = deps({ image: fakeImageProcessor({ unreadable: true }) });
    expect((await saveCareRecord(unreadable, { key: KEY, input: WATERED, photos: [P1] })).kind).toBe("invalid");
    expect(unreadable.care.planCleanup).not.toHaveBeenCalled();
  });

  it("needs a form key, at most 5 photos, and the user's own pot", async () => {
    expect(await saveCareRecord(deps(), { key: "again", input: WATERED, photos: [] })).toEqual({ kind: "invalid", message: CARE_MESSAGES.form });
    expect(await saveCareRecord(deps(), { key: KEY, input: WATERED, photos: [P1, P1, P1, P1, P1, P1] })).toEqual({
      kind: "invalid",
      message: CARE_MESSAGES.photos,
    });
    const notMine = deps({ potExists: vi.fn(async () => false) });
    expect(await saveCareRecord(notMine, { key: KEY, input: WATERED, photos: [P1] })).toEqual({ kind: "not_found" });
    expect(notMine.photos.upload).not.toHaveBeenCalled();
    const broken = deps({ potExists: vi.fn(async () => Promise.reject(new Error("db"))) });
    expect(await saveCareRecord(broken, { key: KEY, input: WATERED, photos: [] })).toEqual({ kind: "failed" });
  });
});

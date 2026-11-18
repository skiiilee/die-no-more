import type { PlantStore } from "@/repo/plant-repo";
import {
  plantName,
  type PlantIdentity,
  type RegisterFormState,
  type RegistrationValues,
  type ReminderOptions,
  type SpeciesSummary,
} from "@/types/plant";
import { parseIdentity, parseRegistration, reminderOptions, type RawInput } from "./plant-registration";
import { attachPotPhoto, cleanPotPhoto, type PhotoDeps } from "./pot-photos";

/** What S05 needs before the form is shown. */
export type RegistrationContext =
  | {
      ok: true;
      identity: PlantIdentity;
      species: SpeciesSummary | null;
      /** "식물 이름" line in S05. */
      plantName: string;
      reminders: ReminderOptions;
    }
  | { ok: false; message: string };

/**
 * Checks the identity carried into S05. A species id must exist in the plant
 * DB; manual and unknown entries have no API care data, so no reminders.
 * A failed species lookup throws (the screen offers a retry), unlike a
 * species that is not in the DB.
 */
export async function loadRegistrationContext(
  store: Pick<PlantStore, "getSpecies" | "getReminderData">,
  input: RawInput,
  remindersEnabled: boolean,
): Promise<RegistrationContext> {
  const parsed = parseIdentity(input);
  if (!parsed.ok) return parsed;
  const { identity } = parsed;

  if (identity.kind === "species") {
    const species = await store.getSpecies(identity.speciesId);
    if (!species) return { ok: false, message: "선택한 식물 정보를 찾을 수 없습니다. 다시 검색해 주세요." };
    // Reminder choices follow the species' stored Perenual data (S04-B saved it).
    const care = remindersEnabled ? await store.getReminderData(species.id) : null;
    return {
      ok: true,
      identity,
      species,
      plantName: plantName({ species, userEnteredName: null }),
      reminders: reminderOptions(remindersEnabled, care),
    };
  }

  return {
    ok: true,
    identity,
    species: null,
    plantName: plantName({ species: null, userEnteredName: identity.kind === "manual" ? identity.name : null }),
    reminders: reminderOptions(remindersEnabled, null),
  };
}

const ECHO_FIELDS = [
  "nickname",
  "location",
  "environment",
  "lastWatered",
  "lightLevel",
  "lastRepotted",
  "potMaterial",
  "memo",
  "waterReminder",
  "fertilizerReminder",
] as const;

function echo(input: RawInput): RegistrationValues {
  const values: RegistrationValues = {};
  for (const field of ECHO_FIELDS) {
    const value = input[field];
    if (typeof value === "string") values[field] = value;
  }
  return values;
}

/** The optional S05 photo: the picked bytes and what is needed to store them. */
export type RegistrationPhoto = { bytes: Uint8Array; deps: PhotoDeps };

/**
 * S05 [식물 추가하기]. Re-checks the identity and the offered reminders on the
 * server (the form is never trusted), then stores the pot. On any failure the
 * user's input is echoed back so nothing typed is lost.
 *
 * The optional photo is checked together with the fields, before anything is
 * stored. It is uploaded after the pot is saved; if that fails the pot stays
 * saved (the photo is optional) and `photo` says so, so S06 can offer
 * [사진 추가] again.
 */
export async function registerPot(
  store: Pick<PlantStore, "getSpecies" | "getReminderData" | "insertPot">,
  input: RawInput,
  remindersEnabled: boolean,
  photo: RegistrationPhoto | null = null,
): Promise<{ ok: true; id: string; photo: "none" | "saved" | "failed" } | { ok: false; state: RegisterFormState }> {
  const values = echo(input);
  const saveFailed = { ok: false as const, state: { status: "save_failed" as const, errors: {}, values } };
  let context: RegistrationContext;
  try {
    context = await loadRegistrationContext(store, input, remindersEnabled);
  } catch {
    // The species lookup failed (not "species missing"): keep the input, offer a retry.
    return saveFailed;
  }
  if (!context.ok) {
    return { ok: false, state: { status: "invalid", errors: { identity: context.message }, values } };
  }

  const parsed = parseRegistration(input, context.reminders);
  const cleaned = photo ? await cleanPotPhoto(photo.deps.image, photo.bytes) : null;
  const photoError = cleaned && !cleaned.ok ? cleaned.message : null;
  if (!parsed.ok || photoError) {
    const errors = { ...(parsed.ok ? {} : parsed.errors), ...(photoError ? { photo: photoError } : {}) };
    return { ok: false, state: { status: "invalid", errors, values } };
  }

  let saved: Awaited<ReturnType<PlantStore["insertPot"]>>;
  try {
    saved = await store.insertPot(parsed.value);
  } catch {
    return saveFailed;
  }
  if (!saved.ok) return saveFailed;
  if (!photo || !cleaned?.ok) return { ok: true, id: saved.id, photo: "none" };
  const attached = await attachPotPhoto(photo.deps, saved.id, cleaned.jpeg).catch(() => false);
  return { ok: true, id: saved.id, photo: attached ? "saved" : "failed" };
}

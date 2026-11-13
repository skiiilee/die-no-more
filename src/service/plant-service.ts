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
 */
export async function loadRegistrationContext(
  store: Pick<PlantStore, "getSpecies">,
  input: RawInput,
  remindersEnabled: boolean,
): Promise<RegistrationContext> {
  const parsed = parseIdentity(input);
  if (!parsed.ok) return parsed;
  const { identity } = parsed;

  if (identity.kind === "species") {
    const species = await store.getSpecies(identity.speciesId);
    if (!species) return { ok: false, message: "선택한 식물 정보를 찾을 수 없습니다. 다시 검색해 주세요." };
    // Care data lookup arrives with the search PR; until then nothing is offered.
    return {
      ok: true,
      identity,
      species,
      plantName: plantName({ species, userEnteredName: null }),
      reminders: reminderOptions(remindersEnabled, null),
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

/**
 * S05 [식물 추가하기]. Re-checks the identity and the offered reminders on the
 * server (the form is never trusted), then stores the pot. On any failure the
 * user's input is echoed back so nothing typed is lost.
 */
export async function registerPot(
  store: Pick<PlantStore, "getSpecies" | "insertPot">,
  input: RawInput,
  remindersEnabled: boolean,
): Promise<{ ok: true; id: string } | { ok: false; state: RegisterFormState }> {
  const values = echo(input);
  const context = await loadRegistrationContext(store, input, remindersEnabled);
  if (!context.ok) {
    return { ok: false, state: { status: "invalid", errors: { identity: context.message }, values } };
  }

  const parsed = parseRegistration(input, context.reminders);
  if (!parsed.ok) return { ok: false, state: { status: "invalid", errors: parsed.errors, values } };

  const saved = await store.insertPot(parsed.value);
  if (!saved.ok) return { ok: false, state: { status: "save_failed", errors: {}, values } };
  return { ok: true, id: saved.id };
}

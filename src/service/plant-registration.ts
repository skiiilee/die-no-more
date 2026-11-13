import {
  ENVIRONMENTS,
  LAST_REPOTTED_RANGES,
  LAST_WATERED_RANGES,
  LIGHT_LEVELS,
  POT_MATERIALS,
  TEXT_LIMITS,
  type EnvironmentCode,
  type Option,
  type PlantIdentity,
  type PlantRegistration,
  type RegistrationErrors,
  type ReminderOptions,
} from "@/types/plant";

/** Raw values as they arrive from a form or URL. */
export type RawInput = Record<string, string | null | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trims and collapses whitespace; empty becomes null. */
export function cleanText(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

/**
 * Reads the identity chosen before S05 (S04-B or S05-M).
 * - `mode=species&species=<uuid>`: a species confirmed in S04-B.
 * - `mode=manual&name=<text>`: a name typed in S05-M, kept as typed.
 * - `mode=unknown`: species unknown.
 */
export function parseIdentity(input: RawInput): { ok: true; identity: PlantIdentity } | { ok: false; message: string } {
  const mode = input.mode;
  if (mode === "species") {
    const id = (input.species ?? "").trim();
    if (!UUID.test(id)) return { ok: false, message: "선택한 식물 정보를 찾을 수 없습니다. 다시 검색해 주세요." };
    return { ok: true, identity: { kind: "species", speciesId: id.toLowerCase() } };
  }
  if (mode === "manual") {
    const name = cleanText(input.name);
    if (!name) return { ok: false, message: "식물 이름을 입력해 주세요." };
    if (name.length > TEXT_LIMITS.name) {
      return { ok: false, message: `식물 이름은 ${TEXT_LIMITS.name}자 이내로 입력해 주세요.` };
    }
    return { ok: true, identity: { kind: "manual", name } };
  }
  if (mode === "unknown") return { ok: true, identity: { kind: "unknown" } };
  return { ok: false, message: "식물 이름을 정하는 단계부터 다시 시작해 주세요." };
}

/** Query string that carries an identity from S05-M or S04-B to S05. */
export function identityQuery(identity: PlantIdentity): string {
  const params = new URLSearchParams({ mode: identity.kind });
  if (identity.kind === "species") params.set("species", identity.speciesId);
  if (identity.kind === "manual") params.set("name", identity.name);
  return params.toString();
}

/**
 * Reminder choices S05 may offer. A type is offered only when the feature is
 * on and the species' API care data has that interval (05 rule 2, D16). A
 * manual name or unknown species has no API data, so nothing is offered.
 */
export function reminderOptions(
  remindersEnabled: boolean,
  care: { hasWateringBenchmark: boolean; hasFertilizerInterval: boolean } | null,
): ReminderOptions {
  if (!remindersEnabled || !care) return { water: false, fertilizer: false };
  return { water: care.hasWateringBenchmark, fertilizer: care.hasFertilizerInterval };
}

function pick<T extends string>(
  options: readonly Option<T>[],
  value: string | null | undefined,
): { ok: true; code: T | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, code: null };
  const match = options.find((option) => option.code === value);
  return match ? { ok: true, code: match.code } : { ok: false };
}

function limited(
  value: string | null | undefined,
  max: number,
  label: string,
): { ok: true; text: string | null } | { ok: false; message: string } {
  const text = cleanText(value);
  if (text && text.length > max) return { ok: false, message: `${label}은(는) ${max}자 이내로 입력해 주세요.` };
  return { ok: true, text };
}

/**
 * Validates the S05 form. Choices must be one of the confirmed codes; the
 * initial-state choices may be left empty. Reminder flags are only accepted
 * for the types S05 offered, so a hidden option can never be switched on.
 */
export function parseRegistration(
  input: RawInput,
  offered: ReminderOptions,
): { ok: true; value: PlantRegistration } | { ok: false; errors: RegistrationErrors } {
  const errors: RegistrationErrors = {};

  const identity = parseIdentity(input);
  if (!identity.ok) errors.identity = identity.message;

  const nickname = limited(input.nickname, TEXT_LIMITS.nickname, "화분 별명");
  if (!nickname.ok) errors.nickname = nickname.message;
  const location = limited(input.location, TEXT_LIMITS.location, "관리 장소");
  if (!location.ok) errors.location = location.message;
  const memo = limited(input.memo, TEXT_LIMITS.memo, "메모");
  if (!memo.ok) errors.memo = memo.message;

  const environment = pick(ENVIRONMENTS, input.environment);
  if (!environment.ok || environment.code === null) errors.environment = "실내 또는 실외를 선택해 주세요.";
  const lastWatered = pick(LAST_WATERED_RANGES, input.lastWatered);
  if (!lastWatered.ok) errors.lastWatered = "목록에서 선택해 주세요.";
  const lightLevel = pick(LIGHT_LEVELS, input.lightLevel);
  if (!lightLevel.ok) errors.lightLevel = "목록에서 선택해 주세요.";
  const lastRepotted = pick(LAST_REPOTTED_RANGES, input.lastRepotted);
  if (!lastRepotted.ok) errors.lastRepotted = "목록에서 선택해 주세요.";
  const potMaterial = pick(POT_MATERIALS, input.potMaterial);
  if (!potMaterial.ok) errors.potMaterial = "목록에서 선택해 주세요.";

  if (
    Object.keys(errors).length > 0 ||
    !identity.ok ||
    !nickname.ok ||
    !location.ok ||
    !memo.ok ||
    !environment.ok ||
    !lastWatered.ok ||
    !lightLevel.ok ||
    !lastRepotted.ok ||
    !potMaterial.ok
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      identity: identity.identity,
      nickname: nickname.text,
      location: location.text,
      environment: environment.code as EnvironmentCode,
      lastWatered: lastWatered.code,
      lightLevel: lightLevel.code,
      lastRepotted: lastRepotted.code,
      potMaterial: potMaterial.code,
      memo: memo.text,
      waterReminder: offered.water && input.waterReminder === "on",
      fertilizerReminder: offered.fertilizer && input.fertilizerReminder === "on",
    },
  };
}

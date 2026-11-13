/**
 * Pot registration shapes (S03 → S05-M → S05, docs/stage2/03 §5).
 * Stored codes match the CHECK constraints in the initial migration and the
 * table in docs/05-database-design.md "Stored codes for S05 choices".
 */

export type Option<T extends string> = { code: T; label: string };

export const ENVIRONMENTS = [
  { code: "indoor", label: "실내" },
  { code: "outdoor", label: "실외" },
] as const satisfies readonly Option<string>[];
export type EnvironmentCode = (typeof ENVIRONMENTS)[number]["code"];

export const LAST_WATERED_RANGES = [
  { code: "within_1_day", label: "당일 ~ 1일 전" },
  { code: "about_1_week", label: "일주일 전" },
  { code: "about_1_month", label: "한달 전" },
  { code: "unknown", label: "모름" },
] as const satisfies readonly Option<string>[];
export type LastWateredCode = (typeof LAST_WATERED_RANGES)[number]["code"];

export const LIGHT_LEVELS = [
  { code: "direct", label: "직사광선" },
  { code: "bright_indirect", label: "밝은 간접광" },
  { code: "medium", label: "보통" },
  { code: "low", label: "약함" },
  { code: "unknown", label: "잘 모르겠음" },
] as const satisfies readonly Option<string>[];
export type LightLevelCode = (typeof LIGHT_LEVELS)[number]["code"];

/** 05 snapshot rule 1: ten non-overlapping ranges, in this order. */
export const LAST_REPOTTED_RANGES = [
  { code: "within_1_day", label: "당일~1일 전" },
  { code: "days_2_to_6", label: "2~6일 전" },
  { code: "week_1_to_month_1", label: "1주 이상~1개월 미만" },
  { code: "months_1_to_2", label: "1개월 이상~2개월 미만" },
  { code: "months_2_to_3", label: "2개월 이상~3개월 미만" },
  { code: "months_3_to_6", label: "3개월 이상~6개월 미만" },
  { code: "months_6_to_12", label: "6개월 이상~1년 미만" },
  { code: "over_1_year", label: "1년 이상" },
  { code: "unknown", label: "모름" },
  { code: "never", label: "한 적 없음" },
] as const satisfies readonly Option<string>[];
export type LastRepottedCode = (typeof LAST_REPOTTED_RANGES)[number]["code"];

export const POT_MATERIALS = [
  { code: "plastic", label: "플라스틱" },
  { code: "terracotta", label: "테라코다,도기" },
  { code: "glass", label: "유리" },
  { code: "ceramic", label: "자기,석기 세라믹" },
  { code: "garden_bed", label: "화단" },
] as const satisfies readonly Option<string>[];
export type PotMaterialCode = (typeof POT_MATERIALS)[number]["code"];

/**
 * What the user chose before S05. A confirmed species comes from S04-B; a
 * manual name or "unknown" comes from S05-M. The manual name is kept as typed
 * and never linked to a species automatically (ADR-0003 D12).
 */
export type PlantIdentity =
  | { kind: "species"; speciesId: string }
  | { kind: "manual"; name: string }
  | { kind: "unknown" };

/** Validated S05 input, ready to store. Empty optional text is null. */
export type PlantRegistration = {
  identity: PlantIdentity;
  nickname: string | null;
  location: string | null;
  environment: EnvironmentCode;
  lastWatered: LastWateredCode | null;
  lightLevel: LightLevelCode | null;
  lastRepotted: LastRepottedCode | null;
  potMaterial: PotMaterialCode | null;
  memo: string | null;
  waterReminder: boolean;
  fertilizerReminder: boolean;
};

export type RegistrationField =
  | "identity"
  | "nickname"
  | "location"
  | "environment"
  | "lastWatered"
  | "lightLevel"
  | "lastRepotted"
  | "potMaterial"
  | "memo";

/** Field → Korean message. Empty when the input is valid. */
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

/** Raw S05 form values echoed back so a failed save keeps the user's input. */
export type RegistrationValues = Partial<Record<RegistrationField | "waterReminder" | "fertilizerReminder", string>>;

export type RegisterFormState = {
  /** "invalid": fix the marked fields. "save_failed": nothing was saved; try again. */
  status: "idle" | "invalid" | "save_failed";
  errors: RegistrationErrors;
  values: RegistrationValues;
};

/** Species fields a pot shows (shared plant DB). */
export type SpeciesSummary = {
  id: string;
  koreanName: string | null;
  scientificName: string;
};

/** Which reminder choices S05 may offer (05 snapshot rule 2, ADR-0003 D16). */
export type ReminderOptions = { water: boolean; fertilizer: boolean };

/** A stored pot as screens read it. */
export type PotView = {
  id: string;
  nickname: string | null;
  userEnteredName: string | null;
  species: SpeciesSummary | null;
  environment: EnvironmentCode | null;
  location: string | null;
  memo: string | null;
  lastWatered: LastWateredCode | null;
  lightLevel: LightLevelCode | null;
  lastRepotted: LastRepottedCode | null;
  potMaterial: PotMaterialCode | null;
  initialStateRecordedAt: string;
  waterReminder: boolean;
  fertilizerReminder: boolean;
  createdAt: string;
};

export const TEXT_LIMITS = { name: 60, nickname: 40, location: 60, memo: 500 } as const;

/** Shown when neither a nickname nor any plant name exists (species unknown). */
export const UNKNOWN_SPECIES_LABEL = "종 미상";

/** Plant name without the nickname: Korean name → scientific name → typed name. */
export function plantName(pot: Pick<PotView, "species" | "userEnteredName">): string {
  return (
    pot.species?.koreanName ?? pot.species?.scientificName ?? pot.userEnteredName ?? UNKNOWN_SPECIES_LABEL
  );
}

/** Pot display name: nickname → plant name (docs/stage2/03 §1). */
export function potDisplayName(pot: Pick<PotView, "nickname" | "species" | "userEnteredName">): string {
  return pot.nickname ?? plantName(pot);
}

export function optionLabel<T extends string>(options: readonly Option<T>[], code: T | null): string | null {
  if (code === null) return null;
  return options.find((option) => option.code === code)?.label ?? null;
}

import type { CareActionCode, CareSaveAnswer, SoilStateCode } from "@/types/care";

/** The S08 form as the screen holds it. `recordedAt` is "YYYY-MM-DDTHH:mm" in Korean time. */
export type CareForm = {
  potId: string;
  recordedAt: string;
  actions: CareActionCode[];
  waterMl: string;
  actionNotes: Record<Exclude<CareActionCode, "water">, string>;
  soilState: SoilStateCode | null;
  observation: string;
  notes: string;
};

export type CareClientFailure = { kind: "signed_out" } | { kind: "network" };

/**
 * S08 [기록 저장하기]. `key` is one per form: sending the same form again
 * (double tap, retry after a lost answer) returns the record saved first.
 * Network errors and unexpected answers become plain kinds; nothing throws.
 */
export async function requestCareSave(
  key: string,
  form: CareForm,
  photos: Blob[],
): Promise<CareSaveAnswer | CareClientFailure> {
  const body = new FormData();
  body.append("key", key);
  body.append("potId", form.potId);
  body.append("recordedAt", form.recordedAt);
  for (const action of form.actions) body.append("actions", action);
  if (form.actions.includes("water")) body.append("waterMl", form.waterMl.trim());
  if (form.actions.includes("fertilize")) body.append("fertilizeNotes", form.actionNotes.fertilize);
  if (form.actions.includes("repot")) body.append("repotNotes", form.actionNotes.repot);
  if (form.actions.includes("prune")) body.append("pruneNotes", form.actionNotes.prune);
  if (form.soilState) body.append("soilState", form.soilState);
  body.append("observation", form.observation);
  body.append("notes", form.notes);
  photos.forEach((photo, index) => body.append("photos", photo, `photo-${index + 1}.jpg`));
  let response: Response;
  try {
    response = await fetch("/api/care-records", { method: "POST", body });
  } catch {
    return { kind: "network" };
  }
  if (response.status === 401) return { kind: "signed_out" };
  try {
    const answer = (await response.json()) as CareSaveAnswer;
    return typeof answer?.kind === "string" ? answer : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/** Now as "YYYY-MM-DDTHH:mm" in Korean time, for the date and time field. */
export function koreanLocalTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

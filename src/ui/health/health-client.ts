import type { ExplainAnswer, HealthAnswer, HealthInput, JudgeAnswer, SaveAnswer } from "@/types/health";

/**
 * Browser calls for S07. Network errors and unexpected answers become plain
 * kinds the screen can explain; nothing is thrown.
 */

export type HealthClientFailure = { kind: "signed_out" } | { kind: "network" } | { kind: "failed" };

/** S07-A [분석하기]: photos and fields, with this request's consent (ADR-0003 D5). */
export async function requestHealthCheck(
  photos: Blob[],
  consent: boolean,
  input: HealthInput,
): Promise<HealthAnswer | HealthClientFailure> {
  const form = new FormData();
  form.append("consent", consent ? "true" : "false");
  for (const symptom of input.symptoms) form.append("symptoms", symptom);
  form.append("noticed", input.noticed);
  form.append("notes", input.notes);
  if (input.potId) form.append("potId", input.potId);
  photos.forEach((photo, index) => form.append("photos", photo, `photo-${index + 1}.jpg`));
  let response: Response;
  try {
    response = await fetch("/api/health-checks", { method: "POST", body: form });
  } catch {
    return { kind: "network" };
  }
  if (response.status === 401) return { kind: "signed_out" };
  try {
    const body = (await response.json()) as HealthAnswer;
    return typeof body?.kind === "string" ? body : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * S07-B AI explanation (ADR-0006). Text only, and without the free-text notes
 * (ADR-0006 D2). `token` is the signed result from /api/health-checks; the
 * server takes the causes from it. Any failure reads as unavailable.
 */
export async function requestExplanation(token: string, input: HealthInput): Promise<ExplainAnswer> {
  try {
    const response = await fetch("/api/health-checks/explain", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, symptoms: input.symptoms, noticed: input.noticed, potId: input.potId }),
    });
    const body = (await response.json()) as ExplainAnswer;
    return body?.kind === "ok" || body?.kind === "none" ? body : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}

/**
 * S07-B '판단 어려움' → the photo AI (ADR-0006 D6). `consent` is the AI photo
 * consent for this request only. Notes are not sent. `token` must be the
 * 'unclear' result for these same photos, or the server refuses.
 */
export async function requestAiJudgement(
  photos: Blob[],
  consent: boolean,
  input: HealthInput,
  token: string,
): Promise<JudgeAnswer | HealthClientFailure> {
  const form = new FormData();
  form.append("consent", consent ? "true" : "false");
  form.append("token", token);
  for (const symptom of input.symptoms) form.append("symptoms", symptom);
  form.append("noticed", input.noticed);
  if (input.potId) form.append("potId", input.potId);
  photos.forEach((photo, index) => form.append("photos", photo, `photo-${index + 1}.jpg`));
  let response: Response;
  try {
    response = await fetch("/api/health-checks/ai-judge", { method: "POST", body: form });
  } catch {
    return { kind: "network" };
  }
  if (response.status === 401) return { kind: "signed_out" };
  try {
    const body = (await response.json()) as JudgeAnswer;
    return typeof body?.kind === "string" ? body : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * S07-S [이 화분에 결과 저장]: the signed result and the same photos, the
 * S07-A fields with the chosen pot, and the signed AI texts if any. The
 * server stores only what it signed.
 */
export async function requestSave(
  photos: Blob[],
  input: HealthInput & { potId: string },
  tokens: { result: string; explanation: string | null; judgement: string | null },
): Promise<SaveAnswer | HealthClientFailure> {
  const form = new FormData();
  form.append("token", tokens.result);
  if (tokens.explanation) form.append("explainToken", tokens.explanation);
  if (tokens.judgement) form.append("judgeToken", tokens.judgement);
  for (const symptom of input.symptoms) form.append("symptoms", symptom);
  form.append("noticed", input.noticed);
  form.append("notes", input.notes);
  form.append("potId", input.potId);
  photos.forEach((photo, index) => form.append("photos", photo, `photo-${index + 1}.jpg`));
  let response: Response;
  try {
    response = await fetch("/api/health-checks/save", { method: "POST", body: form });
  } catch {
    return { kind: "network" };
  }
  if (response.status === 401) return { kind: "signed_out" };
  try {
    const body = (await response.json()) as SaveAnswer;
    return typeof body?.kind === "string" ? body : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

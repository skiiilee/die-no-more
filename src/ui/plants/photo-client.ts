import type { IdentifyAnswer } from "@/types/photo";

/**
 * Browser call for S03-P: POST /api/identifications with this request's
 * consent and the photos themselves (multipart). Network errors and
 * unexpected answers become plain kinds the screen can explain; nothing is
 * thrown.
 */

export type ClientFailure = { kind: "signed_out" } | { kind: "network" };

/** `consent` is the checkbox for this request only (ADR-0003 D5). */
export async function requestIdentification(photos: Blob[], consent: boolean): Promise<IdentifyAnswer | ClientFailure> {
  const form = new FormData();
  form.append("consent", consent ? "true" : "false");
  photos.forEach((photo, index) => form.append("photos", photo, `photo-${index + 1}.jpg`));
  let response: Response;
  try {
    response = await fetch("/api/identifications", { method: "POST", body: form });
  } catch {
    return { kind: "network" };
  }
  if (response.status === 401) return { kind: "signed_out" };
  try {
    const body = (await response.json()) as IdentifyAnswer;
    return typeof body?.kind === "string" ? body : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

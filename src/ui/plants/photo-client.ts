import type { IdentifyAnswer, UploadAnswer } from "@/types/photo";

/**
 * Browser calls for S03-P (POST /api/uploads, DELETE /api/uploads/{id},
 * POST /api/identifications). Network errors and unexpected answers become
 * plain kinds the screen can explain; nothing is thrown.
 */

export type ClientFailure = { kind: "signed_out" } | { kind: "network" };

async function read<T extends { kind: string }>(response: Response): Promise<T | ClientFailure | { kind: "failed" }> {
  if (response.status === 401) return { kind: "signed_out" };
  try {
    const body = (await response.json()) as T;
    return typeof body?.kind === "string" ? body : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

export async function uploadPhotoFile(blob: Blob): Promise<UploadAnswer | ClientFailure> {
  const form = new FormData();
  form.append("photo", blob, "photo.jpg");
  try {
    return await read<UploadAnswer>(await fetch("/api/uploads", { method: "POST", body: form }));
  } catch {
    return { kind: "network" };
  }
}

/** Best effort: a photo left behind is removed after 24 hours anyway (D6). */
export async function deleteUploadedPhoto(id: string): Promise<void> {
  try {
    await fetch(`/api/uploads/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // Ignored on purpose; see above.
  }
}

/** `consent` is the checkbox for this request only (ADR-0003 D5). */
export async function requestIdentification(photoIds: string[], consent: boolean): Promise<IdentifyAnswer | ClientFailure> {
  try {
    const response = await fetch("/api/identifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ photoIds, consent }),
    });
    return await read<IdentifyAnswer>(response);
  } catch {
    return { kind: "network" };
  }
}

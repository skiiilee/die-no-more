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

/**
 * True only when the server confirms the photo is gone (deleted now, or
 * already gone: 404). Any other answer or a network error is false, so the
 * screen never shows a photo as removed while it may still be stored.
 * `keepalive` lets the request finish when the screen is being left.
 */
export async function deleteUploadedPhoto(id: string, options: { keepalive?: boolean } = {}): Promise<boolean> {
  try {
    const response = await fetch(`/api/uploads/${encodeURIComponent(id)}`, {
      method: "DELETE",
      keepalive: options.keepalive ?? false,
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
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

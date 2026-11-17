/**
 * Photos for identification live only in this browser tab's memory; nothing
 * is uploaded until [사진으로 식물 찾기] (ADR-0003 D6, changed 2026-11-18).
 *
 * - handOverPhotos: the files picked in the S03 dialog, for S03-P to prepare.
 * - keepPhotos: the prepared photos S03-P sent, so returning from S04-A shows
 *   them again for another try.
 *
 * A reload empties both: S03-P then starts with an empty list and [사진 추가].
 */

export type HeldPhoto = { file: File; blob: Blob };

let pending: File[] = [];
let kept: HeldPhoto[] = [];

export function handOverPhotos(files: File[]): void {
  pending = files;
  kept = [];
}

export function pendingPhotos(): File[] {
  return pending;
}

export function clearPendingPhotos(): void {
  pending = [];
}

export function keepPhotos(photos: HeldPhoto[]): void {
  kept = photos;
}

export function keptPhotos(): HeldPhoto[] {
  return kept;
}

export function clearKeptPhotos(): void {
  kept = [];
}

/**
 * Hands the files picked in the S03 dialog to S03-P across one client-side
 * navigation. Lives only in this browser tab's memory: a reload of S03-P starts
 * with an empty list and [사진 추가].
 */
let pending: File[] = [];

export function handOverPhotos(files: File[]): void {
  pending = files;
}

export function pendingPhotos(): File[] {
  return pending;
}

export function clearPendingPhotos(): void {
  pending = [];
}

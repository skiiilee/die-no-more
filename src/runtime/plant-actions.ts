"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { FEATURES } from "@/config/features";
import { registerPot, type RegistrationPhoto } from "@/service/plant-service";
import type { RawInput } from "@/service/plant-registration";
import { addPotPhoto, deletePotPhoto } from "@/service/pot-photos";
import type { PotPhotoFormState, RegisterFormState } from "@/types/plant";
import { PHOTO_RULES } from "@/types/photo";
import { requireSignedIn } from "./session";
import { photoDeps, requestPotStores } from "./plant-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formInput(formData: FormData): RawInput {
  const input: RawInput = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") input[key] = value;
  }
  return input;
}

/**
 * The picked photo's bytes, or null when none was picked. A file over the
 * upload limit is cut off here, so the service refuses it as too large
 * without reading all of it.
 */
async function photoBytes(formData: FormData, field: string): Promise<Uint8Array | null> {
  const value = formData.get(field);
  if (!(value instanceof Blob) || value.size === 0) return null;
  const limited = value.size > PHOTO_RULES.maxUploadBytes ? value.slice(0, PHOTO_RULES.maxUploadBytes + 1) : value;
  return new Uint8Array(await limited.arrayBuffer());
}

/** S05 [식물 추가하기]: stores the pot (and its photo, if one was picked), then opens S06. */
export async function registerPotAction(_prev: RegisterFormState, formData: FormData): Promise<RegisterFormState> {
  await requireSignedIn();
  const stores = await requestPotStores();
  const input = formInput(formData);
  if (!stores) return { status: "save_failed", errors: {}, values: {} };

  const bytes = await photoBytes(formData, "photo");
  const photo: RegistrationPhoto | null = bytes ? { bytes, deps: photoDeps(stores.photos) } : null;
  const result = await registerPot(stores.plants, input, FEATURES.CARE_REMINDERS, photo);
  if (!result.ok) return result.state;
  redirect(result.photo === "failed" ? `/plants/${result.id}?photo=failed` : `/plants/${result.id}`);
}

/**
 * S06 [사진 추가]: one photo for this own pot, then S06 shows it.
 * S06 is refreshed in place rather than redirected to itself: a redirect to
 * the same page left [사진 추가]/[사진 삭제] disabled (pending) on phones.
 */
export async function addPotPhotoAction(_prev: PotPhotoFormState, formData: FormData): Promise<PotPhotoFormState> {
  await requireSignedIn();
  const potId = formData.get("potId");
  if (typeof potId !== "string" || !UUID.test(potId)) return { status: "failed", message: "화분을 찾을 수 없습니다." };
  const stores = await requestPotStores();
  if (!stores) return { status: "failed", message: "지금은 사진을 저장할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  // The pot must be the user's own (RLS hides others) before anything is uploaded.
  let pot: Awaited<ReturnType<typeof stores.plants.getPot>>;
  try {
    pot = await stores.plants.getPot(potId);
  } catch {
    return { status: "failed", message: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  if (!pot) return { status: "failed", message: "화분을 찾을 수 없습니다." };

  const bytes = await photoBytes(formData, "photo");
  if (!bytes) return { status: "invalid", message: "사진 파일을 찾지 못했습니다. 다시 골라 주세요." };
  const result = await addPotPhoto(photoDeps(stores.photos), potId, bytes);
  if (!result.ok) return { status: result.kind, message: result.message };
  refresh();
  return { status: "done" };
}

/** S06 [사진 삭제] after the confirmation: removes the shown photo, then S06 refreshed in place. */
export async function deletePotPhotoAction(_prev: PotPhotoFormState, formData: FormData): Promise<PotPhotoFormState> {
  await requireSignedIn();
  const potId = formData.get("potId");
  const photoId = formData.get("photoId");
  if (typeof potId !== "string" || typeof photoId !== "string" || !UUID.test(potId) || !UUID.test(photoId)) {
    return { status: "failed", message: "사진을 찾을 수 없습니다." };
  }
  const stores = await requestPotStores();
  if (!stores) return { status: "failed", message: "지금은 사진을 삭제할 수 없습니다. 잠시 후 다시 시도해 주세요." };
  const result = await deletePotPhoto(stores.photos, potId, photoId);
  if (!result.ok) return { status: "failed", message: result.message };
  refresh();
  return { status: "done" };
}

"use client";

import { useState } from "react";
import { addPotPhotoAction, deletePotPhotoAction } from "@/runtime/plant-actions";
import type { PotPhoto, PotPhotoFormState } from "@/types/plant";
import { PhotoSourceDialog } from "./PhotoSourceDialog";
import { usePickedPhoto } from "./use-picked-photo";
import styles from "./plants.module.css";

const IDLE: PotPhotoFormState = { status: "idle" };
/** When the request itself fails (network, server error) before the action answers. */
const FAILED = {
  add: "사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  delete: "사진을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

/**
 * S06 화분 사진 (wireframe pages 19–20): the newest photo of this pot, with
 * [사진 추가] and [사진 삭제]. A photo is added as soon as it is prepared;
 * deleting asks first. Both refresh S06 in place when they succeed, so this
 * panel stays mounted and shows only the message of the last thing tried.
 *
 * "Busy" is plain state set around the awaited action, not useActionState's
 * pending flag. With Cache Components, Next keeps a left page in a hidden
 * <Activity> and shows it again on [뒤로]; the pending flag could come back
 * stuck there and leave both buttons grey (device test, 2026-11-19).
 */
export function PotPhotoPanel({
  potId,
  name,
  photo,
  registrationPhotoFailed = false,
}: {
  potId: string;
  name: string;
  photo: PotPhoto | null;
  /** S05 saved the pot but not its photo. */
  registrationPhotoFailed?: boolean;
}) {
  const [state, setState] = useState<PotPhotoFormState>(IDLE);
  const [running, setRunning] = useState<"add" | "delete" | null>(null);
  const picked = usePickedPhoto();
  const [choosing, setChoosing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const adding = running === "add";
  const deleting = running === "delete";
  const busy = running !== null || picked.preparing;

  const run = async (kind: "add" | "delete", form: FormData) => {
    setRunning(kind);
    try {
      setState(await (kind === "add" ? addPotPhotoAction : deletePotPhotoAction)(IDLE, form));
    } catch {
      setState({ status: "failed", message: FAILED[kind] });
    } finally {
      setRunning(null);
    }
  };

  const upload = async (file: File) => {
    setState(IDLE);
    const blob = await picked.pick(file);
    if (!blob) return;
    const form = new FormData();
    form.set("potId", potId);
    form.set("photo", blob, "pot-photo.jpg");
    await run("add", form);
  };

  const confirmDelete = () => {
    if (!photo) return;
    const form = new FormData();
    form.set("potId", potId);
    form.set("photoId", photo.id);
    setConfirming(false);
    picked.clear();
    setState(IDLE);
    void run("delete", form);
  };

  const message = picked.error ?? state.message ?? null;

  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>화분 사진</h2>
      {registrationPhotoFailed && !photo ? (
        <p role="alert" className={styles.error}>
          화분은 등록했지만 사진은 저장하지 못했습니다. [사진 추가]로 다시 올려 주세요.
        </p>
      ) : null}
      {photo?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to the private bucket
        <img src={photo.url} alt={`${name} 사진`} className={styles.photo} />
      ) : (
        <span className={`${styles.photo} ${styles.noPhoto}`} role="img" aria-label={photo ? "사진을 불러오지 못함" : "사진 없음"}>
          {photo ? "사진을 불러오지 못했습니다. 화면을 새로 고쳐 주세요." : "사진 없음"}
        </span>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => setChoosing(true)} disabled={busy}>
          {adding || picked.preparing ? "사진 올리는 중…" : "사진 추가"}
        </button>
        {photo ? (
          <button type="button" className={styles.secondary} onClick={() => setConfirming(true)} disabled={busy}>
            {deleting ? "삭제 중…" : "사진 삭제"}
          </button>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      ) : null}
      <p className={styles.note}>사진은 나만 볼 수 있게 저장하고, 위치 정보(EXIF)는 지웁니다.</p>

      {choosing ? (
        <PhotoSourceDialog
          onPick={(files) => {
            setChoosing(false);
            if (files[0]) void upload(files[0]);
          }}
          onCancel={() => setChoosing(false)}
        />
      ) : null}
      {confirming ? (
        <div className={styles.backdrop}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="photo-delete-title" className={styles.dialog}>
            <h2 id="photo-delete-title" className={styles.cardTitle}>
              이 사진을 삭제할까요?
            </h2>
            <p className={styles.note}>삭제한 사진은 되돌릴 수 없습니다.</p>
            <button type="button" className={styles.primary} onClick={confirmDelete} autoFocus>
              삭제
            </button>
            <button type="button" className={styles.secondary} onClick={() => setConfirming(false)}>
              취소
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

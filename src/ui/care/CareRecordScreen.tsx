"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PHOTO_RULES } from "@/types/photo";
import { usePhotoList } from "@/ui/health/use-photo-list";
import { fitRequest } from "@/ui/plants/photo-prep";
import { PhotoSourceDialog } from "@/ui/plants/PhotoSourceDialog";
import styles from "@/ui/plants/plants.module.css";
import { useUnsavedChanges } from "@/ui/shell/unsaved-changes";
import { koreanLocalTime, requestCareSave, type CareForm } from "./care-client";
import { badWater, CareFormFields, overLimits, type CarePot } from "./CareFormFields";

export const CARE_SAVE_MESSAGES: Record<string, string> = {
  empty: "기록할 항목을 하나 이상 입력해 주세요.",
  not_found: "고른 화분을 찾을 수 없습니다. 다른 화분을 골라 주세요.",
  failed: "기록을 저장하지 못했습니다. 입력한 내용은 그대로 있으니 잠시 후 다시 시도해 주세요.",
  signed_out: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  network: "연결이 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
};

function emptyForm(potId: string, now: string): CareForm {
  return {
    potId,
    recordedAt: now,
    actions: [],
    waterMl: "",
    actionNotes: { fertilize: "", repot: "", prune: "" },
    soilState: null,
    observation: "",
    notes: "",
  };
}

/**
 * S08 관리 기록 (wireframe §7, 03 §7). Every item is optional and on one
 * screen; only what was entered is saved, and an empty form cannot be sent.
 * One key per visit makes a double tap or a retry save once. A failure keeps
 * everything entered. On success S06 of that pot opens and lists the record.
 */
export function CareRecordScreen({ pots, initialPotId }: { pots: CarePot[]; initialPotId: string }) {
  const router = useRouter();
  const photos = usePhotoList();
  const [now] = useState(() => koreanLocalTime(new Date()));
  const [form, setForm] = useState<CareForm>(() => emptyForm(initialPotId, now));
  const [key] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const entered =
    form.actions.length > 0 ||
    form.soilState !== null ||
    form.observation.trim() !== "" ||
    form.notes.trim() !== "" ||
    photos.items.length > 0;
  useUnsavedChanges(entered && !saving && !saved);

  const over = overLimits(form);
  // A photo that could not be prepared must be removed first, so it is not silently left out.
  const photoError = photos.items.some((item) => item.status === "error");
  const invalid = Object.values(over).some(Boolean) || badWater(form) || photoError;
  const canSave = entered && form.potId !== "" && form.recordedAt !== "" && !invalid && !photos.preparing && !saving && !saved;

  const change = (next: Partial<CareForm>) => setForm((current) => ({ ...current, ...next }));
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const fitted = photos.ready.length
      ? await fitRequest(photos.ready.map((item) => ({ file: item.file, blob: item.blob })))
      : { ok: true as const, blobs: [] as Blob[] };
    const answer = fitted.ok ? await requestCareSave(key, form, fitted.blobs) : ({ kind: "invalid", message: fitted.message } as const);
    if (answer.kind === "saved") {
      setSaved(true);
      router.push(`/plants/${answer.potId}?record=saved`);
      return;
    }
    setSaving(false);
    setError(answer.kind === "invalid" ? answer.message : (CARE_SAVE_MESSAGES[answer.kind] ?? CARE_SAVE_MESSAGES.failed));
  };

  if (pots.length === 0) {
    return (
      <section className={styles.screen} aria-labelledby="care-title">
        <h1 id="care-title" className={styles.title}>
          관리 기록
        </h1>
        <p className={styles.note}>등록한 화분이 없어 기록할 수 없습니다. 화분을 먼저 등록해 주세요.</p>
        <Link href="/plants/new" className={styles.secondary}>
          식물 추가
        </Link>
      </section>
    );
  }

  const busy = saving || saved;
  return (
    <section className={styles.screen} aria-labelledby="care-title">
      <div className={styles.header}>
        <h1 id="care-title" className={styles.title}>
          관리 기록
        </h1>
        {initialPotId ? (
          <Link href={`/plants/${initialPotId}`} className={styles.back}>
            화분으로
          </Link>
        ) : null}
      </div>
      <p className={styles.lead}>실제로 한 일과 본 것만 골라 입력하세요. 입력한 항목만 기록됩니다.</p>

      <CareFormFields pots={pots} form={form} maxTime={now} disabled={busy} onChange={change} />

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>사진 (선택)</h2>
        <p className={styles.note}>{PHOTO_RULES.maxCount}장까지 첨부할 수 있습니다. 위치 정보를 지운 뒤 나만 볼 수 있는 저장소에 보관합니다.</p>
        <ul className={styles.photoGrid} aria-label="첨부한 사진">
          {photos.items.map((item, index) => (
            <li key={item.key} className={styles.photoItem}>
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own photo
                <img src={item.previewUrl} alt={`첨부 사진 ${index + 1}`} className={styles.thumb} />
              ) : (
                <span className={`${styles.thumb} ${styles.noPhoto}`} role="img" aria-label={`사진 ${index + 1} 준비 중`}>
                  {item.status === "error" ? "오류" : "준비 중"}
                </span>
              )}
              {item.status === "error" ? <span className={styles.error}>{item.message}</span> : null}
              <button
                type="button"
                className={styles.secondary}
                onClick={() => photos.remove(item)}
                disabled={busy || item.status === "preparing"}
                aria-label={`사진 ${index + 1} 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
        {photos.notice ? <p className={styles.note}>{photos.notice}</p> : null}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setDialogOpen(true)}
          disabled={photos.items.length >= PHOTO_RULES.maxCount || busy}
        >
          + 사진 첨부
        </button>
      </div>

      <div className={styles.card}>
        {!entered ? <p className={styles.note}>{CARE_SAVE_MESSAGES.empty}</p> : null}
        {photoError ? <p className={styles.note}>준비하지 못한 사진을 삭제한 뒤 저장해 주세요.</p> : null}
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <button type="button" className={styles.primary} onClick={save} disabled={!canSave}>
          {saved ? "저장했습니다" : saving ? "저장 중…" : "기록 저장하기"}
        </button>
      </div>

      {dialogOpen ? (
        <PhotoSourceDialog
          onCancel={closeDialog}
          onPick={(files) => {
            setDialogOpen(false);
            photos.add(files);
          }}
        />
      ) : null}
    </section>
  );
}

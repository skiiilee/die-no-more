"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PHOTO_RULES } from "@/types/photo";
import { GuardedLink } from "@/ui/shell/GuardedLink";
import { useUnsavedChanges } from "@/ui/shell/unsaved-changes";
import { clearPendingPhotos, pendingPhotos } from "./pending-photos";
import { deleteUploadedPhoto, requestIdentification, uploadPhotoFile } from "./photo-client";
import { prepareForUpload } from "./photo-prep";
import { PhotoSourceDialog } from "./PhotoSourceDialog";
import styles from "./plants.module.css";

type Item = {
  key: string;
  status: "preparing" | "uploading" | "ready" | "error";
  previewUrl: string | null;
  id: string | null;
  message: string | null;
};

export const IDENTIFY_MESSAGES: Record<string, string> = {
  consent_required: "Pl@ntNet 사진 전송에 동의해야 식물을 찾을 수 있습니다.",
  invalid: `사진을 1장에서 ${PHOTO_RULES.maxCount}장까지 골라 주세요.`,
  photos_missing: "올린 사진을 찾지 못했습니다. 사진을 지우고 다시 골라 주세요.",
  quota: "오늘은 사진으로 식물 찾기를 더 이상 이용할 수 없습니다. 오전 9시 이후 다시 시도하거나 이름으로 검색해 주세요.",
  rejected: "사진을 분석하지 못했습니다. 다른 사진으로 다시 시도해 주세요.",
  unavailable: "지금은 사진 식별에 연결할 수 없습니다. 잠시 후 다시 시도하거나 이름으로 검색해 주세요.",
  failed: "결과를 저장하지 못했습니다. 다시 시도해 주세요.",
  signed_out: "로그인이 만료되었습니다. 다시 로그인해 주세요.",
  network: "연결이 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
};

const UPLOAD_FAILED = "사진을 올리지 못했습니다. 지우고 다시 골라 주세요.";
const TOO_MANY = `사진은 ${PHOTO_RULES.maxCount}장까지 올릴 수 있습니다. 나머지는 빼고 올렸습니다.`;

let nextKey = 0;

/**
 * S03-P 업로드한 사진 (wireframe 02 §S03-P, ADR-0003 D4–D6). Each picked photo
 * is resized in the browser and uploaded at once; the list shows the user's
 * own photos only. [사진으로 식물 찾기] needs at least one uploaded photo and
 * this request's consent: before the box is ticked nothing is sent to
 * Pl@ntNet (D5). The box is cleared after every request, so consent is
 * always given again.
 */
export function PhotoListScreen() {
  const router = useRouter();
  const [initial] = useState(pendingPhotos);
  const [items, setItems] = useState<Item[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const started = useRef(false);
  const count = useRef(0);

  useUnsavedChanges(items.length > 0 && !leaving);

  const update = useCallback(
    (key: string, change: Partial<Item>) =>
      setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item))),
    [],
  );

  const addFiles = useCallback((files: File[]) => {
    const room = PHOTO_RULES.maxCount - count.current;
    const accepted = files.slice(0, Math.max(0, room));
    setNotice(files.length > accepted.length ? TOO_MANY : null);
    count.current += accepted.length;

    for (const file of accepted) {
      const key = `photo-${nextKey++}`;
      setItems((current) => [...current, { key, status: "preparing", previewUrl: null, id: null, message: null }]);
      void (async () => {
        const prepared = await prepareForUpload(file);
        if (!prepared.ok) {
          update(key, { status: "error", message: prepared.message });
          return;
        }
        update(key, { status: "uploading", previewUrl: URL.createObjectURL(prepared.blob) });
        const answer = await uploadPhotoFile(prepared.blob);
        if (answer.kind === "ok") update(key, { status: "ready", id: answer.id });
        else if (answer.kind === "invalid") update(key, { status: "error", message: answer.message });
        else update(key, { status: "error", message: IDENTIFY_MESSAGES[answer.kind] ?? UPLOAD_FAILED });
      })();
    }
  }, [update]);

  useEffect(() => {
    clearPendingPhotos();
    // Once, even when React runs effects twice in development.
    if (started.current) return;
    started.current = true;
    if (initial.length > 0) addFiles(initial);
  }, [initial, addFiles]);

  const remove = (item: Item) => {
    setItems((current) => current.filter((other) => other.key !== item.key));
    count.current -= 1;
    setNotice(null);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    if (item.id) void deleteUploadedPhoto(item.id);
  };

  const ready = items.filter((item) => item.status === "ready" && item.id);
  const busy = items.some((item) => item.status === "preparing" || item.status === "uploading");
  const canSend = consent && ready.length > 0 && !busy && !sending;

  const identify = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const answer = await requestIdentification(ready.map((item) => item.id!), consent);
    if (answer.kind === "ok") {
      setLeaving(true);
      router.push(`/plants/new/identify/${answer.sessionId}`);
      return;
    }
    setSending(false);
    setConsent(false);
    setError(IDENTIFY_MESSAGES[answer.kind] ?? IDENTIFY_MESSAGES.failed);
  };

  const closeDialog = useCallback(() => setDialogOpen(false), []);

  return (
    <section className={styles.screen} aria-labelledby="photos-title">
      <div className={styles.header}>
        <h1 id="photos-title" className={styles.title}>
          업로드한 사진
        </h1>
        <GuardedLink href="/plants/new" className={styles.back}>
          뒤로
        </GuardedLink>
      </div>

      <div className={styles.card}>
        <p className={styles.lead}>
          식물 한 그루의 사진을 1~{PHOTO_RULES.maxCount}장 올려 주세요. 잎, 꽃, 열매가 잘 보이면 더 정확합니다.
        </p>
        {items.length === 0 ? <p className={styles.note}>아직 올린 사진이 없습니다.</p> : null}
        <ul className={styles.photoGrid} aria-label="올린 사진">
          {items.map((item, index) => (
            <li key={item.key} className={styles.photoItem}>
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview of the user's own photo
                <img src={item.previewUrl} alt={`올린 사진 ${index + 1}`} className={styles.thumb} />
              ) : (
                <span className={`${styles.thumb} ${styles.noPhoto}`} role="img" aria-label={`사진 ${index + 1} 준비 중`}>
                  {item.status === "error" ? "오류" : "준비 중"}
                </span>
              )}
              <span className={styles.note} aria-live="polite">
                {item.status === "preparing" ? "사진 줄이는 중" : null}
                {item.status === "uploading" ? "올리는 중" : null}
                {item.status === "ready" ? "올림" : null}
                {item.status === "error" ? <span className={styles.error}>{item.message}</span> : null}
              </span>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => remove(item)}
                disabled={sending}
                aria-label={`사진 ${index + 1} 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
        {notice ? <p className={styles.note}>{notice}</p> : null}
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setDialogOpen(true)}
          disabled={items.length >= PHOTO_RULES.maxCount || sending}
        >
          + 사진 추가
        </button>
      </div>

      <div className={styles.card}>
        <label className={styles.choice}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={sending}
          />
          <span>Pl@ntNet에 사진을 보내 식물을 찾는 데 동의합니다.</span>
        </label>
        <p className={styles.note}>
          이번 요청에 한해 위 사진만 식물 식별 서비스 Pl@ntNet으로 보냅니다. 올린 사진은 이 앱의 비공개 저장소에
          보관합니다. 자세한 안내는 더보기에 있습니다.
        </p>
        {error ? (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
        <button type="button" className={styles.primary} onClick={identify} disabled={!canSend}>
          {sending ? "찾는 중…" : "사진으로 식물 찾기"}
        </button>
      </div>

      <div className={styles.actions}>
        <GuardedLink href="/plants/new" className={styles.secondary}>
          이름 검색으로 돌아가기
        </GuardedLink>
        <GuardedLink href="/plants/new/manual" className={styles.secondary}>
          직접 입력하기
        </GuardedLink>
      </div>

      {dialogOpen ? (
        <PhotoSourceDialog
          onCancel={closeDialog}
          onPick={(files) => {
            setDialogOpen(false);
            addFiles(files);
          }}
        />
      ) : null}
    </section>
  );
}

"use client";

import { useState } from "react";
import { PhotoSourceDialog } from "./PhotoSourceDialog";
import styles from "./plants.module.css";

/**
 * S05 화분 사진 (선택, wireframe "사진 미리보기"). [사진 고르기] opens the same
 * 촬영/갤러리 choice as S03; one photo is kept. The photo is sent with
 * [식물 추가하기] by the form, not by this field (it has no form name, so the
 * original file is never sent).
 */
export function PotPhotoPicker({
  previewUrl,
  preparing,
  error,
  onPick,
  onClear,
}: {
  previewUrl: string | null;
  preparing: boolean;
  error: string | null;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const [choosing, setChoosing] = useState(false);
  return (
    <div className={styles.field}>
      <span className={styles.label} id="pot-photo-label">
        화분 사진 (선택)
      </span>
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of the picked photo (blob: URL)
        <img src={previewUrl} alt="고른 화분 사진 미리보기" className={styles.photo} />
      ) : (
        <span className={`${styles.photo} ${styles.noPhoto}`} role="img" aria-label="사진 없음">
          사진 없음
        </span>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setChoosing(true)}
          disabled={preparing}
          aria-describedby="pot-photo-label"
        >
          {previewUrl ? "다른 사진 고르기" : "사진 고르기"}
        </button>
        {previewUrl ? (
          <button type="button" className={styles.secondary} onClick={onClear} disabled={preparing}>
            사진 빼기
          </button>
        ) : null}
      </div>
      {preparing ? (
        <p className={styles.note} role="status">
          사진을 준비하는 중입니다…
        </p>
      ) : null}
      {error ? (
        <p id="photo-error" className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.note}>사진은 나만 볼 수 있게 저장하고, 위치 정보(EXIF)는 지웁니다.</p>
      {choosing ? (
        <PhotoSourceDialog
          onPick={(files) => {
            setChoosing(false);
            if (files[0]) onPick(files[0]);
          }}
          onCancel={() => setChoosing(false)}
        />
      ) : null}
    </div>
  );
}

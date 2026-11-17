"use client";

import { useEffect, useRef, type ChangeEvent } from "react";
import { PICKABLE_TYPES } from "@/types/photo";
import styles from "./plants.module.css";

/**
 * 촬영/갤러리 선택 모달 (wireframe S03 [식물 스캔], 02 §S03). [카메라로 촬영]
 * opens the camera where the device has one; [갤러리에서 선택] allows several
 * photos. [취소] closes it and leaves the screen as it was.
 */
export function PhotoSourceDialog({
  onPick,
  onCancel,
}: {
  onPick: (files: File[]) => void;
  onCancel: () => void;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) onPick(files);
  };

  return (
    <div className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="photo-source-title" className={styles.dialog}>
        <h2 id="photo-source-title" className={styles.cardTitle}>
          사진 선택
        </h2>
        <button ref={first} type="button" className={styles.primary} onClick={() => camera.current?.click()}>
          카메라로 촬영
        </button>
        <button type="button" className={styles.secondary} onClick={() => gallery.current?.click()}>
          갤러리에서 선택
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          취소
        </button>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid="camera-input"
          onChange={picked}
        />
        <input
          ref={gallery}
          type="file"
          accept={PICKABLE_TYPES.join(",")}
          multiple
          hidden
          data-testid="gallery-input"
          onChange={picked}
        />
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { handOverPhotos } from "./pending-photos";
import { PhotoSourceDialog } from "./PhotoSourceDialog";
import styles from "./plants.module.css";

/** S03 [식물 스캔]: opens the photo source dialog, then S03-P with the picked photos. */
export function PhotoScanButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button type="button" className={styles.secondary} onClick={() => setOpen(true)}>
        식물 스캔
      </button>
      {open ? (
        <PhotoSourceDialog
          onCancel={close}
          onPick={(files) => {
            handOverPhotos(files);
            setOpen(false);
            router.push("/plants/new/photos");
          }}
        />
      ) : null}
    </>
  );
}

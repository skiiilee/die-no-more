"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PHOTO_RULES } from "@/types/photo";
import { prepareForUpload } from "@/ui/plants/photo-prep";

export type PhotoItem = {
  key: string;
  file: File;
  status: "preparing" | "ready" | "error";
  blob: Blob | null;
  previewUrl: string | null;
  message: string | null;
};

export const TOO_MANY = `사진은 ${PHOTO_RULES.maxCount}장까지 고를 수 있습니다. 나머지는 뺐습니다.`;

let nextKey = 0;

/**
 * Symptom photos for S07-A, kept in this tab only. Each is resized and
 * re-encoded in the browser (ADR-0003 D4) as soon as it is picked; previews
 * are released when removed or when the screen goes away.
 */
export function usePhotoList() {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const current = useRef<PhotoItem[]>([]);

  useEffect(() => {
    current.current = items;
  }, [items]);

  useEffect(
    () => () => {
      for (const item of current.current) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  const update = useCallback(
    (key: string, change: Partial<PhotoItem>) =>
      setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item))),
    [],
  );

  const add = useCallback(
    (files: File[]) => {
      const room = PHOTO_RULES.maxCount - current.current.length;
      const accepted = files.slice(0, Math.max(0, room));
      setNotice(files.length > accepted.length ? TOO_MANY : null);
      const added = accepted.map((file) => ({
        key: `symptom-${nextKey++}`,
        file,
        status: "preparing" as const,
        blob: null,
        previewUrl: null,
        message: null,
      }));
      current.current = [...current.current, ...added];
      setItems((list) => [...list, ...added]);
      for (const item of added) {
        void (async () => {
          const prepared = await prepareForUpload(item.file);
          if (!prepared.ok) update(item.key, { status: "error", message: prepared.message });
          else update(item.key, { status: "ready", blob: prepared.blob, previewUrl: URL.createObjectURL(prepared.blob) });
        })();
      }
    },
    [update],
  );

  const remove = useCallback((item: PhotoItem) => {
    current.current = current.current.filter((other) => other.key !== item.key);
    setItems((list) => list.filter((other) => other.key !== item.key));
    setNotice(null);
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }, []);

  const ready = items.filter((item): item is PhotoItem & { blob: Blob } => item.status === "ready" && item.blob !== null);
  const preparing = items.some((item) => item.status === "preparing");
  return { items, ready, preparing, notice, add, remove };
}

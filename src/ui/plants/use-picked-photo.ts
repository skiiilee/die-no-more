"use client";

import { useCallback, useEffect, useState } from "react";
import { prepareForUpload } from "./photo-prep";

/**
 * One photo picked for a pot (S05, S06 [사진 추가]). The original is resized
 * and re-encoded in the browser (ADR-0003 D4) and only that copy is kept and
 * sent; the server checks and re-encodes it again.
 */
export function usePickedPhoto() {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pick = useCallback(async (file: File): Promise<Blob | null> => {
    setPreparing(true);
    setError(null);
    const prepared = await prepareForUpload(file);
    setPreparing(false);
    if (!prepared.ok) {
      setError(prepared.message);
      return null;
    }
    setPhoto(prepared.blob);
    setPreviewUrl(URL.createObjectURL(prepared.blob));
    return prepared.blob;
  }, []);

  const clear = useCallback(() => {
    setPhoto(null);
    setPreviewUrl(null);
    setError(null);
  }, []);

  return { photo, previewUrl, preparing, error, pick, clear };
}

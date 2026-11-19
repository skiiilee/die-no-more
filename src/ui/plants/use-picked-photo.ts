"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prepareForUpload } from "./photo-prep";

/**
 * One photo picked for a pot (S05, S06 [사진 추가]). The original is resized
 * and re-encoded in the browser (ADR-0003 D4) and only that copy is kept and
 * sent; the server checks and re-encodes it again.
 *
 * A new pick replaces the old photo at once (PR #20 review P2): while it is
 * being prepared, and if it fails, no photo is selected, so the form can never
 * send an earlier photo the user meant to replace. Only the latest pick may
 * set the photo; a slower, earlier preparation that finishes later is ignored.
 */
export function usePickedPhoto() {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pick = useCallback(async (file: File): Promise<Blob | null> => {
    const request = ++latest.current;
    setPhoto(null);
    setPreviewUrl(null);
    setPreparing(true);
    setError(null);
    const prepared = await prepareForUpload(file);
    if (request !== latest.current) return null;
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
    latest.current += 1;
    setPhoto(null);
    setPreviewUrl(null);
    setPreparing(false);
    setError(null);
  }, []);

  return { photo, previewUrl, preparing, error, pick, clear };
}

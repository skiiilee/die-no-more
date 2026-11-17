"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { clearKeptPhotos } from "./pending-photos";

/**
 * Screens of the photo flow that may come back to S03-P with the same photos:
 * S03-P itself, S04-A (photo results) and S04-B (a candidate's details).
 */
const PHOTO_FLOW = [/^\/plants\/new\/photos$/, /^\/plants\/new\/identify\/[^/]+$/, /^\/plants\/new\/species\/[^/]+$/];

export function keepsPhotos(pathname: string): boolean {
  return PHOTO_FLOW.some((pattern) => pattern.test(pathname));
}

/**
 * Forgets the photos kept after a photo identification as soon as the user
 * leaves the photo flow (name search, manual entry, S05, another tab), so
 * they do not stay in the tab's memory (PR #17 review). Renders nothing.
 */
export function PhotoFlowGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (!keepsPhotos(pathname)) clearKeptPhotos();
  }, [pathname]);
  return null;
}

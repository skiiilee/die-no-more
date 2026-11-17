"use client";

import { useLinkStatus } from "next/link";
import { Spinner } from "@/ui/shell/Spinner";

/**
 * Put inside a <Link>: while the next screen is loading after a tap (for
 * example S04-B asking Trefle and Perenual), shows a spinner and says so to
 * screen readers, so the tap does not look ignored.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      {" "}
      <Spinner />
      <span role="status" className="visually-hidden">
        불러오는 중
      </span>
    </>
  );
}

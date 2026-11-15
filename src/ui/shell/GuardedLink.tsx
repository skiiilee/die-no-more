"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { confirmLeave } from "./unsaved-changes";

/**
 * next/link that asks before leaving a screen with unsaved input. Clicks that
 * open a new tab or window are left alone: the current screen stays open.
 */
export function GuardedLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    const opensElsewhere = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (opensElsewhere) return;
    if (!confirmLeave()) event.preventDefault();
  };
  return <Link {...props} onClick={handleClick} />;
}

import { useEffect } from "react";

/** Shown before in-app navigation drops unsaved input (02-wireframes §1). */
export const LEAVE_MESSAGE = "저장하지 않은 내용이 사라집니다. 이 화면을 나갈까요?";

/**
 * Whether a form on the current screen holds unsaved input. One screen is
 * open at a time, so a single flag is enough. Only client effects write it.
 */
let unsaved = false;

export function hasUnsavedChanges(): boolean {
  return unsaved;
}

/**
 * Asks before an in-app link leaves a screen with unsaved input.
 * Returns true when navigation may go ahead.
 */
export function confirmLeave(confirm: (message: string) => boolean = (message) => window.confirm(message)): boolean {
  if (!unsaved) return true;
  if (!confirm(LEAVE_MESSAGE)) return false;
  unsaved = false;
  return true;
}

/**
 * Marks the screen as holding unsaved input while `active` is true: in-app
 * links ask first (GuardedLink), and reload or tab close shows the browser's
 * own warning. The browser back button is not covered: the App Router has no
 * supported way to stop it (known limit, PR #13 review).
 */
export function useUnsavedChanges(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    unsaved = true;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      unsaved = false;
      window.removeEventListener("beforeunload", warn);
    };
  }, [active]);
}

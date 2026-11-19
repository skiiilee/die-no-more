"use client";

import { Fragment, useLayoutEffect, useRef, useState } from "react";

/**
 * With Cache Components, Next keeps a page the user left inside a hidden
 * React <Activity> and shows it again, state and all, when the user comes
 * back ([뒤로], a link, the browser back button). A screen that was written to
 * be thrown away after it hands off (S03-P: "찾는 중…", consent ticked) then
 * comes back stuck (device test 2026-11-19).
 *
 * This wrapper starts its children afresh, as on a new visit, whenever they
 * are shown again after being hidden. React's development double effect
 * (clean-up and set-up in the same task) is not a hide, so it does not count.
 * A layout effect is used so the stale screen is not painted first.
 */
export function FreshWhenShownAgain({ children }: { children: React.ReactNode }) {
  const [visit, setVisit] = useState(0);
  const active = useRef(false);
  const wasHidden = useRef(false);

  useLayoutEffect(() => {
    active.current = true;
    if (wasHidden.current) {
      wasHidden.current = false;
      setVisit((count) => count + 1);
    }
    return () => {
      active.current = false;
      // Still not set up again a moment later: the page really was hidden.
      setTimeout(() => {
        if (!active.current) wasHidden.current = true;
      }, 0);
    };
  }, []);

  return <Fragment key={visit}>{children}</Fragment>;
}

"use client";

/**
 * TUL-1274: one stable wrapper for every TalentLayoutInner branch.
 *
 * The talent layout re-runs on every RSC refresh (router.refresh, a
 * revalidating server action). Two of its branches returned a different tree
 * from the full shell: a profile read that missed returned the bare page, and
 * the locale-seed hop returned a redirect. On a refresh that hit one of them
 * the root element type changed, React unmounted the shell (AdminShellProvider
 * and every open panel with it) and the page lost scroll and open drawers.
 *
 * Every branch now returns this frame (same type, same position), and only the
 * inner content changes:
 *   - "shell": the full shell; remembered as the last good shell.
 *   - "degraded": a transient profile-read miss. After a good shell has been
 *     shown in this mount, keep rendering it (same element tree, so React
 *     reconciles instead of remounting; the page slot inside it still renders
 *     the current route). On a first load there is no shell yet: bare page,
 *     exactly as before.
 *   - "passthrough": render the content as is (the /talent root redirect and
 *     the locale-seed hard redirect must always run).
 */

import { useEffect, useState, type ReactNode } from "react";

export type TalentLayoutFrameMode = "shell" | "degraded" | "passthrough";

/** Pure choice of what the frame renders; exported for the render test. */
export function pickTalentFrameContent(
  mode: TalentLayoutFrameMode,
  next: ReactNode,
  lastShell: ReactNode,
): ReactNode {
  if (mode === "degraded" && lastShell != null) return lastShell;
  return next;
}

export function TalentLayoutFrame({ mode, children }: { mode: TalentLayoutFrameMode; children: ReactNode }) {
  // Seeded from the first render, so a direct entry never re-renders the frame
  // on mount (no state update during hydration). Later shells replace it; the
  // updater returns the same value when nothing changed, which React bails out on.
  const [lastShell, setLastShell] = useState<ReactNode>(() => (mode === "shell" ? children : null));
  useEffect(() => {
    if (mode === "shell") setLastShell((prev) => (prev === children ? prev : children));
  }, [mode, children]);
  return <>{pickTalentFrameContent(mode, children, lastShell)}</>;
}

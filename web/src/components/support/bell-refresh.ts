"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Poll cadence while the tab is visible, and the floor between two refreshes. */
export const BELL_POLL_MS = 90_000;
export const BELL_MIN_GAP_MS = 45_000;

/**
 * Pure throttle for the bell refresh. `user_notifications` is not in the
 * realtime publication, so the shell re-pulls its server data on a visible-tab
 * poll and when the tab regains focus. `tick` returns true when a refresh
 * should run now (visible and the last one is old enough).
 */
export function createBellRefreshGate(minGapMs: number = BELL_MIN_GAP_MS) {
  let last = 0;
  return {
    tick(nowMs: number, visible: boolean): boolean {
      if (!visible) return false;
      if (last !== 0 && nowMs - last < minGapMs) return false;
      last = nowMs;
      return true;
    },
  };
}

/** Keeps the bell current when support (or anything else) writes a notification. */
export function useBellRefresh(): void {
  const router = useRouter();
  useEffect(() => {
    const gate = createBellRefreshGate();
    gate.tick(Date.now(), true); // the page just loaded fresh data
    const run = () => {
      if (gate.tick(Date.now(), document.visibilityState === "visible")) router.refresh();
    };
    const timer = setInterval(run, BELL_POLL_MS);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [router]);
}

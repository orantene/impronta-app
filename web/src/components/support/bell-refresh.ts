"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Floor between two refreshes caused by a focus or visibility change. */
export const BELL_MIN_GAP_MS = 45_000;
/** At most one refresh per this window when notification inserts arrive. */
export const BELL_INSERT_MIN_GAP_MS = 10_000;

/**
 * Pure throttle for the bell refresh. `tick` returns true when a refresh
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

/**
 * Keeps the bell current when support (or anything else) writes a notification.
 * Realtime INSERTs on the user's own `user_notifications` rows (RLS limits
 * SELECT to `user_id = auth.uid()`) trigger a throttled refresh; refocusing the
 * tab is the fallback if the socket missed something. No interval poll.
 */
export function useBellRefresh(): void {
  const router = useRouter();
  useEffect(() => {
    const focusGate = createBellRefreshGate(BELL_MIN_GAP_MS);
    const insertGate = createBellRefreshGate(BELL_INSERT_MIN_GAP_MS);
    const onFocus = () => {
      if (focusGate.tick(Date.now(), document.visibilityState === "visible")) router.refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    let cancelled = false;
    let teardown: (() => void) | null = null;
    const supabase = createClient();
    if (supabase) {
      void supabase.auth.getUser().then(({ data }) => {
        const uid = data.user?.id;
        if (cancelled || !uid) return;
        const channel = supabase
          .channel(`tulala.bell.${uid}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "user_notifications",
              filter: `user_id=eq.${uid}`,
            },
            () => {
              if (insertGate.tick(Date.now(), true)) router.refresh();
            },
          )
          .subscribe();
        teardown = () => void supabase.removeChannel(channel);
      });
    }
    return () => {
      cancelled = true;
      teardown?.();
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);
}

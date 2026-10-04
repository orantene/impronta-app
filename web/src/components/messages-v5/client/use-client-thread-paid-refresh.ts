"use client";

/**
 * Soft return from `/pay` left `/c/t/[token]` stuck on an unpaid Pay card:
 * ClientThread only called `router.refresh()` after local actions, with no
 * poll / visibility / pageshow path. While an open payment_request is on
 * screen, refresh on focus/visibility and on a short interval.
 */

import { useEffect } from "react";

import type { ThreadMessage } from "@/lib/messaging/types";

import { clientThreadNeedsPaidRefresh } from "@/lib/messages-v5/client-thread-paid-refresh";

export function useClientThreadPaidRefresh(input: {
  messages: readonly ThreadMessage[];
  refresh: () => void;
  /** Poll while unpaid; default matches the guest dock (~4s). */
  intervalMs?: number;
}): void {
  const { messages, refresh, intervalMs = 4000 } = input;
  const needsPaid = clientThreadNeedsPaidRefresh(messages);

  useEffect(() => {
    if (!needsPaid) return;
    const bump = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") bump();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", bump);
    window.addEventListener("focus", bump);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", bump);
      window.removeEventListener("focus", bump);
    };
  }, [needsPaid, refresh]);

  useEffect(() => {
    if (!needsPaid) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [needsPaid, refresh, intervalMs]);
}

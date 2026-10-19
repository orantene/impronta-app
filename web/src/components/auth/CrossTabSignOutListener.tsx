"use client";

import { useEffect } from "react";

import { hasAuthCookie, SESSION_CHANNEL, shouldReloadOnSignOut } from "@/lib/auth/cross-tab-sign-out";

/** Renders nothing. Reloads this tab when another tab signs out, if this tab was signed in. */
export function CrossTabSignOutListener() {
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let hadSession = false;
    try {
      hadSession = hasAuthCookie(document.cookie);
    } catch {
      return;
    }
    if (!hadSession) return;
    const channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.onmessage = (event) => {
      // Never reload the tab that is itself signing out: that navigation cancels its sign-out POST.
      if (shouldReloadOnSignOut(event.data)) window.location.reload();
    };
    return () => channel.close();
  }, []);
  return null;
}

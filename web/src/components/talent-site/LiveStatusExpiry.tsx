"use client";

import { useEffect, useRef, useState } from "react";

import {
  LIVE_STATUS_ROOT_ATTR,
  liveStatusOnAt,
  msUntilExpiry,
  type LiveStatusRenderContext,
} from "@/lib/talent/live-status-render";

/** Calls `onExpire` at `until` (re-checked on tab focus: timers stall in sleep). */
function useExpiry(until: string | null, onExpire: () => void) {
  const cb = useRef(onExpire);
  useEffect(() => {
    cb.current = onExpire;
  }, [onExpire]);
  useEffect(() => {
    if (!until) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const check = () => {
      if (done) return;
      if (timer) clearTimeout(timer);
      const wait = msUntilExpiry(until, Date.now());
      if (wait === null) return;
      if (wait === 0) {
        done = true;
        cb.current();
        return;
      }
      timer = setTimeout(check, wait);
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [until]);
}

/**
 * G3b client expiry island. Mounted inside the talent site root; at `until` it
 * sets the root's `data-emergencies-today` to "off", which hides every
 * `data-live-when="on"` node (LIVE_STATUS_CSS).
 */
export function LiveStatusExpiry({ until }: { until: string | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  useExpiry(until, () => {
    ref.current?.closest("[data-talent-max-site]")?.setAttribute(LIVE_STATUS_ROOT_ATTR, "off");
  });
  return <span ref={ref} hidden data-live-status-expiry="" />;
}

/** For client widgets (e.g. the dock): true until the context expires. */
export function useEmergenciesToday(ctx: LiveStatusRenderContext | null | undefined): boolean {
  const [on, setOn] = useState(() => liveStatusOnAt(ctx, Date.now()));
  // setOn bails out when the boolean is unchanged, so a new ctx object each render is cheap.
  useEffect(() => setOn(liveStatusOnAt(ctx, Date.now())), [ctx]);
  useExpiry(on ? ctx?.emergenciesUntil ?? null : null, () => setOn(false));
  return on;
}

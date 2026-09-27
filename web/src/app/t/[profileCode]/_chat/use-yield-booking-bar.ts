"use client";

/**
 * BJ-07 — lift Hablar when the services catalog sticky bar is showing so the
 * Continuar float and the pill do not fight for the same bottom-right corner.
 */

import { useEffect, useState } from "react";

import {
  GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_PX,
} from "./mini-chat-styles";

export function useYieldBookingBar(mounted: boolean, narrowLauncher: boolean): {
  yieldBookingBar: boolean;
  launcherBottomPx: number;
} {
  const [yieldBookingBar, setYieldBookingBar] = useState(false);

  useEffect(() => {
    if (!mounted) return;
    const measure = () => {
      const bar = document.querySelector<HTMLElement>(".cb-bar[data-show='true']");
      setYieldBookingBar(Boolean(bar));
    };
    measure();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    mo?.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-show", "data-has-selection", "class"],
    });
    return () => mo?.disconnect();
  }, [mounted]);

  const launcherBottomPx =
    (narrowLauncher
      ? GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX
      : GUEST_CHAT_LAUNCHER_BOTTOM_PX) +
    (yieldBookingBar ? GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX : 0);

  return { yieldBookingBar, launcherBottomPx };
}

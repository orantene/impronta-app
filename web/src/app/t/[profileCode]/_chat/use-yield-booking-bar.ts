"use client";

/**
 * BJ-07 / AUD-025 — lift Hablar when the services catalog sticky bar is showing
 * so the Continuar float and the pill do not fight for the same bottom-right
 * corner (and so Seleccionar on the last visible rows stays tappable at 390).
 */

import { useEffect, useState } from "react";

import {
  GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_PX,
} from "./mini-chat-styles";

/** Gap between the Continuar bar top edge and the launcher bottom edge. */
const BOOKING_BAR_CLEARANCE_PX = 16;

export function useYieldBookingBar(mounted: boolean, narrowLauncher: boolean): {
  yieldBookingBar: boolean;
  launcherBottomPx: number;
  /** AUD-044 — the catalog selection dock is up; the FAB tucks into it. */
  selectionDockUp: boolean;
} {
  const [yieldBookingBar, setYieldBookingBar] = useState(false);
  const [selectionDockUp, setSelectionDockUp] = useState(false);
  const [barLiftPx, setBarLiftPx] = useState(GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX);

  useEffect(() => {
    if (!mounted) return;
    const measure = () => {
      // The pill capsule carries its own chat button: the FAB tucks away too.
      const pill = document.querySelector<HTMLElement>(".cb-bar[data-bar-style='pill'][data-show='true']");
      setSelectionDockUp(Boolean(document.querySelector(".cb-dock[data-show='true']") || pill));
      if (pill) {
        setYieldBookingBar(false);
        return;
      }
      const bar = document.querySelector<HTMLElement>(".cb-bar[data-show='true']");
      if (!bar) {
        setYieldBookingBar(false);
        return;
      }
      // display:none bars (desktop idle) still match the attribute — skip them.
      const style = window.getComputedStyle(bar);
      if (style.display === "none" || style.visibility === "hidden") {
        setYieldBookingBar(false);
        return;
      }
      const h = Math.ceil(bar.getBoundingClientRect().height);
      setYieldBookingBar(true);
      setBarLiftPx(Math.max(GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX, h + BOOKING_BAR_CLEARANCE_PX));
    };
    measure();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    mo?.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-show", "data-has-selection", "class", "style"],
    });
    window.addEventListener("resize", measure);
    return () => {
      mo?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mounted]);

  const launcherBottomPx =
    (narrowLauncher
      ? GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX
      : GUEST_CHAT_LAUNCHER_BOTTOM_PX) + (yieldBookingBar ? barLiftPx : 0);

  return { yieldBookingBar, launcherBottomPx, selectionDockUp };
}

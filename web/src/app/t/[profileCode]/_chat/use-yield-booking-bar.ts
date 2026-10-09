"use client";

/**
 * BJ-07 / AUD-025 — lift Hablar when bottom chrome is showing so Continuar,
 * the language suggestion strip, and the legacy Maison bar do not fight the
 * same bottom-right corner (and so Seleccionar on the last rows stays tappable).
 */

import { useEffect, useState } from "react";

import {
  GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_PX,
} from "./mini-chat-styles";

/** Gap between a sticky bottom chrome top edge and the launcher bottom edge. */
const BOOKING_BAR_CLEARANCE_PX = 16;

function visibleFixedChrome(el: HTMLElement | null): el is HTMLElement {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return el.getBoundingClientRect().height > 0;
}

function chromeLiftFor(el: HTMLElement): number {
  return Math.ceil(window.innerHeight - el.getBoundingClientRect().top) + BOOKING_BAR_CLEARANCE_PX;
}

export function useYieldBookingBar(mounted: boolean, narrowLauncher: boolean): {
  yieldBookingBar: boolean;
  launcherBottomPx: number;
  /** AUD-044 — the catalog selection dock is up; the FAB tucks into it. */
  selectionDockUp: boolean;
} {
  const [yieldBookingBar, setYieldBookingBar] = useState(false);
  const [selectionDockUp, setSelectionDockUp] = useState(false);
  const [chromeLiftPx, setChromeLiftPx] = useState(0);

  useEffect(() => {
    if (!mounted) return;
    const measure = () => {
      // The pill capsule carries its own chat button: the FAB tucks away too.
      const pill = document.querySelector<HTMLElement>(".cb-bar[data-bar-style='pill'][data-show='true']:not([data-top='true'])");
      const dock = document.querySelector<HTMLElement>(".cb-dock[data-show='true']");
      setSelectionDockUp(Boolean(visibleFixedChrome(dock) || visibleFixedChrome(pill)));

      let lift = 0;
      let bookingUp = false;

      if (!visibleFixedChrome(pill)) {
        const bar = document.querySelector<HTMLElement>(".cb-bar[data-show='true']:not([data-top='true'])");
        // display:none bars (desktop idle) still match the attribute — skip them.
        if (visibleFixedChrome(bar)) {
          bookingUp = true;
          lift = Math.max(lift, Math.max(GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX, chromeLiftFor(bar)));
        }
      }

      // Locale suggestion + legacy Maison bar: lift Hablar even when the booking
      // dock owns language-bar stacking (dock idle → strip is still guest-visible).
      const locale = document.querySelector<HTMLElement>("[data-locale-suggestion]");
      if (visibleFixedChrome(locale)) {
        lift = Math.max(lift, chromeLiftFor(locale));
      }
      const mnBar = document.querySelector<HTMLElement>(".mn-bar[data-show='true']");
      if (visibleFixedChrome(mnBar)) {
        bookingUp = true;
        lift = Math.max(lift, Math.max(GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX, chromeLiftFor(mnBar)));
      }

      setYieldBookingBar(bookingUp);
      setChromeLiftPx(lift);
    };
    measure();
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    mo?.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-show", "data-top", "data-has-selection", "data-locale-suggestion", "class", "style", "hidden"],
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
      : GUEST_CHAT_LAUNCHER_BOTTOM_PX) + chromeLiftPx;

  return { yieldBookingBar, launcherBottomPx, selectionDockUp };
}

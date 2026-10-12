"use client";

/**
 * BJ-07 / AUD-025 — lift Hablar when bottom chrome is showing so Continuar
 * and the legacy Maison bar do not fight the same bottom-right corner (and so
 * Seleccionar on the last rows stays tappable).
 */

import { useLayoutEffect, useState } from "react";

import {
  GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX,
  GUEST_CHAT_LAUNCHER_BOTTOM_PX,
} from "./mini-chat-styles";

/** Gap between a sticky bottom chrome top edge and the launcher bottom edge (GRK-036). */
export const BOOKING_BAR_CLEARANCE_PX = 24;

export const BOTTOM_CHROME_SELECTOR = ".cb-bar, .cb-dock, .mn-bar";

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

  // GRK-036: layout effect so Hablar clears the sticky bar before first paint
  // (useEffect left the FAB at bottom:24 for a frame on top of Continuar).
  useLayoutEffect(() => {
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

      // The locale toast is not measured: it sits bottom-left and clears the
      // launcher through --floating-chrome-bottom, so lifting Hablar over it
      // would only make the launcher jump when the toast appears.
      const mnBar = document.querySelector<HTMLElement>(".mn-bar[data-show='true']");
      if (visibleFixedChrome(mnBar)) {
        bookingUp = true;
        lift = Math.max(lift, Math.max(GUEST_CHAT_LAUNCHER_BOOKING_BAR_LIFT_PX, chromeLiftFor(mnBar)));
      }
      // TUL-516 F2: lift above the cookie card if CSS hide has not applied yet.
      const consent = document.querySelector<HTMLElement>("[data-consent-banner]");
      if (visibleFixedChrome(consent)) {
        lift = Math.max(lift, chromeLiftFor(consent));
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
      attributeFilter: [
        "data-show",
        "data-top",
        "data-has-selection",
        "data-consent-banner",
        "class",
        "style",
        "hidden",
      ],
    });
    window.addEventListener("resize", measure);
    // The bar fades in when data-top drops: the mutation fires while its
    // visibility still reads "hidden", so measure again once the fade ends.
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target instanceof Element && e.target.matches(BOTTOM_CHROME_SELECTOR)) measure();
    };
    document.addEventListener("transitionend", onTransitionEnd, true);
    return () => {
      mo?.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("transitionend", onTransitionEnd, true);
    };
  }, [mounted]);

  const launcherBottomPx =
    (narrowLauncher
      ? GUEST_CHAT_LAUNCHER_BOTTOM_NARROW_PX
      : GUEST_CHAT_LAUNCHER_BOTTOM_PX) + chromeLiftPx;

  return { yieldBookingBar, launcherBottomPx, selectionDockUp };
}

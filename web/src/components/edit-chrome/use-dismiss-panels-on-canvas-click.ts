"use client";

import { useEffect } from "react";

/** Clicks on these chrome surfaces never count as "click-around" dismissals. */
const CHROME_SURFACES = [
  "[data-edit-topbar]",
  "[data-edit-drawer]",
  "[data-edit-overlay]",
  "[data-command-dock]",
  "[data-inspector-command-rail]",
  "button.ec-rail-item",
].join(", ");

/**
 * Canvas / empty chrome click dismisses site Design + Theme so the page
 * yields space while a panel is open. Clicks on the topbar, drawers,
 * overlays and the command / inspector rails are ignored.
 */
export function useDismissPanelsOnCanvasClick(
  brandPanelOpen: boolean,
  themeOpen: boolean,
  closeBrandPanel: () => void,
  closeTheme: () => void,
) {
  useEffect(() => {
    if (!brandPanelOpen && !themeOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(CHROME_SURFACES)) return;
      if (brandPanelOpen) closeBrandPanel();
      if (themeOpen) closeTheme();
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [brandPanelOpen, themeOpen, closeBrandPanel, closeTheme]);
}

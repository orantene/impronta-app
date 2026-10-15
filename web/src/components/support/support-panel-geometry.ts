import type { CSSProperties } from "react";
import { COLORS } from "./support-tokens";

export function supportPanelContainerStyle(compactSheet: boolean): CSSProperties {
  if (compactSheet) {
    return {
      position: "fixed",
      inset: 0,
      width: "100vw",
      height: "100dvh",
      borderRadius: 0,
      background: COLORS.surface,
      zIndex: 390,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      paddingBottom: "env(safe-area-inset-bottom)",
    };
  }
  // Desktop: a full-height drawer anchored to the right edge that PUSHES the
  // page (SupportPanel sets html[data-tulala-support-open="push"], which pads
  // <body> by SUPPORT_DRAWER_WIDTH), per the B-002 mockups. Compact stays a
  // full-screen sheet above.
  return {
    position: "fixed",
    right: 0,
    top: 0,
    width: SUPPORT_DRAWER_WIDTH,
    height: "100dvh",
    borderRadius: 0,
    background: COLORS.card,
    boxShadow: "-18px 0 48px rgba(11,11,13,0.10)",
    borderLeft: `1px solid ${COLORS.border}`,
    zIndex: 390,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
}

/** Width of the desktop drawer; also the page's padding-right while it is open. */
export const SUPPORT_DRAWER_WIDTH = 400;

/**
 * TUL-982 / TUL-947: on a phone the floating launcher sat at 62% of the
 * viewport, on top of cards on nearly every screen, and the connection-lost
 * banner covered it. Compact: a smaller circle in the bottom-right corner
 * ABOVE the 65px tab bar (62px row + 1px border + inset, 12px gap, same base as messages-mobile-css.ts), lifted again while the banner shows, and hidden
 * while a text field has focus (the on-screen keyboard).
 */
export const SUPPORT_LAUNCHER_COMPACT_BOTTOM = "calc(65px + 12px + env(safe-area-inset-bottom, 0px))";
export const SUPPORT_LAUNCHER_COMPACT_CSS = `
  @media (max-width: 520px), (pointer: coarse) {
    html:has([data-tulala-offline-banner]) button[data-tulala-support-launcher=""] {
      bottom: calc(140px + env(safe-area-inset-bottom, 0px)) !important;
    }
    html:has(input:focus, textarea:focus, select:focus) button[data-tulala-support-launcher=""] {
      visibility: hidden !important;
      pointer-events: none !important;
    }
  }
`;

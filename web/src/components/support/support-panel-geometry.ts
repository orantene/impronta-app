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

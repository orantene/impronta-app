/**
 * mini-chat-panel-geometry.ts — Jon 360 Phase 7. The MiniChatPanel mini-mode
 * outer-container geometry, split out of MiniChatPanel.tsx to keep that
 * orchestrator under the 800-line hard cap.
 *
 * Two shapes:
 *   • DESKTOP — the floating ~408px card anchored bottom-right (unchanged).
 *   • COMPACT (phone-class viewport) — front-door v27 mockup Phone state:
 *       fixed sheet from `top: 8vh` to the bottom edge, width capped at 420px
 *       and centered, top corners only (`20px 20px 0 0`). The composer stays
 *       above the soft keyboard by lifting `bottom` to the Visual Viewport
 *       inset (never an invented keyboard height).
 *
 * Surface + border come from the active C palette (light by default; dark for
 * noir tenants), so the same builder serves both surface modes.
 */

import type { CSSProperties } from "react";

import { FONT, GUEST_CHAT_PANEL_BOTTOM_PX, type Palette } from "./mini-chat-styles";

/** Mockup Phone sheet top inset — leave the site peeking above the sheet. */
export const COMPACT_SHEET_TOP = "8vh";
/** Mockup Phone sheet max width (centered on wider phones / tablets). */
export const COMPACT_SHEET_MAX_WIDTH = "min(420px, 100%)";
/** Mockup Phone sheet corner radius — top only, flush with the keyboard edge. */
export const COMPACT_SHEET_RADIUS = "20px 20px 0 0";

/**
 * Build the mini-mode container style for the given surface palette + viewport.
 *
 * @param keyboardInsetPx Soft-keyboard inset from `useVisualViewportInset`.
 *   Only applied in compact mode; desktop ignores it.
 */
export function miniPanelContainerStyle(
  palette: Palette,
  compactSheet: boolean,
  keyboardInsetPx = 0,
): CSSProperties {
  if (compactSheet) {
    // Lift the sheet above the soft keyboard when the Visual Viewport reports
    // coverage. When closed, keep the home-indicator safe area.
    const bottom =
      keyboardInsetPx > 0
        ? `${keyboardInsetPx}px`
        : "env(safe-area-inset-bottom)";
    return {
      position: "fixed",
      top: COMPACT_SHEET_TOP,
      left: 0,
      right: 0,
      bottom,
      // Centered on wide phone / small-tablet widths, matching mockup
      // `width: min(420px, 100%); margin: 0 auto`.
      width: COMPACT_SHEET_MAX_WIDTH,
      marginLeft: "auto",
      marginRight: "auto",
      height: "auto",
      maxHeight: "none",
      zIndex: 96, // above the launcher pill (95) so the sheet covers it
      display: "flex",
      flexDirection: "column",
      background: palette.surface,
      borderRadius: COMPACT_SHEET_RADIUS,
      border: `1px solid ${palette.border}`,
      borderBottom: "none",
      boxShadow: "0 -12px 40px -16px rgba(16,18,29,0.28)",
      overflow: "hidden",
      fontFamily: FONT,
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
    };
  }
  // DOCK v2 — a bigger, calmer messages-app footprint. Widened to ~408px and
  // grown toward a real chat product's height so the conversation dominates and
  // the new bottom-tab nav + composer have room to breathe. Still clamps to the
  // viewport (never wider than the screen, never taller than the visible area
  // above the launcher pill).
  return {
    position: "fixed",
    right: "max(16px, env(safe-area-inset-right))",
    bottom: `calc(${GUEST_CHAT_PANEL_BOTTOM_PX}px + env(safe-area-inset-bottom))`,
    zIndex: 90,
    width: "min(408px, calc(100vw - 32px))",
    // The panel is anchored GUEST_CHAT_PANEL_BOTTOM_PX (194) up from the bottom,
    // so the vertical room it may occupy is (100vh - bottom anchor - a top
    // margin). Reserving only 120px let a tall panel run its header off the top
    // on any viewport shorter than ~914px (short laptops, split-screen, devtools
    // heights). Reserve the real anchor + 24px top breathing room so the slim
    // header is always in view; the min(720) cap still governs tall screens.
    height: `min(720px, calc(100dvh - ${GUEST_CHAT_PANEL_BOTTOM_PX + 24}px))`,
    maxHeight: `calc(100dvh - ${GUEST_CHAT_PANEL_BOTTOM_PX + 24}px)`,
    display: "flex",
    flexDirection: "column",
    background: palette.surface,
    borderRadius: 20,
    border: `1px solid ${palette.border}`,
    boxShadow:
      "0 28px 68px -20px rgba(16,18,29,0.48), 0 8px 22px -10px rgba(16,18,29,0.26)",
    overflow: "hidden",
    fontFamily: FONT,
  };
}

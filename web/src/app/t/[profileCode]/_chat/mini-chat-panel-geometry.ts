/**
 * mini-chat-panel-geometry.ts — Jon 360 Phase 7. The MiniChatPanel mini-mode
 * outer-container geometry, split out of MiniChatPanel.tsx to keep that
 * orchestrator under the 800-line hard cap.
 *
 * Two shapes:
 *   • DESKTOP — the floating ~380px card anchored bottom-right (unchanged).
 *   • COMPACT (phone-class viewport) — a TRUE full-screen sheet: 100dvh (dynamic
 *     viewport so it tracks the mobile URL bar + soft keyboard), pinned to all
 *     four edges with safe-area insets, no corner radius / float shadow. The
 *     composer (the column's last flex child) then sits just above the keyboard.
 *
 * Surface + border come from the active C palette (light by default; dark for
 * noir tenants), so the same builder serves both surface modes.
 */

import type { CSSProperties } from "react";

import { FONT, GUEST_CHAT_PANEL_BOTTOM_PX, type Palette } from "./mini-chat-styles";

/** Build the mini-mode container style for the given surface palette + viewport. */
export function miniPanelContainerStyle(
  palette: Palette,
  compactSheet: boolean,
): CSSProperties {
  if (compactSheet) {
    return {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      // 100dvh tracks the *dynamic* viewport (collapses with the mobile URL bar
      // and the on-screen keyboard) so the composer is never pushed off-screen.
      height: "100dvh",
      // Safe-area insets keep content clear of the notch + home indicator.
      paddingTop: "env(safe-area-inset-top)",
      paddingBottom: "env(safe-area-inset-bottom)",
      paddingLeft: "env(safe-area-inset-left)",
      paddingRight: "env(safe-area-inset-right)",
      zIndex: 96, // above the launcher pill (95) so the sheet covers it
      width: "100%",
      maxHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      background: palette.surface,
      borderRadius: 0,
      border: "none",
      boxShadow: "none",
      overflow: "hidden",
      fontFamily: FONT,
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

/**
 * mobile-edit-mode — pure logic for the Wave-6C mobile-first editing mode
 * (job #35), extracted so the "mobile mode is client state, never a
 * navigation" contract (W1-L5) is unit-testable in isolation.
 *
 * Two concerns live here, both pure:
 *
 *   1. {@link resolveMobileEditModeTransition} — given the requested next
 *      on/off value and the current device tier, returns the client-state
 *      mutations to apply (device pin, preview-frame reset, leave-preview,
 *      body dataset cleanup). Critically it returns NOTHING that navigates:
 *      no URL, no router call, no query param. Entering/exiting mobile edit
 *      is a viewport/mode switch, and a viewport/mode switch must never be a
 *      page navigation (which would remount the editor tree and lose
 *      selection + scroll + undo). The reducer makes that guarantee explicit
 *      and testable.
 *
 *   2. {@link clampMobileEditPanelLeft} — the fixed-position left offset for
 *      the "Mobile editing" HUD, clamped so the panel is always fully
 *      on-screen (never clipped past the left OR right viewport edge), the
 *      same on-screen discipline the other dock/floating panels follow.
 */

import type { EditDevice } from "./edit-context";

/** The client-state effects of a mobile-edit-mode transition. Pure data — the
 *  caller (edit-context) applies each field through its existing setters. No
 *  field implies or requires a navigation. */
export interface MobileEditModeTransition {
  /** Device tier to pin the canvas to (reuses the Wave-2B viewport sync). */
  device: EditDevice;
  /** Reset the responsive-preview frame override (only when the tier changes,
   *  matching `setDevice`'s own reset so a custom width never carries over). */
  resetPreviewFrame: boolean;
  /** Entering mobile edit leaves visitor-preview (the two are mutually
   *  exclusive: preview hides all chrome, mobile-edit ADDS a chrome panel).
   *  `null` = leave the previewing flag untouched. */
  leavePreview: boolean | null;
  /** Clear `document.body.dataset.editPreview` (entering only). */
  clearBodyEditPreview: boolean;
}

/**
 * Resolve the pure client-state transition for entering (`next === true`) or
 * exiting (`next === false`) mobile edit mode.
 *
 * Entering pins the canvas to `mobile` and leaves preview; exiting returns to
 * `desktop` editing. The preview-frame reset only fires when the device tier
 * actually changes — identical to `setDevice`'s own behaviour — so a redundant
 * toggle is a no-op on the frame. Nothing here touches the URL or router.
 */
export function resolveMobileEditModeTransition(
  next: boolean,
  prevDevice: EditDevice,
): MobileEditModeTransition {
  if (next) {
    return {
      device: "mobile",
      resetPreviewFrame: prevDevice !== "mobile",
      leavePreview: true,
      clearBodyEditPreview: true,
    };
  }
  return {
    device: "desktop",
    resetPreviewFrame: prevDevice !== "desktop",
    leavePreview: null,
    clearBodyEditPreview: false,
  };
}

/** Inputs for {@link clampMobileEditPanelLeft}. */
export interface MobileEditPanelLeftInput {
  /** Is the Structure navigator rail expanded? */
  navigatorOpen: boolean;
  /** Expanded navigator width (px). */
  navigatorWidth: number;
  /** Collapsed navigator hairline rail width (px). */
  collapsedRailPx: number;
  /** The panel's own width (px). */
  panelWidth: number;
  /** Current viewport width (px). `null`/`0`/non-finite → unknown (SSR/first
   *  paint): fall back to the un-clamped navigator-relative offset. */
  viewportWidth: number | null;
  /** Minimum gap to keep between the panel and either viewport edge (px). */
  edgeInset: number;
}

/**
 * The fixed `left` (px) for the mobile-edit HUD, clamped fully on-screen.
 *
 * Preferred position sits just right of the navigator rail. When the viewport
 * width is known we clamp so the panel never runs past the right edge (which
 * on narrow viewports would otherwise push it — and its content — off-screen)
 * and never sits closer than `edgeInset` to the left edge. When the viewport
 * is unknown (SSR / pre-measure) we return the preferred offset unchanged.
 */
export function clampMobileEditPanelLeft(input: MobileEditPanelLeftInput): number {
  const {
    navigatorOpen,
    navigatorWidth,
    collapsedRailPx,
    panelWidth,
    viewportWidth,
    edgeInset,
  } = input;

  const railWidth = navigatorOpen ? navigatorWidth : collapsedRailPx;
  const preferred = railWidth + edgeInset;

  if (viewportWidth == null || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return preferred;
  }

  // Rightmost left that still keeps the whole panel on-screen. Floored at
  // `edgeInset` so a viewport narrower than the panel still pins to the left
  // gutter (the panel's own max-width handles the shrink) rather than going
  // negative and clipping off the LEFT edge.
  const maxLeft = Math.max(edgeInset, viewportWidth - panelWidth - edgeInset);
  return Math.min(Math.max(preferred, edgeInset), maxLeft);
}

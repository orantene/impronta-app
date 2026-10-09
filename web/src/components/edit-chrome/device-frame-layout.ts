/**
 * device-frame-layout — pure geometry for TUL-397 builder gaps:
 *   - Ken-Burns scale overflow math (hypothesis only — see hero-shift-measure)
 *   - tablet/mobile iframe host gutters so the Mobile/Tablet editing HUD
 *     and inspector dock sit beside the canvas, not over it
 *   - iframe warm-keep readiness (blank-frame skeleton)
 *
 * No React / DOM — unit-tested in isolation.
 */

import {
  COLLAPSED_NAVIGATOR_RAIL_PX,
  INSPECTOR_DOCK_WIDTH_PX,
  resolveDeviceFrameHorizontalPadding,
} from "./workspace-layout";

/** Same union as EditDevice (wide/compact preview tiers); local to stay React-free. */
export type DeviceFrameTier = "desktop" | "tablet" | "mobile" | "wide" | "compact";

/** Peak Ken-Burns scale on `.site-hero__slide` (globals.css hero-slide-fade). */
export const HERO_SLIDE_PEAK_SCALE = 1.08;

/**
 * Width of the Mobile/Tablet editing HUD (`mobile-edit-panel.tsx` PANEL_WIDTH)
 * plus the gap it keeps from the navigator rail (PANEL_EDGE_INSET).
 */
export const MOBILE_EDIT_HUD_RESERVE_PX = 296 + 14;

/**
 * Horizontal overflow a scaled full-bleed slide introduces when the hero
 * clips with `overflow: hidden` (which still allows scrollIntoView / focus
 * to scroll the box). At a 1340px canvas, scale(1.08) → ~107px — the
 * measured left shift on qa-fresh-studio-2.
 */
export function heroSlideOverflowPx(
  viewportWidth: number,
  peakScale: number = HERO_SLIDE_PEAK_SCALE,
): number {
  if (!(viewportWidth > 0) || !(peakScale > 1)) return 0;
  return Math.round(viewportWidth * (peakScale - 1));
}

/** Whether the Mobile/Tablet editing HUD is open for this device/mode. */
export function isDeviceEditingHudOpen(input: {
  device: DeviceFrameTier;
  mobileEditMode: boolean;
}): boolean {
  if (input.mobileEditMode) return true;
  return input.device === "tablet";
}

/**
 * Extra left inset the device-frame host must reserve so the
 * Mobile/Tablet editing HUD docks beside the iframe, not over it.
 */
export function resolveDeviceFrameHudLeftReserve(input: {
  device: DeviceFrameTier;
  mobileEditMode: boolean;
}): number {
  return isDeviceEditingHudOpen(input) ? MOBILE_EDIT_HUD_RESERVE_PX : 0;
}

export interface ResolveDeviceFrameHostPaddingInput {
  isPhone: boolean;
  navigatorOpen: boolean;
  navigatorWidth: number;
  inspectorOpen: boolean;
  inspectorWidth?: number;
  device: DeviceFrameTier;
  mobileEditMode: boolean;
}

/**
 * Padding for the tablet/mobile iframe host. Always uses reserve-gutters so
 * open navigator / inspector / editing HUD sit beside the canvas (TUL-397 #12).
 */
export function resolveDeviceFrameHostPadding(
  input: ResolveDeviceFrameHostPaddingInput,
): { left: number; right: number } {
  const base = resolveDeviceFrameHorizontalPadding({
    // Device frames always reserve chrome gutters — fullBleed overlay is for
    // the desktop canvas only (floating panels over the live storefront).
    mode: "reserveGutters",
    isPhone: input.isPhone,
    navigatorOpen: input.navigatorOpen,
    navigatorWidth: input.navigatorWidth,
    inspectorOpen: input.inspectorOpen,
    inspectorWidth: input.inspectorWidth ?? INSPECTOR_DOCK_WIDTH_PX,
  });
  if (input.isPhone) return base;
  const hud = resolveDeviceFrameHudLeftReserve({
    device: input.device,
    mobileEditMode: input.mobileEditMode,
  });
  // When the navigator is collapsed, the HUD still needs the hairline rail
  // accounted for — resolveDeviceFrameHorizontalPadding already returns the
  // collapsed rail width; we only add the HUD body.
  return { left: base.left + hud, right: base.right };
}

/** True once this warm-kept iframe has fired `load` at least once. */
export function isDeviceIframeReady(
  loadedTiers: ReadonlySet<DeviceFrameTier>,
  tier: DeviceFrameTier,
): boolean {
  return loadedTiers.has(tier);
}

/**
 * Show the translated skeleton when the ACTIVE non-desktop tier has not
 * finished its first load. Warm-kept already-loaded tiers flip instantly.
 */
export function shouldShowDeviceFrameSkeleton(input: {
  device: DeviceFrameTier;
  loadedTiers: ReadonlySet<DeviceFrameTier>;
}): boolean {
  // desktop + wide share the live storefront DOM (no warm-kept iframe).
  if (input.device === "desktop" || input.device === "wide") return false;
  return !isDeviceIframeReady(input.loadedTiers, input.device);
}

/** Collapse helper used by tests — mirrors navigator collapsed rail. */
export const DEVICE_FRAME_COLLAPSED_RAIL_PX = COLLAPSED_NAVIGATOR_RAIL_PX;

/**
 * Advanced-mode visibility helpers (W2-C4) — PURE, no React / no `window`.
 *
 * "Top minimal": the default editor (Advanced OFF) hides power-user surfaces so
 * the everyday path stays uncluttered. Nothing is REMOVED from the data model or
 * the freeform / AI capability — these helpers only decide which editing tabs
 * and viewport tiers the chrome SHOWS. Flipping Advanced ON returns everything.
 *
 * Kept dependency-free (only type-only imports) so the gating logic is unit
 * tested without mounting React or touching `localStorage`.
 */

import type { InspectorTabKey } from "./inspector-tab-config";
import type { EditDevice } from "./edit-context";

/**
 * Inspector-rail tabs hidden until Advanced is ON. The default rail shows
 * Layout · Content · Style; Data (bindings) and Motion move behind Advanced.
 * A node keeps any Data/Motion overrides it already has — the STYLES still
 * render; only the editing TAB is hidden.
 */
export const ADVANCED_ONLY_INSPECTOR_TABS: ReadonlySet<InspectorTabKey> =
  new Set<InspectorTabKey>(["data", "motion"]);

/**
 * Filter a resolved list of inspector tab keys by the Advanced flag. With
 * Advanced OFF, `data` and `motion` drop out (order otherwise preserved); with
 * Advanced ON, the list is returned unchanged.
 */
export function filterInspectorTabsByAdvanced(
  keys: ReadonlyArray<InspectorTabKey>,
  advanced: boolean,
): InspectorTabKey[] {
  if (advanced) return [...keys];
  return keys.filter((k) => !ADVANCED_ONLY_INSPECTOR_TABS.has(k));
}

/**
 * True when the resolved tab list contains at least one Advanced-only tab that
 * is currently hidden — lets the chrome show a subtle "Advanced has more" hint
 * without duplicating the membership rule.
 */
export function hasHiddenAdvancedInspectorTabs(
  resolvedKeys: ReadonlyArray<InspectorTabKey>,
  advanced: boolean,
): boolean {
  if (advanced) return false;
  return resolvedKeys.some((k) => ADVANCED_ONLY_INSPECTOR_TABS.has(k));
}

/** Viewport tiers always available (Advanced OFF). */
export const DEFAULT_VIEWPORT_TIERS: ReadonlyArray<EditDevice> = [
  "desktop",
  "tablet",
  "mobile",
];

/** Extra viewport tiers revealed only when Advanced is ON. */
export const ADVANCED_ONLY_VIEWPORT_TIERS: ReadonlyArray<EditDevice> = [
  "wide",
  "compact",
];

/**
 * The ordered set of viewport-tier keys the device switcher offers. Advanced
 * OFF → Desktop · Tablet · Mobile (3). Advanced ON → adds Wide + Compact (5).
 * The switcher intersects this with its own ordered `VIEWPORT_OPTS`, so the
 * returned membership — not the order here — is what matters.
 */
export function visibleViewportTiers(advanced: boolean): EditDevice[] {
  if (!advanced) return [...DEFAULT_VIEWPORT_TIERS];
  return [...DEFAULT_VIEWPORT_TIERS, ...ADVANCED_ONLY_VIEWPORT_TIERS];
}

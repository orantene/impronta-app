/**
 * Synthetic section ID for the live header element.
 *
 * Both the server-rendered <PublicHeader> (when in edit mode) and the
 * client-rendered <InspectorDock> reference this. It must NOT live in
 * a module that imports server-only APIs (next/headers, server actions,
 * etc.) — Next.js follows the import graph, and a server-only dep
 * smuggled through this constant breaks the client bundle.
 */
export const SITE_HEADER_SELECTION_ID = "__site_header__";

/**
 * WS-A A2 — should the inspector take the LEGACY synthetic site-header
 * special-case (short-circuit the section load → render <SiteHeaderInspector>)?
 *
 * The synthetic `SITE_HEADER_SELECTION_ID` is only ever produced on the
 * legacy slot-rendered shell path (`PublishedShell` emits it as the header
 * slot's `data-section-id`). On the dedicated fully-freeform `site_shell`
 * SURFACE the header/footer are first-class freeform section nodes that must
 * stay selectable + route through the normal node/section inspector — so the
 * special-case must go inert there.
 *
 * Pure + parity-safe: when `surfaceKind !== "site_shell"` (every legacy path,
 * including the homepage with the routing flag OFF) this returns exactly
 * `selectedSectionId === SITE_HEADER_SELECTION_ID` — byte-identical to the
 * prior inline check.
 */
export function isLegacySiteHeaderSelection(input: {
  selectedSectionId: string | null;
  surfaceKind: string;
}): boolean {
  if (input.surfaceKind === "site_shell") return false;
  return input.selectedSectionId === SITE_HEADER_SELECTION_ID;
}

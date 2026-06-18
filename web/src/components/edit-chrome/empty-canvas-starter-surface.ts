/**
 * ONB-1 — surface parameterization for the shared EmptyCanvasStarter.
 *
 * The starter picker is built ONCE and adopted by every empty editable surface.
 * The ONLY per-surface difference is WHICH design starters are offered (a
 * single-subject talent profile/site should not be offered roster/agency homes,
 * and vice-versa). That selection is a pure function of the surface — derived
 * from a capability/config value (the EditContext `surfaceKind`), NEVER a
 * `surfaceKind === ...` branch inside the component's render/apply logic.
 *
 * Kept in a tiny standalone (client-safe, no React) module so the per-surface
 * starter-set selection is unit-testable in isolation (gate requirement).
 */

import type { PageDesignSummary } from "@/lib/site-admin/builder-node/page-designs/summaries";
import type { BuilderSurfaceKind } from "@/lib/site-admin/builder-core/surface-kind";
import type { TextToPageSurface } from "@/lib/site-admin/builder-core/ai/preset-plan";

/**
 * The audience a starter surface serves. Maps onto the design `target`
 * vocabulary (talent | workspace | both) to pick the offered starter set:
 *   - `workspace`    → agency / multi-subject homes  → target workspace|both
 *   - `talent`       → single-subject profile         → target talent|both
 *   - `talent-site`  → single-subject multi-page site → target talent|both
 */
export type EmptyCanvasStarterSurface = "workspace" | "talent" | "talent-site";

/**
 * Resolve the starter surface from the builder `surfaceKind` (a config value on
 * the EditContext). This is the single place the kind is read — the component
 * consumes the resolved surface, so a fifth surface inherits the picker by
 * mapping its kind here once, not by editing the component.
 *
 * `homepage` returns `undefined` = the FULL design set (no audience filter): the
 * agency storefront homepage is the historical mount and its behavior is
 * preserved byte-for-byte. Inner `cms_page` storefront pages, `site_shell`
 * (header/footer) and `platform_lab` (authoring playground) map to `workspace`
 * (agency + generic starters). `talent_page` is BOTH the /t/[code] profile AND
 * the /t/site/[slug] pages → `talent`; the caller can override to `talent-site`
 * for the multi-page site mount (same starter set, distinct label downstream).
 */
export function starterSurfaceForKind(
  kind: BuilderSurfaceKind,
): EmptyCanvasStarterSurface | undefined {
  switch (kind) {
    case "talent_page":
      return "talent";
    case "homepage":
      // Full set — preserve the historical homepage picker exactly.
      return undefined;
    case "cms_page":
    case "site_shell":
    case "platform_lab":
    default:
      return "workspace";
  }
}

/**
 * The set of design `target` values a surface is allowed to show. `talent` and
 * `talent-site` surfaces show single-subject (talent) + generic (both) starters;
 * `workspace` surfaces show agency (workspace) + generic (both) starters.
 */
export function targetsForStarterSurface(
  surface: EmptyCanvasStarterSurface,
): ReadonlyArray<PageDesignSummary["target"]> {
  switch (surface) {
    case "talent":
    case "talent-site":
      return ["talent", "both"];
    case "workspace":
    default:
      return ["workspace", "both"];
  }
}

/**
 * Filter the full design registry down to the starters appropriate for a
 * surface. When `surface` is undefined (legacy homepage mount with no explicit
 * surface) ALL designs are returned — the homepage's historical behavior is
 * preserved byte-for-byte.
 */
export function starterSummariesForSurface(
  summaries: ReadonlyArray<PageDesignSummary>,
  surface: EmptyCanvasStarterSurface | undefined,
): ReadonlyArray<PageDesignSummary> {
  if (!surface) return summaries;
  const allowed = new Set(targetsForStarterSurface(surface));
  return summaries.filter((s) => allowed.has(s.target));
}

/**
 * AI-1 — map the resolved EmptyCanvasStarter surface to the text-to-page
 * composer's surface vocabulary, so the "Compose with AI" affordance offers the
 * SAME preset audience the manual picker does. Kept here (the single place the
 * starter surface is reasoned about) so the AI path inherits the audience split
 * with no surfaceKind branch in the component. `undefined` = the homepage/full
 * set → `workspace` (the homepage is an agency surface).
 */
export function textToPageSurfaceForStarterSurface(
  surface: EmptyCanvasStarterSurface | undefined,
): TextToPageSurface {
  switch (surface) {
    case "talent":
      return "talent";
    case "talent-site":
      return "talent-site";
    case "workspace":
    default:
      return "workspace";
  }
}

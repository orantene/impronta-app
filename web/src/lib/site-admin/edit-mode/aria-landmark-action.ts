"use server";

/**
 * Phase 10 (S-17) — ARIA landmark requirements check.
 *
 * Quick pass over the published storefront markup expectations:
 *   - exactly one <main>
 *   - one <header role="banner">
 *   - one <footer role="contentinfo">
 *   - <nav> elements have either aria-label or aria-labelledby when there
 *     are 2+ on the page (otherwise screen-reader users hear "navigation,
 *     navigation, navigation" without context)
 *   - sections used as page regions get accessible names when the section
 *     type is known to render `aria-labelledby` from a headline (we
 *     surface a warning when the headline is empty, since the region
 *     becomes unnamed)
 *
 * The check runs against the section composition in the DB — no live
 * DOM crawl. That's deliberate: we want a predictable per-section answer
 * that operators can act on inside the inspector. The `<header>` /
 * `<main>` / `<footer>` requirements come from `agency-home-storefront`
 * which always renders those, so they're informational pass markers.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { listSectionsForStaff } from "@/lib/site-admin/server/sections-reads";

export interface LandmarkFinding {
  severity: "high" | "med" | "low" | "ok";
  category: "landmark" | "naming" | "structure";
  message: string;
  /** When the finding pinpoints a specific section, this is its id. */
  sectionId?: string;
  sectionTypeKey?: string;
}

export type LandmarkCheckResult =
  | { ok: true; findings: ReadonlyArray<LandmarkFinding> }
  | { ok: false; error: string };

/** Section types that render an aria-labelledby pointing at the headline.
 *  When their headline is empty, the landmark gets no accessible name. */
const NAMED_REGION_TYPES = new Set<string>([
  "hero",
  "hero_split",
  "cta_banner",
  "category_grid",
  "destinations_mosaic",
  "testimonials_trio",
  "values_trio",
  "process_steps",
  "image_copy_alternating",
  "stats",
  "faq_accordion",
  "split_screen",
  "timeline",
  "pricing_grid",
  "team_grid",
  "contact_form",
  "before_after",
  "content_tabs",
  "comparison_table",
  "blog_index",
  "blog_detail",
  "magazine_layout",
  "scroll_carousel",
  "masonry",
  "logo_cloud",
  "image_orbit",
  "video_reel",
  "map_overlay",
  "donation_form",
  "event_listing",
  "lookbook",
  "booking_widget",
  "sticky_scroll",
]);

/** Section types that render their own <nav>. Two or more on a page need
 *  distinguishing labels. */
const NAV_TYPES = new Set<string>(["anchor_nav"]);

export async function runAriaLandmarkCheck(): Promise<LandmarkCheckResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const rows = await listSectionsForStaff(auth.supabase, scope.tenantId);

  const findings: LandmarkFinding[] = [];

  // Storefront layout always renders one of each — informational passes.
  findings.push({
    severity: "ok",
    category: "landmark",
    message: "Page renders one <header role='banner'>, one <main>, and one <footer role='contentinfo'> via the storefront layout.",
  });

  // Per-section checks.
  let navCount = 0;
  for (const r of rows) {
    if (NAV_TYPES.has(r.section_type_key)) navCount += 1;
    if (NAMED_REGION_TYPES.has(r.section_type_key)) {
      const props = (r.props_jsonb ?? {}) as Record<string, unknown>;
      const headline =
        typeof props.headline === "string"
          ? (props.headline as string).trim()
          : "";
      if (headline.length === 0) {
        findings.push({
          severity: "med",
          category: "naming",
          message: `Section "${r.name}" renders as an ARIA region but has no headline — screen readers will announce it without a label.`,
          sectionId: r.id,
          sectionTypeKey: r.section_type_key,
        });
      }
    }
  }

  if (navCount > 1) {
    findings.push({
      severity: "med",
      category: "naming",
      message: `${navCount} <nav> sections on the page — each needs a distinguishing aria-label so screen readers can tell them apart (e.g. "Page sections" vs. "Footer links").`,
    });
  }

  // Quick structure sanity: a page with no headed regions is suspicious.
  const headedCount = rows.filter((r) => NAMED_REGION_TYPES.has(r.section_type_key)).length;
  if (headedCount === 0 && rows.length > 0) {
    findings.push({
      severity: "low",
      category: "structure",
      message: "No nameable region sections in the composition — consider adding at least one section type with a headline so screen-reader users have a heading-list to navigate by.",
    });
  }

  return { ok: true, findings };
}

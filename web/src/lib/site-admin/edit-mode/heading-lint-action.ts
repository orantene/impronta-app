"use server";

/**
 * Phase 10 — props-aware heading lint loader.
 *
 * Reads every section in the tenant's roster and returns only the
 * heading-bearing prop value for each (mostly `headline`, sometimes
 * `eyebrow` for press_strip). Keeps the payload tiny — the navigator
 * uses this to upgrade the structural-only HeadingLintBadge into a
 * props-aware variant that knows when a section's headline is empty.
 *
 * Cache: none — the operator is editing live; we want fresh values
 * every time the navigator opens or the section list changes.
 *
 * RCA 2026-05-13: `requireTenantScope()` was unreliable from server
 * actions in dev (localhost `kind: "app"` context strips the
 * `x-impronta-tenant-id` header, and the active-tenant cookie may not
 * be set when the operator navigated directly to the edit URL). The fix
 * accepts an explicit `tenantId` from the caller (the edit chrome always
 * knows which tenant it is editing) and validates it against the actor's
 * memberships instead of relying on header/cookie scope resolution.
 * See web/docs/qa-evidence/outline-probe-rca-2026-05-13.md.
 */

import { requireStaff } from "@/lib/server/action-guards";
import { getCurrentUserTenants } from "@/lib/saas/tenant";
import {
  listSectionsByIdsForStaff,
  listSectionsForStaff,
} from "@/lib/site-admin/server/sections-reads";

export interface SectionHeadingProbe {
  sectionId: string;
  sectionTypeKey: string;
  headlineText: string;
}

export type HeadingProbeResult =
  | { ok: true; sections: ReadonlyArray<SectionHeadingProbe> }
  | { ok: false; error: string };

// Mirror of HEADING_MAP in heading-hierarchy.ts — kept here to avoid a
// client-side import in the consuming navigator.
const HEADLINE_PROP_BY_TYPE: Record<string, "headline" | "eyebrow"> = {
  hero: "headline",
  cta_banner: "headline",
  category_grid: "headline",
  destinations_mosaic: "headline",
  testimonials_trio: "headline",
  process_steps: "headline",
  image_copy_alternating: "headline",
  values_trio: "headline",
  press_strip: "eyebrow",
  gallery_strip: "headline",
  featured_talent: "headline",
  trust_strip: "headline",
  stats: "headline",
  faq_accordion: "headline",
  split_screen: "headline",
  timeline: "headline",
  pricing_grid: "headline",
  team_grid: "headline",
  contact_form: "headline",
  before_after: "headline",
  content_tabs: "headline",
  code_embed: "headline",
  blog_index: "headline",
  comparison_table: "headline",
  // M12
  lottie: "headline",
  sticky_scroll: "headline",
  masonry: "headline",
  scroll_carousel: "headline",
  magazine_layout: "headline",
  hero_split: "headline",
  // M13
  logo_cloud: "headline",
  image_orbit: "headline",
  video_reel: "headline",
  map_overlay: "headline",
  donation_form: "headline",
  code_snippet: "headline",
  event_listing: "headline",
  lookbook: "headline",
  booking_widget: "headline",
  // blog_detail uses a different prop name; treated separately below.
};

export async function loadHeadingProbeForLint(
  sectionIds: ReadonlyArray<string>,
  tenantId: string,
): Promise<HeadingProbeResult> {
  const auth = await requireStaff();
  if (!auth.ok) {
    // QA 2026-05-13 — surface auth-gate failures in dev so the
    // operator can root-cause an empty Outline from the server console
    // rather than the silent "No headings yet" UX. Tenant-scope check
    // was removed when this fn switched to taking tenantId explicitly
    // — see comment block below.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[heading-probe] auth gate failed — Outline view will fall back to display names:",
        auth.error,
      );
    }
    return { ok: false, error: auth.error };
  }

  // Validate the caller is actually staff of the requested tenant.
  // We accept tenantId explicitly (from the edit chrome, which always knows
  // which tenant it is editing) instead of resolving it from cookies/headers.
  // The header/cookie path was unreliable in dev: on localhost, the middleware
  // host-context is "app" which strips the x-impronta-tenant-id header; the
  // active-tenant cookie may not be set if the operator navigated directly to
  // the edit URL without going through the workspace switcher.
  // See: web/docs/qa-evidence/outline-probe-rca-2026-05-13.md
  const memberships = await getCurrentUserTenants();
  const isMember = memberships.some((m) => m.tenant_id === tenantId);
  if (!isMember) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[heading-probe] caller is not staff of tenant",
        tenantId,
        "— Outline view will fall back to display names",
      );
    }
    return { ok: false, error: "Not staff of tenant." };
  }

  const requestedIds = Array.from(new Set(sectionIds.filter(Boolean)));
  const rows =
    requestedIds.length > 0
      ? await listSectionsByIdsForStaff(auth.supabase, tenantId, requestedIds)
      : await listSectionsForStaff(auth.supabase, tenantId);
  const sections: SectionHeadingProbe[] = [];
  for (const r of rows) {
    const props = (r.props_jsonb as Record<string, unknown> | null) ?? {};
    let text = "";
    if (r.section_type_key === "blog_detail") {
      const v = props.title;
      text = typeof v === "string" ? v : "";
    } else {
      const propKey = HEADLINE_PROP_BY_TYPE[r.section_type_key];
      if (!propKey) continue;
      const v = props[propKey];
      text = typeof v === "string" ? v : "";
      // Hero sections may use the slides extension: headline lives in
      // slides[0].headline instead of (or as well as) the top-level field.
      // Fall back to the first slide's headline when the top-level is empty.
      if (!text && r.section_type_key === "hero") {
        const slides = props.slides as Array<Record<string, unknown>> | null;
        const firstSlide = Array.isArray(slides) ? slides[0] : null;
        const slideHeadline = firstSlide?.headline;
        if (typeof slideHeadline === "string" && slideHeadline.trim()) {
          text = slideHeadline.trim();
        }
      }
    }
    sections.push({
      sectionId: r.id,
      sectionTypeKey: r.section_type_key,
      headlineText: text,
    });
  }
  return { ok: true, sections };
}

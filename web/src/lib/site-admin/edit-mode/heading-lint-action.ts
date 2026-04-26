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
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { listSectionsForStaff } from "@/lib/site-admin/server/sections-reads";

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
  // blog_detail uses a different prop name; treated separately below.
};

export async function loadHeadingProbeForLint(): Promise<HeadingProbeResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const rows = await listSectionsForStaff(auth.supabase, scope.tenantId);
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
    }
    sections.push({
      sectionId: r.id,
      sectionTypeKey: r.section_type_key,
      headlineText: text,
    });
  }
  return { ok: true, sections };
}

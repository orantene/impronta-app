import {
  getSectionType,
  listAgencyVisibleSections,
  type SectionTypeKey,
} from "./registry";
import type { SectionRegistryEntry } from "./types";

export type BuilderSiteKind = "agency" | "hub" | "talent_personal";

export const TALENT_PERSONAL_SECTION_TYPE_KEYS = [
  "hero",
  "cta_banner",
  "editorial_split_hero",
  "testimonials_trio",
  "image_copy_alternating",
  "values_trio",
  "press_strip",
  "gallery_strip",
  "marquee",
  "stats",
  "faq_accordion",
  "split_screen",
  "timeline",
  "anchor_nav",
  "before_after",
  "content_tabs",
  "masonry",
  "scroll_carousel",
  "hero_split",
  "logo_cloud",
  "image_orbit",
  "video_reel",
  "lookbook",
  "booking_widget",
  "blank_section",
] as const satisfies readonly SectionTypeKey[];

export const TENANT_ONLY_SECTION_TYPE_KEYS = [
  "category_grid",
  "talent_type_grid",
  "hero_search",
  "location_discovery",
  "destinations_mosaic",
  "featured_talent",
  "directory",
  "pricing_grid",
  "team_grid",
  "contact_form",
  "blog_index",
  "comparison_table",
  "blog_detail",
  "magazine_layout",
  "map_overlay",
  "donation_form",
  "event_listing",
  "site_header",
  "site_footer",
] as const satisfies readonly SectionTypeKey[];

const TALENT_PERSONAL_SECTION_SET = new Set<SectionTypeKey>(
  TALENT_PERSONAL_SECTION_TYPE_KEYS,
);

export function sectionAllowedForSiteKind(
  sectionTypeKey: string,
  siteKind: BuilderSiteKind,
): boolean {
  const entry = getSectionType(sectionTypeKey);
  if (!entry) return false;
  if (!entry.meta.visibleToAgency) return false;
  if (siteKind === "talent_personal") {
    return TALENT_PERSONAL_SECTION_SET.has(sectionTypeKey as SectionTypeKey);
  }
  return true;
}

export function listVisibleSectionsForSiteKind(
  siteKind: BuilderSiteKind,
): ReadonlyArray<SectionRegistryEntry> {
  return listAgencyVisibleSections().filter((entry) =>
    sectionAllowedForSiteKind(entry.meta.key, siteKind),
  );
}

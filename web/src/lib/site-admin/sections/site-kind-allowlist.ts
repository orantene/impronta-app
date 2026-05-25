import {
  getSectionType,
  listAgencyVisibleSections,
  type SectionTypeKey,
} from "./registry";
import type { SectionRegistryEntry } from "./types";
import { isTalentPersonalSectionTypeKey } from "./talent-personal-section-keys";

export type BuilderSiteKind = "agency" | "hub" | "talent_personal";

export { TALENT_PERSONAL_SECTION_TYPE_KEYS } from "./talent-personal-section-keys";

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

export function sectionAllowedForSiteKind(
  sectionTypeKey: string,
  siteKind: BuilderSiteKind,
): boolean {
  const entry = getSectionType(sectionTypeKey);
  if (!entry) return false;
  if (!entry.meta.visibleToAgency) return false;
  if (siteKind === "talent_personal") {
    return isTalentPersonalSectionTypeKey(sectionTypeKey);
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

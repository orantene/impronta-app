import type { TalentSiteActivationState } from "./site-management-types";

export type ActivationRow = {
  site_slug?: string | null;
  site_published_at?: string | null;
  theme_design_slug?: string | null;
  theme_look_slug?: string | null;
} | null;

/**
 * Pure mapping of the talent's own `talent_sites` row to the activation state
 * every website surface reads (F53).
 *
 * `canManage` = the plan lets the talent edit OR pick a design. It used to be
 * `personalSiteEdit` only, and that capability is Max-only while
 * TALENT_FREE_WEBSITE_ENABLED is off (local/preview builds). A free talent
 * who applied a design then read as canManage=false with no design, so the
 * pill said "Activate" and Today showed no card. The row is always read;
 * a set theme_design_slug is an applied design whatever the plan says.
 */
export function activationFromRow(
  row: ActivationRow,
  caps: { personalSiteEdit: boolean; personalSiteDesignPresets: boolean },
): TalentSiteActivationState {
  // A NULL slug is not a usable site (pre-existing rows look like that).
  const slug = row?.site_slug ?? null;
  const hasSite = Boolean(slug);
  const isPublished = hasSite && Boolean(row?.site_published_at);
  const themeDesignSlug = row?.theme_design_slug?.trim() || null;
  return {
    canManage: caps.personalSiteEdit || caps.personalSiteDesignPresets || themeDesignSlug != null,
    hasSite,
    isPublished,
    siteSlug: slug,
    themeDesignSlug,
    themeLookSlug: row?.theme_look_slug?.trim() || null,
  };
}

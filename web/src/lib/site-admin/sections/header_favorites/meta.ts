import type { SectionMeta } from "../types";

/**
 * WS-A A5 — header FAVORITES widget embed. Wraps the live header's saved/favorites
 * affordance (the ♥ bookmark → favorites list). Shell-only (not in the page
 * section picker).
 */
export const headerFavoritesMeta: SectionMeta = {
  key: "header_favorites",
  label: "Header favorites",
  description:
    "The header's saved-talent / favorites affordance (bookmark icon). Live on the published shell; a placeholder chip in the editor.",
  businessPurpose: "feature",
  visibleToAgency: false,
  category: "navigation",
  inDefault: false,
  // Async Component (resolves the tenant's locale URL grammar at render time).
  hasLiveData: true,
};

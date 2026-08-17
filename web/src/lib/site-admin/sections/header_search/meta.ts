import type { SectionMeta } from "../types";

/**
 * WS-A A5 — header SEARCH widget embed. Wraps the live header's directory-search
 * affordance (the Search icon → /directory). `visibleToAgency:false` keeps it out
 * of the page section picker; it is surfaced ONLY as a curated header-widget
 * embed preset in the site-shell builder gallery.
 */
export const headerSearchMeta: SectionMeta = {
  key: "header_search",
  label: "Header search",
  description:
    "The header's talent-search affordance (search icon → directory). Live on the published shell; a placeholder chip in the editor.",
  businessPurpose: "feature",
  visibleToAgency: false,
  category: "navigation",
  inDefault: false,
  // Async Component (resolves the tenant's locale URL grammar at render time).
  hasLiveData: true,
};

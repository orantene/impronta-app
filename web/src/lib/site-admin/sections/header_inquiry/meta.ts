import type { SectionMeta } from "../types";

/**
 * WS-A A5 — header INQUIRY widget embed. Wraps the live header's inquiry-cart
 * affordance (the ✈ plane icon → inquiry drawer) via the SAME
 * `PublicHeaderDiscoveryTools` widget the legacy header mounts. Shell-only.
 */
export const headerInquiryMeta: SectionMeta = {
  key: "header_inquiry",
  label: "Header inquiry",
  description:
    "The header's inquiry-cart affordance (plane icon → inquiry drawer). Live on the published shell; a placeholder chip in the editor.",
  businessPurpose: "conversion",
  visibleToAgency: false,
  category: "navigation",
  inDefault: false,
  // Async Component (reads favorites + saved-talent counts at render).
  hasLiveData: true,
};

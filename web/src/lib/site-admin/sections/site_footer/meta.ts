import type { SectionMeta } from "../types";

export const siteFooterMeta: SectionMeta = {
  key: "site_footer",
  // W2-T2 — server data-loader (the shell footer resolves tenant/nav data at
  // render time): an in-editor prop edit must still router.refresh() to repaint.
  hasLiveData: true,
  label: "Site footer",
  description:
    "The footer that wraps every page on this tenant — brand recap, link columns, social, legal copy. Edited as a section, published as part of the site shell.",
  // Footer is the only purpose that maps cleanly today.
  businessPurpose: "footer",
  /**
   * Phase B.1: NOT visible in the section-add picker. Site footer is
   * managed exclusively via the site_shell row's footer slot (one per
   * tenant per locale).
   */
  visibleToAgency: false,
  category: "navigation",
  inDefault: false,
};

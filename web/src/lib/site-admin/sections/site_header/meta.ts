import type { SectionMeta } from "../types";

export const siteHeaderMeta: SectionMeta = {
  key: "site_header",
  label: "Site header",
  description:
    "The header that wraps every page on this tenant — brand mark, primary navigation, optional CTA. Edited as a section, published as part of the site shell.",
  // No "navigation" enum value yet — use "feature" until we add a shell
  // bucket. visibleToAgency=false keeps it out of the picker either way.
  businessPurpose: "feature",
  /**
   * Phase B.1: NOT visible in the section-add picker. Site header is
   * managed exclusively via the site_shell row's header slot (one per
   * tenant per locale). Add-section UX should never offer it as a
   * free-floating section a tenant could place inside a page body.
   */
  visibleToAgency: false,
  category: "navigation",
  inDefault: false,
};
